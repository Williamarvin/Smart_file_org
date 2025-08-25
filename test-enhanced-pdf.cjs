const fs = require('fs');
const PDFParse = require('pdf-parse');

async function testEnhancedPDF() {
  console.log('Testing enhanced PDF extraction...\n');
  
  try {
    const pdfPath = '/tmp/test-ocr.pdf';
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    // Try multiple strategies
    const strategies = [
      { max: 0, normalizeWhitespace: true },
      { max: 0, normalizeWhitespace: false },
      { 
        pagerender: function(pageData) {
          const render_options = {
            normalizeWhitespace: false,
            disableCombineTextItems: false
          };
          
          return pageData.getTextContent(render_options)
            .then(function(textContent) {
              let text = '';
              for (const item of textContent.items) {
                text += item.str + ' ';
              }
              return text;
            });
        }
      }
    ];
    
    for (let i = 0; i < strategies.length; i++) {
      console.log(`\nStrategy ${i + 1}:`);
      console.log('================');
      
      try {
        const data = await PDFParse(pdfBuffer, strategies[i]);
        
        console.log(`- Pages: ${data.numpages}`);
        console.log(`- Version: ${data.version}`);
        console.log(`- Raw text length: ${data.text?.length || 0}`);
        console.log(`- Trimmed text length: ${data.text?.trim().length || 0}`);
        
        if (data.info) {
          console.log(`- Title: ${data.info.Title || 'N/A'}`);
          console.log(`- Author: ${data.info.Author || 'N/A'}`);
          console.log(`- Producer: ${data.info.Producer || 'N/A'}`);
        }
        
        // Check what kind of characters we have
        if (data.text && data.text.length > 0) {
          const charCodes = Array.from(data.text.substring(0, 100)).map(c => c.charCodeAt(0));
          const uniqueCodes = [...new Set(charCodes)];
          console.log(`\nFirst 100 character codes: ${uniqueCodes.join(', ')}`);
          
          const hasOnlyWhitespace = data.text.trim().length === 0;
          console.log(`Has only whitespace: ${hasOnlyWhitespace}`);
          
          if (!hasOnlyWhitespace) {
            console.log(`\nFirst 500 characters of extracted text:`);
            console.log('----------------------------------------');
            console.log(data.text.substring(0, 500));
          }
        }
        
      } catch (e) {
        console.log(`Strategy ${i + 1} failed:`, e.message);
      }
    }
    
    // Final analysis
    console.log('\n\nFINAL ANALYSIS:');
    console.log('================');
    
    const basicData = await PDFParse(pdfBuffer);
    const hasOnlyWhitespace = basicData.text && 
      basicData.text.trim().length === 0 && 
      basicData.text.length > 0;
    
    if (hasOnlyWhitespace) {
      console.log('📷 This PDF appears to be a scanned document!');
      console.log('It contains only whitespace characters, indicating images of text.');
      console.log('OCR processing is required to extract the actual text content.');
    } else if (basicData.text && basicData.text.trim().length > 0) {
      console.log('✅ This PDF contains extractable text.');
      console.log(`Total extractable characters: ${basicData.text.trim().length}`);
    } else {
      console.log('⚠️ This PDF has no extractable text.');
      console.log('It may be encrypted, corrupted, or contain only images.');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testEnhancedPDF();