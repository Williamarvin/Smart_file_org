import { GoogleDriveService } from './googleDriveService';
import { storage } from './storage';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

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
        // For videos, we can't extract content directly but we can update metadata
        extractedContent = `Video file: ${file.filename}\nSize: ${fileBuffer.length} bytes\nNote: Video transcription requires additional processing`;
        console.log(`✅ Updated video file metadata`);
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
  public async processFileById(fileId: string): Promise<boolean> {
    try {
      const file = await storage.getFile(fileId);
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