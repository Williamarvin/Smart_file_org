const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { execSync } = require('child_process');
const Tesseract = require('tesseract.js');

async function extractTextFromPDF() {
  try {
    console.log('📷 Advanced PDF Text Extraction\n');
    
    const pdfPath = '/tmp/debating-book.pdf';
    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`✓ PDF loaded: ${Math.round(pdfBuffer.length / 1024)}KB\n`);
    
    // Step 1: Try regular text extraction first
    console.log('Step 1: Checking for embedded text...');
    try {
      const pdfData = await pdfParse(pdfBuffer);
      const embeddedText = pdfData.text.trim();
      
      if (embeddedText.length > 100) {
        console.log('✅ Found embedded text in PDF!');
        console.log(`Text preview (first 500 chars):\n${embeddedText.substring(0, 500)}\n`);
        
        // Save the extracted text
        fs.writeFileSync('/tmp/extracted-text.txt', embeddedText);
        console.log(`Full text saved to: /tmp/extracted-text.txt (${embeddedText.length} characters)`);
        return embeddedText;
      } else {
        console.log('📷 No embedded text found (only ' + embeddedText.length + ' chars)');
        console.log('This appears to be a scanned PDF.\n');
      }
    } catch (error) {
      console.log('⚠️ Could not extract embedded text:', error.message);
    }
    
    // Step 2: Convert PDF to images using pdf-poppler
    console.log('Step 2: Converting PDF to images for OCR...');
    const outputDir = '/tmp/pdf-images';
    
    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    try {
      // Use pdftoppm command from pdf-poppler to convert PDF to images
      // Convert first 2 pages as a test
      console.log('Converting PDF pages to PNG images...');
      execSync(`pdftoppm -png -f 1 -l 2 -r 300 "${pdfPath}" "${outputDir}/page"`, {
        stdio: 'inherit'
      });
      
      // Check if images were created
      const imageFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.png'));
      console.log(`✓ Created ${imageFiles.length} image files\n`);
      
      if (imageFiles.length === 0) {
        console.log('❌ No images were created. pdftoppm might not be available.');
        return '';
      }
      
      // Step 3: Run OCR on the images
      console.log('Step 3: Running OCR on images...');
      let extractedText = '';
      
      for (const imageFile of imageFiles) {
        const imagePath = path.join(outputDir, imageFile);
        console.log(`Processing ${imageFile}...`);
        
        const worker = await Tesseract.createWorker('eng', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              process.stdout.write(`\rOCR Progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        });
        
        try {
          const { data: { text } } = await worker.recognize(imagePath);
          console.log(`\n✓ Extracted ${text.length} characters from ${imageFile}`);
          
          if (text && text.trim().length > 0) {
            extractedText += `\n--- ${imageFile} ---\n${text}`;
          }
        } catch (error) {
          console.log(`\n❌ OCR failed for ${imageFile}:`, error.message);
        } finally {
          await worker.terminate();
        }
      }
      
      if (extractedText.length > 0) {
        console.log('\n✅ OCR Complete!');
        console.log(`Total characters extracted: ${extractedText.length}`);
        console.log('\nText preview (first 500 chars):');
        console.log(extractedText.substring(0, 500));
        
        // Save the extracted text
        fs.writeFileSync('/tmp/ocr-extracted-text.txt', extractedText);
        console.log(`\nFull text saved to: /tmp/ocr-extracted-text.txt`);
        
        return extractedText;
      } else {
        console.log('\n❌ No text could be extracted');
      }
      
    } catch (error) {
      console.log('❌ PDF to image conversion failed:', error.message);
      console.log('\nTrying alternative: Using existing image if available...');
      
      // Try to use any existing test image
      const testImagePath = '/tmp/test-ocr.png';
      if (fs.existsSync(testImagePath)) {
        console.log('Found test image, running OCR...');
        
        const worker = await Tesseract.createWorker('eng', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              process.stdout.write(`\rOCR Progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        });
        
        try {
          const { data: { text } } = await worker.recognize(testImagePath);
          console.log(`\n✓ Extracted ${text.length} characters`);
          
          if (text && text.trim().length > 0) {
            console.log('\nText preview:');
            console.log(text.substring(0, 500));
            
            fs.writeFileSync('/tmp/ocr-test-result.txt', text);
            console.log(`\nFull text saved to: /tmp/ocr-test-result.txt`);
            return text;
          }
        } finally {
          await worker.terminate();
        }
      }
    }
    
  } catch (error) {
    console.error('Extraction failed:', error.message);
    console.error(error.stack);
  }
  
  return '';
}

// Run the extraction
extractTextFromPDF()
  .then(text => {
    if (text) {
      console.log('\n✅ Success! Text extraction completed.');
    } else {
      console.log('\n❌ Failed to extract text from PDF.');
      console.log('\nAlternative solutions:');
      console.log('1. Upload the PDF to Google Drive and open with Google Docs (automatic OCR)');
      console.log('2. Use an online OCR service like Adobe Acrobat Online or SmallPDF');
      console.log('3. Enable Google Cloud Vision API for professional OCR');
    }
  })
  .catch(console.error);