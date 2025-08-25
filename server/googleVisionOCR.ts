import { ImageAnnotatorClient } from '@google-cloud/vision';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Google Cloud Vision API OCR Service
 * Uses the existing Google Cloud credentials to perform OCR on PDF files
 */
export class GoogleVisionOCR {
  private client: ImageAnnotatorClient;
  
  constructor() {
    // Parse the Google Cloud credentials from environment
    const credentialsJson = process.env.GOOGLE_CLOUD_CREDENTIALS;
    if (!credentialsJson) {
      throw new Error('GOOGLE_CLOUD_CREDENTIALS environment variable not set');
    }
    
    const credentials = JSON.parse(credentialsJson);
    
    // Initialize the Vision API client with credentials
    this.client = new ImageAnnotatorClient({
      credentials: credentials,
      projectId: credentials.project_id
    });
  }
  
  /**
   * Extract text from a PDF using Google Cloud Vision API
   * @param pdfBuffer Buffer containing the PDF file
   * @param filename Name of the PDF file for logging
   * @returns Extracted text from all pages
   */
  async extractTextFromPDF(pdfBuffer: Buffer, filename: string): Promise<string> {
    console.log(`🔍 Starting Google Cloud Vision OCR for: ${filename}`);
    
    try {
      // The Vision API can process PDFs directly
      // We'll use the documentTextDetection method which is optimized for documents
      
      // Convert buffer to base64 for the API
      const base64Pdf = pdfBuffer.toString('base64');
      
      // Prepare the request for batch PDF processing
      const request = {
        requests: [{
          inputConfig: {
            content: base64Pdf,
            mimeType: 'application/pdf'
          },
          features: [{
            type: 'DOCUMENT_TEXT_DETECTION' as const,
            maxResults: 50
          }]
        }]
      };
      
      console.log(`📤 Sending PDF to Google Cloud Vision API (${Math.round(pdfBuffer.length / 1024)}KB)...`);
      
      // For PDFs, we need to use the async batch annotate files method
      const [operation] = await this.client.asyncBatchAnnotateFiles({
        requests: [{
          inputConfig: {
            content: base64Pdf,
            mimeType: 'application/pdf'
          },
          features: [{
            type: 'DOCUMENT_TEXT_DETECTION'
          }]
        }]
      });
      
      // Wait for the operation to complete
      console.log(`⏳ Waiting for OCR operation to complete...`);
      const [filesResponse] = await operation.promise();
      
      // Extract text from all pages
      let fullText = '';
      
      if (filesResponse.responses && filesResponse.responses.length > 0) {
        const response = filesResponse.responses[0];
        
        if (response.responses) {
          for (let i = 0; i < response.responses.length; i++) {
            const pageResponse = response.responses[i];
            
            if (pageResponse.fullTextAnnotation) {
              const pageText = pageResponse.fullTextAnnotation.text || '';
              if (pageText) {
                fullText += pageText + '\n\n';
                console.log(`✅ Extracted text from page ${i + 1}: ${pageText.length} characters`);
              }
            } else if (pageResponse.error) {
              console.error(`❌ Error on page ${i + 1}:`, pageResponse.error.message);
            }
          }
        }
      }
      
      if (fullText.trim().length === 0) {
        console.warn(`⚠️ No text extracted from PDF. The document may contain only images without text.`);
        return '';
      }
      
      console.log(`✅ Total OCR extraction: ${fullText.length} characters from ${filename}`);
      return fullText.trim();
      
    } catch (error: any) {
      console.error(`❌ Google Cloud Vision OCR failed for ${filename}:`, error.message);
      
      // Check if it's a credentials or quota issue
      if (error.message?.includes('PERMISSION_DENIED')) {
        throw new Error('Google Cloud Vision API permission denied. Please check your credentials.');
      } else if (error.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('Google Cloud Vision API quota exceeded. Please try again later.');
      }
      
      throw error;
    }
  }
  
  /**
   * Process a single image for OCR (for single page PDFs or images)
   * @param imageBuffer Buffer containing the image
   * @returns Extracted text
   */
  async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    try {
      const [result] = await this.client.documentTextDetection({
        image: {
          content: imageBuffer
        }
      });
      
      const fullTextAnnotation = result.fullTextAnnotation;
      
      if (fullTextAnnotation && fullTextAnnotation.text) {
        return fullTextAnnotation.text;
      }
      
      return '';
    } catch (error: any) {
      console.error('Google Cloud Vision OCR failed for image:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
export const googleVisionOCR = new GoogleVisionOCR();