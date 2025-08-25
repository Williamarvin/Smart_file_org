const fs = require('fs');
const vision = require('@google-cloud/vision');

async function testVisionOCR() {
  try {
    console.log('Testing Google Cloud Vision OCR directly...\n');
    
    // Check if credentials exist
    if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
      console.error('❌ GOOGLE_CLOUD_CREDENTIALS not found in environment');
      return;
    }
    
    const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
    console.log('✓ Found Google Cloud credentials');
    console.log(`  Project: ${credentials.project_id}`);
    console.log(`  Service Account: ${credentials.client_email}\n`);
    
    // Initialize Vision client
    const client = new vision.ImageAnnotatorClient({
      credentials: credentials,
      projectId: credentials.project_id
    });
    
    // Read the PDF
    const pdfPath = '/tmp/test-ocr-vision.pdf';
    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`✓ PDF loaded: ${Math.round(pdfBuffer.length / 1024)}KB`);
    
    // Try to process just the first page as an image test
    console.log('\n📷 Attempting OCR with Google Cloud Vision API...');
    console.log('Sending request to Vision API...');
    
    try {
      // For testing, let's try the simpler synchronous text detection first
      // This will at least tell us if the API is accessible
      const request = {
        image: {
          content: pdfBuffer.toString('base64')
        },
        features: [{
          type: 'TEXT_DETECTION',
          maxResults: 1
        }]
      };
      
      const [result] = await client.annotateImage(request);
      
      if (result.error) {
        console.error('❌ Vision API error:', result.error.message);
      } else if (result.textAnnotations && result.textAnnotations.length > 0) {
        console.log('✅ Vision API is working! Text detected:');
        console.log(result.textAnnotations[0].description.substring(0, 500));
      } else {
        console.log('⚠️ Vision API responded but no text was detected');
      }
      
    } catch (error) {
      console.error('❌ Vision API call failed:', error.message);
      
      if (error.message.includes('PERMISSION_DENIED')) {
        console.log('\n⚠️ Permission issue. The service account may not have Vision API access.');
        console.log('Please ensure Vision API is enabled in your Google Cloud project.');
      } else if (error.message.includes('does not have storage.objects')) {
        console.log('\n⚠️ The service account needs Storage Object Viewer permissions.');
      } else if (error.message.includes('Invalid request')) {
        console.log('\n⚠️ The PDF might be too large or in an unsupported format for direct processing.');
        console.log('PDFs need to be processed differently with asyncBatchAnnotateFiles.');
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testVisionOCR();