const fs = require('fs');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');

async function extractTextFromScannedPDF() {
  try {
    console.log('📷 Processing scanned PDF with Tesseract OCR...\n');
    
    const pdfBuffer = fs.readFileSync('/tmp/debating-book.pdf');
    console.log(`✓ PDF loaded: ${Math.round(pdfBuffer.length / 1024)}KB`);
    
    // First, try regular text extraction to see if any text is embedded
    try {
      const pdfData = await pdfParse(pdfBuffer);
      const embeddedText = pdfData.text.trim();
      
      if (embeddedText.length > 100) {
        console.log('✅ Found embedded text in PDF (no OCR needed):');
        console.log(embeddedText.substring(0, 1000));
        return embeddedText;
      } else {
        console.log('📷 No embedded text found. This appears to be a scanned PDF.');
        console.log('Page count:', pdfData.numpages);
        console.log('Starting OCR processing...\n');
      }
    } catch (error) {
      console.log('⚠️ Could not extract embedded text, proceeding with OCR...');
    }
    
    console.log('Setting up Tesseract OCR...');
    
    // Create a Tesseract worker
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    try {
      console.log('Attempting OCR on PDF...');
      
      // Try to recognize text directly from PDF buffer
      // Note: Tesseract works best with images, but we can try with PDF
      const { data: { text } } = await worker.recognize(pdfBuffer);
      
      if (text && text.trim().length > 0) {
        console.log('\n✅ OCR Complete! Extracted text preview:');
        console.log(text.substring(0, 1000));
        console.log(`\nTotal characters extracted: ${text.length}`);
        
        // Save to file for inspection
        fs.writeFileSync('/tmp/ocr-result.txt', text);
        console.log('\nFull text saved to: /tmp/ocr-result.txt');
        
        return text;
      } else {
        console.log('\n⚠️ No text detected by OCR');
        console.log('The PDF might need to be converted to images first for better OCR results.');
      }
      
    } catch (error) {
      console.log('❌ OCR Error:', error.message);
    } finally {
      await worker.terminate();
    }
    
  } catch (error) {
    console.error('OCR processing failed:', error.message);
    console.error(error.stack);
  }
}

// Run the extraction
extractTextFromScannedPDF().catch(console.error);