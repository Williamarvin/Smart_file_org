import fs from 'fs';
import path from 'path';
import PDFParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function extractTextFromPDF() {
  console.log('📷 Advanced PDF Text Extraction System\n');
  
  const pdfPath = '/tmp/debating-book.pdf';
  
  if (!fs.existsSync(pdfPath)) {
    console.error('❌ PDF file not found at:', pdfPath);
    return;
  }
  
  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log(`✅ PDF loaded: ${Math.round(pdfBuffer.length / 1024)}KB\n`);
  
  // Step 1: Try regular text extraction
  console.log('Step 1: Checking for embedded text...');
  try {
    const pdfData = await PDFParse(pdfBuffer);
    const text = pdfData.text.trim();
    
    if (text.length > 100) {
      console.log('✅ Found embedded text! No OCR needed.');
      console.log(`Extracted ${text.length} characters`);
      console.log('\nText preview:');
      console.log(text.substring(0, 500));
      
      fs.writeFileSync('/tmp/extracted-text.txt', text);
      console.log('\nFull text saved to: /tmp/extracted-text.txt');
      return text;
    } else {
      console.log(`📷 No embedded text found (only ${text.length} chars)`);
      console.log('This is a scanned PDF. Pages:', pdfData.numpages);
    }
  } catch (error) {
    console.log('⚠️ Could not extract embedded text:', error.message);
  }
  
  // Step 2: Try to convert PDF to images using ImageMagick
  console.log('\nStep 2: Attempting to convert PDF to images...');
  const outputDir = '/tmp/pdf-pages';
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  try {
    // Check if ImageMagick is available
    await execAsync('which convert');
    console.log('✅ ImageMagick found, converting PDF pages...');
    
    // Convert first 2 pages to PNG
    await execAsync(`convert -density 300 "${pdfPath}[0-1]" "${outputDir}/page-%d.png"`);
    
    const imageFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.png'));
    console.log(`✅ Created ${imageFiles.length} image files`);
    
    // Step 3: Run OCR on images
    if (imageFiles.length > 0) {
      console.log('\nStep 3: Running Tesseract OCR on images...');
      let extractedText = '';
      
      for (const imageFile of imageFiles) {
        const imagePath = path.join(outputDir, imageFile);
        console.log(`\nProcessing ${imageFile}...`);
        
        const worker = await Tesseract.createWorker('eng', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              process.stdout.write(`\rOCR Progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        });
        
        try {
          const { data: { text } } = await worker.recognize(imagePath);
          
          if (text && text.trim()) {
            console.log(`\n✅ Extracted ${text.length} characters`);
            extractedText += `\n--- ${imageFile} ---\n${text}`;
          } else {
            console.log('\n⚠️ No text detected');
          }
        } finally {
          await worker.terminate();
        }
      }
      
      if (extractedText) {
        console.log('\n' + '='.repeat(50));
        console.log('✅ OCR EXTRACTION COMPLETE!');
        console.log(`Total characters: ${extractedText.length}`);
        console.log('='.repeat(50));
        
        console.log('\nText preview:');
        console.log(extractedText.substring(0, 500));
        
        fs.writeFileSync('/tmp/ocr-result.txt', extractedText);
        console.log('\nFull text saved to: /tmp/ocr-result.txt');
        return extractedText;
      }
    }
  } catch (error) {
    console.log('⚠️ ImageMagick not available or conversion failed:', error.message);
  }
  
  // Step 4: Try creating a test image with text for OCR testing
  console.log('\nStep 4: Testing Tesseract OCR capability...');
  
  // Create a simple test image with text using canvas
  try {
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(800, 200);
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 800, 200);
    
    // Black text
    ctx.fillStyle = 'black';
    ctx.font = '30px Arial';
    ctx.fillText('Test OCR: The Debating Book', 50, 100);
    
    // Save test image
    const testImagePath = '/tmp/test-ocr.png';
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(testImagePath, buffer);
    console.log('✅ Created test image:', testImagePath);
    
    // Run OCR on test image
    console.log('Running OCR on test image...');
    const worker = await Tesseract.createWorker('eng');
    const { data: { text } } = await worker.recognize(testImagePath);
    await worker.terminate();
    
    if (text && text.trim()) {
      console.log('✅ Tesseract OCR is working! Test result:', text.trim());
    } else {
      console.log('⚠️ Tesseract OCR test failed');
    }
  } catch (error) {
    console.log('⚠️ Canvas not available for test:', error.message);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📋 SUMMARY');
  console.log('='.repeat(50));
  console.log('The PDF appears to be a scanned document without embedded text.');
  console.log('OCR processing requires converting PDF pages to images first.');
  console.log('\n✅ Recommended Solutions:');
  console.log('1. Google Drive OCR (easiest):');
  console.log('   - Upload PDF to Google Drive');
  console.log('   - Right-click → "Open with" → "Google Docs"');
  console.log('   - Google will OCR all 40 pages automatically');
  console.log('\n2. Online OCR Services:');
  console.log('   - SmallPDF.com (2 free PDFs/day)');
  console.log('   - Adobe Acrobat Online OCR');
  console.log('   - ILovePDF.com OCR tool');
  console.log('\n3. Enable Google Cloud Vision API:');
  console.log('   - Professional-grade OCR');
  console.log('   - Can process all pages at once');
  console.log('   - Visit the link provided earlier to enable');
}

// Run the extraction
extractTextFromPDF().catch(console.error);