import PDFParse from 'pdf-parse';
import * as fs from 'fs/promises';

/**
 * Enhanced PDF text extraction with multiple fallback strategies
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
      
      // Check if it's truly a scanned PDF
      const hasOnlyWhitespace = basicData.text && 
        basicData.text.trim().length === 0 && 
        basicData.text.length > 0;
      
      if (hasOnlyWhitespace) {
        console.log('⚠️ PDF contains only whitespace - likely a scanned document');
        
        // Return detailed fallback with metadata
        const pageInfo = basicData.numpages ? `${basicData.numpages} pages` : 'unknown pages';
        const title = basicData.info?.Title || filename;
        const author = basicData.info?.Author || 'Unknown author';
        
        return `PDF Document: ${title}
Author: ${author}
Pages: ${pageInfo}

📷 This PDF appears to be a scanned document containing images of text rather than searchable text.

To extract the text from this document, OCR (Optical Character Recognition) processing is required.

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