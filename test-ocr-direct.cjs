const { createWorker } = require('tesseract.js');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

async function testOCR() {
  console.log('Testing OCR on the PDF...');
  
  try {
    // Create temp directory
    const tempDir = '/tmp/ocr-test';
    await fs.mkdir(tempDir, { recursive: true });
    
    // Convert first page of PDF to image
    console.log('Converting PDF to image...');
    const pdfPath = '/tmp/test-ocr.pdf';
    const imagePrefix = path.join(tempDir, 'page');
    
    // Convert just the first page for testing
    const convertCommand = `pdftoppm -png -r 150 -f 1 -l 1 "${pdfPath}" "${imagePrefix}"`;
    
    try {
      await execAsync(convertCommand);
      console.log('PDF converted to image successfully');
    } catch (error) {
      console.error('Error converting PDF:', error);
      return;
    }
    
    // Get the generated image
    const files = await fs.readdir(tempDir);
    const imageFile = files.find(f => f.endsWith('.png'));
    
    if (!imageFile) {
      console.error('No image file generated');
      return;
    }
    
    const imagePath = path.join(tempDir, imageFile);
    console.log(`Processing image: ${imagePath}`);
    
    // Initialize Tesseract
    console.log('Initializing OCR...');
    const worker = await createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    // Perform OCR
    console.log('Performing OCR on the image...');
    const { data: { text } } = await worker.recognize(imagePath);
    
    console.log('\n=== OCR EXTRACTED TEXT (First Page) ===\n');
    console.log(text);
    console.log('\n=== END OF EXTRACTED TEXT ===\n');
    console.log(`Total characters extracted: ${text.length}`);
    
    // Clean up
    await worker.terminate();
    await fs.unlink(imagePath);
    await fs.rmdir(tempDir);
    
  } catch (error) {
    console.error('Error during OCR test:', error);
  }
}

testOCR();