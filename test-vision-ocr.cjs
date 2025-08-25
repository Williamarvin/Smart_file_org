const fs = require('fs');

async function testVisionOCR() {
  console.log('Testing Google Cloud Vision OCR...\n');
  
  try {
    // Check if credentials are available
    if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
      console.error('GOOGLE_CLOUD_CREDENTIALS not set in environment');
      return;
    }
    
    const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
    console.log('✓ Google Cloud credentials found');
    console.log(`  Project ID: ${credentials.project_id}`);
    console.log(`  Service Account: ${credentials.client_email}\n`);
    
    // Read the PDF file
    const pdfPath = '/tmp/test-ocr-vision.pdf';
    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`✓ PDF loaded: ${Math.round(pdfBuffer.length / 1024)}KB\n`);
    
    // Import and use the enhanced PDF extractor
    const { enhancedPdfExtractor } = require('./server/enhancedPdfExtractor');
    
    console.log('Attempting text extraction with OCR...');
    console.log('=====================================\n');
    
    const extractedText = await enhancedPdfExtractor.extractText(
      pdfBuffer, 
      '1. The Debating Book Chapter 1-4.pdf'
    );
    
    console.log('\n=== EXTRACTED TEXT ===\n');
    console.log(extractedText.substring(0, 2000)); // Show first 2000 chars
    
    if (extractedText.length > 2000) {
      console.log(`\n... (${extractedText.length - 2000} more characters)`);
    }
    
    console.log('\n=== SUMMARY ===');
    console.log(`Total characters extracted: ${extractedText.length}`);
    
    // Check if OCR was successful
    if (extractedText.includes('📷 This PDF appears to be a scanned document')) {
      console.log('⚠️ OCR was attempted but may have failed');
    } else if (extractedText.length > 500) {
      console.log('✅ OCR appears to have successfully extracted text!');
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
  }
}

testVisionOCR();