const XLSX = require('xlsx');
const path = require('path');

try {
  // Read the Video Production Status file
  console.log('=== VIDEO PRODUCTION STATUS FILE ===');
  const workbook1 = XLSX.readFile('./attached_assets/Video Production Status_1755844036500.xlsx');
  
  console.log('Sheet names:', workbook1.SheetNames);
  
  // Read first sheet
  const firstSheet = workbook1.Sheets[workbook1.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(firstSheet, {header: 1});
  
  console.log('\nFirst 5 rows:');
  data.slice(0, 5).forEach((row, i) => {
    console.log(`Row ${i}:`, row.slice(0, 8));
  });
  
  // Try to read as JSON with headers
  const jsonData = XLSX.utils.sheet_to_json(firstSheet);
  console.log('\nFirst 2 records as JSON:');
  console.log(JSON.stringify(jsonData.slice(0, 2), null, 2));
  
  console.log('\n=== SC MASTER CURRICULUM FILE ===');
  const workbook2 = XLSX.readFile('./attached_assets/SC - Master Curriculum_1755844038928.xlsx');
  
  console.log('Sheet names:', workbook2.SheetNames);
  
  // Read first sheet
  const sheet2 = workbook2.Sheets[workbook2.SheetNames[0]];
  const data2 = XLSX.utils.sheet_to_json(sheet2, {header: 1});
  
  console.log('\nFirst 5 rows:');
  data2.slice(0, 5).forEach((row, i) => {
    console.log(`Row ${i}:`, row.slice(0, 8));
  });
  
} catch (e) {
  console.error('Error:', e.message);
  console.error(e.stack);
}