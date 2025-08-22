const path = require('path');

async function testExcelProcessing() {
  try {
    // Import the Excel processor
    const { ExcelProcessor } = await import('./server/excelProcessor.ts');
    
    // Create processor instance
    const processor = new ExcelProcessor('demo-user');
    
    // Process the Video Production file
    const filePath = './attached_assets/Video Production Status_1755844036500.xlsx';
    console.log('Processing:', filePath);
    
    const result = await processor.processExcelFile(filePath);
    
    console.log('Success!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Error processing Excel file:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
  }
}

testExcelProcessing();