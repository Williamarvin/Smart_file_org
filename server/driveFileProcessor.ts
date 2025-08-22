import { GoogleDriveService } from './googleDriveService';
import { storage } from './storage';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { getOpenAIClient } from './openai';
import { spawn } from 'child_process';
import ffmpeg from 'ffmpeg-static';

/**
 * Service to download and process files from Google Drive
 * Replaces placeholder file content with actual file content
 */
export class DriveFileProcessor {
  private driveService: GoogleDriveService;
  private tempDir: string;

  constructor() {
    this.driveService = new GoogleDriveService();
    this.tempDir = path.join(os.tmpdir(), 'drive-downloads');
  }

  /**
   * Process all files with Google Drive links
   */
  public async processAllDriveFiles(userId: string): Promise<{
    processed: number;
    failed: number;
    skipped: number;
  }> {
    console.log('Starting Google Drive file processing...');
    
    // Get all files with Google Drive storage type
    const driveFiles = await storage.getFilesByStorageType('google-drive', userId);
    console.log(`Found ${driveFiles.length} files with Google Drive links`);

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    // Create temp directory if it doesn't exist
    await fs.mkdir(this.tempDir, { recursive: true });

    for (const file of driveFiles) {
      try {
        const result = await this.processSingleFile(file);
        if (result === 'processed') processed++;
        else if (result === 'failed') failed++;
        else skipped++;
      } catch (error) {
        console.error(`Error processing file ${file.id}:`, error);
        failed++;
      }
    }

    // Clean up temp directory
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning temp directory:', error);
    }

    console.log(`✅ Drive file processing complete: ${processed} processed, ${failed} failed, ${skipped} skipped`);
    return { processed, failed, skipped };
  }

  /**
   * Process a single file from Google Drive
   */
  private async processSingleFile(file: any): Promise<'processed' | 'failed' | 'skipped'> {
    // Skip if already has real content (not a placeholder)
    if (file.content && !file.content.startsWith('File reference:')) {
      console.log(`Skipping ${file.filename} - already has content`);
      return 'skipped';
    }

    // Get Google Drive URL
    const driveUrl = file.googleDriveUrl || file.url;
    if (!driveUrl) {
      console.log(`Skipping ${file.filename} - no Google Drive URL`);
      return 'skipped';
    }

    console.log(`Processing ${file.filename} from ${driveUrl}`);

    try {
      // Download file from Google Drive
      const fileBuffer = await this.driveService.downloadFile(driveUrl);
      if (!fileBuffer) {
        console.error(`Failed to download ${file.filename}`);
        return 'failed';
      }

      // Save to temp file
      const tempFilePath = path.join(this.tempDir, `${uuidv4()}-${file.filename}`);
      await fs.writeFile(tempFilePath, fileBuffer);

      // Extract content based on file type
      let extractedContent = '';
      const fileExt = path.extname(file.filename).toLowerCase();

      if (fileExt === '.docx') {
        // Extract text from DOCX
        const result = await mammoth.extractRawText({ path: tempFilePath });
        extractedContent = result.value;
        console.log(`✅ Extracted ${extractedContent.length} characters from DOCX`);
      } else if (fileExt === '.pdf') {
        // Extract text from PDF
        const pdfBuffer = await fs.readFile(tempFilePath);
        const pdfData = await pdfParse(pdfBuffer);
        extractedContent = pdfData.text;
        console.log(`✅ Extracted ${extractedContent.length} characters from PDF`);
      } else if (fileExt === '.txt' || fileExt === '.md') {
        // Read text files directly
        extractedContent = fileBuffer.toString('utf-8');
        console.log(`✅ Read ${extractedContent.length} characters from text file`);
      } else if (['.mp4', '.avi', '.mov', '.mkv'].includes(fileExt)) {
        // Transcribe video content using OpenAI Whisper
        try {
          console.log(`📹 Processing video for transcription: ${file.filename}`);
          
          // Extract audio from video using ffmpeg
          const audioPath = path.join(this.tempDir, `${uuidv4()}.mp3`);
          
          await new Promise<void>((resolve, reject) => {
            const ffmpegPath = ffmpeg || 'ffmpeg';
            const ffmpegProcess = spawn(ffmpegPath, [
              '-i', tempFilePath,
              '-vn', // no video
              '-acodec', 'mp3',
              '-ab', '128k',
              '-ar', '44100',
              '-y', // overwrite output
              audioPath
            ]);
            
            ffmpegProcess.on('close', (code) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`FFmpeg exited with code ${code}`));
              }
            });
            
            ffmpegProcess.on('error', reject);
          });
          
          console.log(`🎵 Audio extracted, transcribing with Whisper...`);
          
          // Read audio file for Whisper
          const audioBuffer = await fs.readFile(audioPath);
          
          // Create a File object for OpenAI
          const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mp3' });
          
          // Get OpenAI client and transcribe using Whisper
          const openai = getOpenAIClient();
          const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            language: "en" // You can make this dynamic based on content
          });
          
          // Get video metadata for context
          let metadataInfo = '';
          try {
            const metadata = await new Promise<any>((resolve) => {
              const ffprobeProcess = spawn('ffprobe', [
                '-v', 'error',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                tempFilePath
              ]);
              
              let output = '';
              ffprobeProcess.stdout.on('data', (data: Buffer) => {
                output += data.toString();
              });
              
              ffprobeProcess.on('close', () => {
                try {
                  resolve(JSON.parse(output));
                } catch (e) {
                  resolve(null);
                }
              });
            });
            
            if (metadata?.format?.duration) {
              const seconds = parseFloat(metadata.format.duration);
              const minutes = Math.floor(seconds / 60);
              const remainingSeconds = Math.floor(seconds % 60);
              metadataInfo = `Duration: ${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
            }
          } catch (e) {
            // Ignore metadata errors
          }
          
          // Build content with transcript
          extractedContent = `Video Title: ${file.filename}\n` +
            (metadataInfo ? `${metadataInfo}\n` : '') +
            `\n--- Transcript ---\n\n${transcription.text}`;
          
          console.log(`✅ Transcribed video - ${transcription.text.length} characters`);
          
          // Clean up audio file
          try {
            await fs.unlink(audioPath);
          } catch (error) {
            console.error('Error deleting audio file:', error);
          }
        } catch (error) {
          // Fallback if transcription fails
          console.error('Video transcription error:', error);
          extractedContent = `Video file: ${file.filename}\nSize: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB\n\nNote: Transcription failed. The video may not contain clear audio or the service may be temporarily unavailable.`;
          console.log(`⚠️ Could not transcribe video, stored basic metadata`);
        }
      } else if (['.pptx', '.ppt'].includes(fileExt)) {
        // PowerPoint files need special handling - for now, mark as binary
        extractedContent = `PowerPoint presentation: ${file.filename}\nSize: ${fileBuffer.length} bytes`;
        console.log(`✅ Updated PowerPoint file metadata`);
      } else {
        // Unknown file type - store basic metadata
        extractedContent = `File: ${file.filename}\nType: ${fileExt}\nSize: ${fileBuffer.length} bytes`;
        console.log(`⚠️ Unknown file type ${fileExt}, stored metadata only`);
      }

      // Update file in database with actual content
      if (extractedContent && extractedContent.length > 0) {
        await storage.updateFileContent(file.id, {
          content: extractedContent,
          size: fileBuffer.length,
          processingStatus: 'completed',
          processedAt: new Date()
        });
        
        // Generate AI metadata from the transcribed content
        try {
          console.log('🤖 Generating AI metadata from transcribed content...');
          const { extractFileMetadata } = await import('./openai');
          const aiMetadata = await extractFileMetadata(extractedContent, file.filename);
          
          // Check if metadata already exists and update it
          try {
            const existingMetadata = await storage.getFileMetadata(file.id, file.userId);
            if (existingMetadata) {
              // Update existing metadata with AI-generated content
              await storage.updateFileMetadata(file.id, file.userId, {
                extractedText: extractedContent,
                summary: aiMetadata.summary || extractedContent.substring(0, 500),
                keywords: aiMetadata.keywords || [],
                topics: aiMetadata.topics || [],
                categories: aiMetadata.categories || ['Education']
              });
              console.log(`✅ Updated existing metadata for ${file.filename}`);
            } else {
              // Only create if file actually exists in database
              console.log(`⚠️ No existing metadata for ${file.filename}, skipping metadata creation`);
            }
          } catch (metadataError) {
            console.error(`Metadata error for ${file.filename}:`, metadataError);
            // Don't create new metadata if there's an error, just log it
          }
          
          console.log(`✅ Generated AI metadata: ${aiMetadata.summary?.substring(0, 100)}...`);
        } catch (error) {
          console.error('Error generating AI metadata:', error);
          // Don't try to create metadata on error
        }
        
        console.log(`✅ Updated ${file.filename} with ${extractedContent.length} characters of content`);
      }

      // Clean up temp file
      try {
        await fs.unlink(tempFilePath);
      } catch (error) {
        console.error('Error deleting temp file:', error);
      }

      return 'processed';
    } catch (error) {
      console.error(`Error processing ${file.filename}:`, error);
      return 'failed';
    }
  }

  /**
   * Process a specific file by ID
   */
  public async processFileById(fileId: string, userId: string = "demo-user"): Promise<boolean> {
    try {
      const file = await storage.getFile(fileId, userId);
      if (!file) {
        console.error(`File ${fileId} not found`);
        return false;
      }

      const result = await this.processSingleFile(file);
      return result === 'processed';
    } catch (error) {
      console.error(`Error processing file ${fileId}:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const driveFileProcessor = new DriveFileProcessor();