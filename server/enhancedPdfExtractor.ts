import PDFParse from 'pdf-parse';
import * as fs from 'fs/promises';
import { googleVisionOCR } from './googleVisionOCR';
import Tesseract from 'tesseract.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Enhanced PDF text extraction with multiple fallback strategies and OCR support
 */
export class EnhancedPdfExtractor {
  
  /**
   * Try multiple extraction strategies for PDFs
   */
  async extractText(pdfBuffer: Buffer, filename: string): Promise<string> {
    console.log(`🔍 Attempting enhanced PDF extraction for: ${filename}`);
    
    try {
      // Strategy 1: Standard extraction with various options
      const strategies = [
        { max: 0, normalizeWhitespace: true },
        { max: 0, normalizeWhitespace: false },
        { pagerender: this.customPageRender }
      ];
      
      for (const options of strategies) {
        try {
          const data = await PDFParse(pdfBuffer, options);
          
          if (data.text && data.text.trim().length > 50) {
            console.log(`✅ Strategy ${strategies.indexOf(options) + 1} extracted ${data.text.length} characters`);
            return this.cleanText(data.text);
          }
        } catch (e) {
          // Try next strategy
        }
      }
      
      // Strategy 2: Try to extract with raw text
      const basicData = await PDFParse(pdfBuffer);
      
      // Log detailed information about what we found
      console.log(`PDF Analysis for ${filename}:`);
      console.log(`- Pages: ${basicData.numpages}`);
      console.log(`- Version: ${basicData.version}`);
      console.log(`- Raw text length: ${basicData.text?.length || 0}`);
      
      if (basicData.info) {
        console.log(`- Title: ${basicData.info.Title || 'N/A'}`);
        console.log(`- Author: ${basicData.info.Author || 'N/A'}`);
        console.log(`- Producer: ${basicData.info.Producer || 'N/A'}`);
      }
      
      // Check if it's truly a scanned PDF (no text or only whitespace)
      const hasMinimalText = !basicData.text || basicData.text.trim().length < 50;
      
      if (hasMinimalText) {
        console.log('📷 Detected scanned PDF - attempting OCR processing...');
        
        // Try Tesseract.js OCR first (local processing)
        try {
          console.log('🔍 Attempting local Tesseract OCR...');
          const ocrText = await this.performTesseractOCR(pdfBuffer, filename, basicData.numpages);
          
          if (ocrText && ocrText.trim().length > 50) {
            console.log(`✅ Tesseract OCR successfully extracted ${ocrText.length} characters`);
            return ocrText;
          }
        } catch (tesseractError: any) {
          console.log(`⚠️ Tesseract OCR failed: ${tesseractError.message}`);
        }
        
        // Fallback to Google Cloud Vision API if available
        try {
          console.log('🔍 Attempting Google Cloud Vision API...');
          const ocrText = await googleVisionOCR.extractTextFromPDF(pdfBuffer, filename);
          
          if (ocrText && ocrText.trim().length > 50) {
            console.log(`✅ Vision API successfully extracted ${ocrText.length} characters`);
            return ocrText;
          }
        } catch (ocrError: any) {
          console.log(`⚠️ Vision API failed: ${ocrError.message}`);
        }
        
        // If OCR failed, return detailed fallback with metadata
        const pageInfo = basicData.numpages ? `${basicData.numpages} pages` : 'unknown pages';
        const title = basicData.info?.Title || filename;
        const author = basicData.info?.Author || 'Unknown author';
        
        return `PDF Document: ${title}
Author: ${author}
Pages: ${pageInfo}

📷 This PDF appears to be a scanned document containing images of text rather than searchable text.

OCR processing was attempted but failed. The document may need manual processing.

Suggested Actions:
1. Use an online OCR service like Adobe Acrobat Online or SmallPDF
2. Use Google Drive's built-in OCR (upload the PDF and open with Google Docs)
3. Use a desktop OCR tool like Adobe Acrobat Pro or ABBYY FineReader

The document likely contains valuable content but needs special processing to make it searchable.`;
      }
      
      // If we got some text, return it
      if (basicData.text && basicData.text.trim().length > 0) {
        return this.cleanText(basicData.text);
      }
      
      // Final fallback
      return this.generateFallbackText(basicData, filename);
      
    } catch (error) {
      console.error(`Failed to extract text from ${filename}:`, error);
      throw error;
    }
  }
  
  /**
   * Custom page render function for pdf-parse
   */
  private customPageRender(pageData: any) {
    // Custom render logic to try extracting text differently
    const render_options = {
      normalizeWhitespace: false,
      disableCombineTextItems: false
    };
    
    return pageData.getTextContent(render_options)
      .then((textContent: any) => {
        let text = '';
        for (const item of textContent.items) {
          text += item.str + ' ';
        }
        return text;
      });
  }
  
  /**
   * Clean extracted text
   */
  private cleanText(text: string): string {
    return text
      .replace(/([^\n])\n([^\n])/g, '$1 $2') // Single newlines to spaces
      .replace(/\s+/g, ' ') // Multiple spaces to single
      .replace(/\n{3,}/g, '\n\n') // Multiple newlines to double
      .trim();
  }
  
  /**
   * Perform OCR using Tesseract.js
   */
  private async performTesseractOCR(pdfBuffer: Buffer, filename: string, pageCount: number): Promise<string> {
    console.log(`📷 Starting Tesseract OCR for ${filename} (${pageCount} pages)`);
    
    try {
      // First, try using pdf-poppler to convert PDF to images
      const tmpPdfPath = `/tmp/ocr-pdf-${Date.now()}.pdf`;
      const tmpDir = `/tmp/ocr-images-${Date.now()}`;
      
      await fs.writeFile(tmpPdfPath, pdfBuffer);
      await fs.mkdir(tmpDir, { recursive: true });
      
      console.log('Converting PDF to images for OCR...');
      
      // Use pdf-poppler to convert PDF pages to images
      try {
        await execAsync(`pdftoppm -png -r 300 "${tmpPdfPath}" "${tmpDir}/page"`);
      } catch (popplerError: any) {
        console.log('pdf-poppler not available, trying alternative method...');
        
        // Fallback: Try using ImageMagick if available
        try {
          await execAsync(`convert -density 300 "${tmpPdfPath}" "${tmpDir}/page-%d.png"`);
        } catch (magickError: any) {
          console.log('ImageMagick not available either.');
          
          // Final fallback: Try Tesseract directly on PDF (may not work well)
          console.log('Attempting direct PDF OCR (may have limited success)...');
          const worker = await Tesseract.createWorker('eng');
          
          try {
            const { data: { text } } = await worker.recognize(pdfBuffer);
            await worker.terminate();
            
            if (text && text.trim()) {
              console.log(`✅ Direct OCR extracted ${text.length} characters`);
              return `[OCR Extracted from ${filename}]\n\n${text}\n\nNote: Text extracted using OCR from scanned PDF.`;
            }
          } catch (error) {
            await worker.terminate();
            throw error;
          } finally {
            // Cleanup
            try {
              await fs.unlink(tmpPdfPath);
              await fs.rmdir(tmpDir, { recursive: true });
            } catch {}
          }
          
          throw new Error('PDF to image conversion tools not available');
        }
      }
      
      // Read all generated images
      const imageFiles = await fs.readdir(tmpDir);
      const pngFiles = imageFiles.filter(f => f.endsWith('.png')).sort();
      
      if (pngFiles.length === 0) {
        throw new Error('No images generated from PDF');
      }
      
      console.log(`Converted ${pngFiles.length} pages to images`);
      
      // Create Tesseract worker
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      let fullText = '';
      
      // Process each page
      for (let i = 0; i < Math.min(pngFiles.length, 10); i++) { // Limit to first 10 pages for performance
        const imagePath = path.join(tmpDir, pngFiles[i]);
        const imageBuffer = await fs.readFile(imagePath);
        
        console.log(`Processing page ${i + 1}/${pngFiles.length}...`);
        const { data: { text } } = await worker.recognize(imageBuffer);
        
        if (text && text.trim()) {
          fullText += `\n\n--- Page ${i + 1} ---\n\n${text}`;
        }
      }
      
      await worker.terminate();
      
      // Cleanup temporary files
      try {
        await fs.unlink(tmpPdfPath);
        await fs.rmdir(tmpDir, { recursive: true });
      } catch {}
      
      if (fullText.trim()) {
        console.log(`✅ Tesseract extracted ${fullText.length} characters from ${pngFiles.length} pages`);
        
        return `[OCR Extracted from ${filename}]

${fullText}

Note: Text extracted using OCR from scanned PDF (${pageCount} pages).`;
      } else {
        console.log('⚠️ Tesseract could not extract text from images');
      }
      
    } catch (error: any) {
      console.error('Tesseract OCR error:', error.message);
      throw error;
    }
    
    return '';
  }

  /**
   * Generate fallback text with all available metadata
   */
  private generateFallbackText(data: any, filename: string): string {
    const pageInfo = data.numpages ? `${data.numpages} pages` : 'unknown pages';
    const title = data.info?.Title || filename;
    const author = data.info?.Author || 'Unknown author';
    const producer = data.info?.Producer || 'Unknown';
    
    return `PDF Document: ${title}
Author: ${author}
Pages: ${pageInfo}
Producer: ${producer}

⚠️ Unable to extract text from this PDF. The document may:
- Be a scanned image requiring OCR
- Use embedded fonts that cannot be read
- Have copy protection enabled
- Contain only images or graphics

Please try opening this PDF in a PDF reader application for viewing.`;
  }
}

export const enhancedPdfExtractor = new EnhancedPdfExtractor();