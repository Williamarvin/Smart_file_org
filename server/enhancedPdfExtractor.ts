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
      console.log('Creating Tesseract worker...');
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      try {
        // Try to recognize text from the PDF buffer
        // Note: This works best with single-page PDFs or images
        console.log('Running OCR on PDF...');
        const { data: { text } } = await worker.recognize(pdfBuffer);
        
        await worker.terminate();
        
        if (text && text.trim()) {
          console.log(`✅ Tesseract extracted ${text.length} characters`);
          
          // Add metadata to extracted text
          const fullText = `[OCR Extracted from ${filename}]

${text}

Note: Text extracted using OCR from scanned PDF (${pageCount} pages).`;
          
          return fullText;
        } else {
          console.log('⚠️ Tesseract could not extract text from PDF');
        }
      } catch (error) {
        await worker.terminate();
        throw error;
      }
    } catch (error: any) {
      console.error('Tesseract OCR error:', error.message);
      
      // If Tesseract fails on PDF directly, note that conversion to images may be needed
      if (error.message.includes('Error attempting to read image')) {
        console.log('ℹ️ PDF needs to be converted to images for OCR processing');
      }
      
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