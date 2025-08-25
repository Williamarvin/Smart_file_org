import * as fs from 'fs/promises';
import * as path from 'path';
import { createWorker } from 'tesseract.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { nanoid } from 'nanoid';
import * as os from 'os';

const execAsync = promisify(exec);

export class OCRService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'ocr-temp');
  }

  /**
   * Extract text from a scanned PDF using OCR
   */
  async extractTextFromScannedPDF(pdfPath: string): Promise<string> {
    console.log(`🔍 Starting OCR extraction for: ${path.basename(pdfPath)}`);
    
    try {
      // Ensure temp directory exists
      await fs.mkdir(this.tempDir, { recursive: true });
      
      // Generate unique ID for this extraction
      const extractionId = nanoid();
      const outputDir = path.join(this.tempDir, extractionId);
      await fs.mkdir(outputDir, { recursive: true });
      
      // Convert PDF to images using pdftoppm (from pdf-poppler)
      console.log('📄 Converting PDF pages to images...');
      const imagePrefix = path.join(outputDir, 'page');
      
      // Use pdftoppm to convert PDF to PNG images
      // -png: output PNG format
      // -r 300: 300 DPI resolution for better OCR accuracy
      const convertCommand = `pdftoppm -png -r 300 "${pdfPath}" "${imagePrefix}"`;
      
      try {
        await execAsync(convertCommand);
      } catch (error) {
        console.error('Error converting PDF to images:', error);
        // Fallback: try with lower resolution
        const fallbackCommand = `pdftoppm -png -r 150 "${pdfPath}" "${imagePrefix}"`;
        await execAsync(fallbackCommand);
      }
      
      // Get list of generated image files
      const files = await fs.readdir(outputDir);
      const imageFiles = files
        .filter(f => f.endsWith('.png'))
        .sort(); // Sort to maintain page order
      
      if (imageFiles.length === 0) {
        throw new Error('No images generated from PDF');
      }
      
      console.log(`📸 Generated ${imageFiles.length} images from PDF`);
      
      // Initialize Tesseract worker
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const percent = Math.round(m.progress * 100);
            if (percent % 20 === 0) { // Log every 20%
              console.log(`OCR Progress: ${percent}%`);
            }
          }
        }
      });
      
      // Process each image with OCR
      const pageTexts: string[] = [];
      
      for (let i = 0; i < imageFiles.length; i++) {
        const imagePath = path.join(outputDir, imageFiles[i]);
        console.log(`🔤 Processing page ${i + 1}/${imageFiles.length}...`);
        
        try {
          const { data: { text } } = await worker.recognize(imagePath);
          
          if (text && text.trim()) {
            pageTexts.push(`--- Page ${i + 1} ---\n${text.trim()}`);
          }
        } catch (pageError) {
          console.error(`Error processing page ${i + 1}:`, pageError);
          pageTexts.push(`--- Page ${i + 1} ---\n[OCR failed for this page]`);
        }
      }
      
      // Terminate worker
      await worker.terminate();
      
      // Clean up temporary files
      try {
        for (const file of imageFiles) {
          await fs.unlink(path.join(outputDir, file));
        }
        await fs.rmdir(outputDir);
      } catch (cleanupError) {
        console.error('Error cleaning up temp files:', cleanupError);
      }
      
      // Combine all page texts
      const fullText = pageTexts.join('\n\n');
      
      console.log(`✅ OCR extraction complete: ${fullText.length} characters extracted`);
      
      return fullText;
      
    } catch (error) {
      console.error('OCR extraction failed:', error);
      throw error;
    }
  }
  
  /**
   * Check if a PDF needs OCR (is scanned/image-based)
   */
  async needsOCR(pdfBuffer: Buffer, extractedText: string): Promise<boolean> {
    // If we got meaningful text from regular extraction, no OCR needed
    const cleanedText = extractedText.trim();
    if (cleanedText.length > 100) {
      return false;
    }
    
    // Check if it's mostly whitespace
    const visibleChars = extractedText.match(/[^\s]/g);
    if (!visibleChars || visibleChars.length < 10) {
      console.log('PDF appears to be scanned (no extractable text), OCR needed');
      return true;
    }
    
    return false;
  }
}

export const ocrService = new OCRService();