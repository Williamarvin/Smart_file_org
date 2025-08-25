const fs = require('fs');
const path = require('path');
const PDFParse = require('pdf-parse');

async function testPDFExtraction() {
  console.log('Testing PDF extraction for: 1. The Debating Book Chapter 1-4.pdf');
  
  try {
    // Read the PDF file
    const pdfPath = path.join(__dirname, 'attached_assets', '1. The Debating Book Chapter 1-4_1756089158703.pdf');
    const dataBuffer = fs.readFileSync(pdfPath);
    
    console.log(`PDF file size: ${dataBuffer.length} bytes`);
    
    // Try basic extraction
    console.log('\n=== Basic Extraction ===');
    const data = await PDFParse(dataBuffer);
    
    console.log(`Number of pages: ${data.numpages}`);
    console.log(`PDF version: ${data.version}`);
    console.log(`PDF info:`, data.info);
    console.log(`Text length: ${data.text ? data.text.length : 0}`);
    
    // Analyze the extracted text
    if (data.text) {
      // Check character codes
      const first100Chars = data.text.substring(0, 100);
      console.log('\nFirst 100 character codes:');
      const charCodes = Array.from(first100Chars).map(c => c.charCodeAt(0));
      console.log(charCodes);
      
      // Check for visible characters
      const visibleChars = data.text.match(/[^\s]/g);
      console.log(`\nVisible characters found: ${visibleChars ? visibleChars.length : 0}`);
      
      if (visibleChars && visibleChars.length > 0) {
        console.log('First 20 visible characters:', visibleChars.slice(0, 20).join(''));
      }
      
      // Check for specific whitespace patterns
      const spaces = data.text.match(/ /g);
      const newlines = data.text.match(/\n/g);
      const tabs = data.text.match(/\t/g);
      
      console.log(`\nWhitespace analysis:`);
      console.log(`- Spaces: ${spaces ? spaces.length : 0}`);
      console.log(`- Newlines: ${newlines ? newlines.length : 0}`);
      console.log(`- Tabs: ${tabs ? tabs.length : 0}`);
      
      // Try to find any actual words
      const words = data.text.match(/\b[A-Za-z]+\b/g);
      console.log(`\nWords found: ${words ? words.length : 0}`);
      if (words && words.length > 0) {
        console.log('First 10 words:', words.slice(0, 10));
      }
    }
    
    // Try with different options
    console.log('\n=== Extraction with Options ===');
    const options = {
      max: 1, // Just try first page
      normalizeWhitespace: false, // Don't normalize to see raw output
    };
    
    const data2 = await PDFParse(dataBuffer, options);
    console.log(`First page text length: ${data2.text ? data2.text.length : 0}`);
    
    if (data2.text && data2.text.length > 0) {
      console.log('First 200 chars of first page:');
      console.log(JSON.stringify(data2.text.substring(0, 200)));
    }
    
    // Check metadata
    console.log('\n=== Metadata Analysis ===');
    if (data.metadata) {
      console.log('Metadata:', data.metadata);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testPDFExtraction();