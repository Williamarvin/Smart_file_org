const XLSX = require('xlsx');

// Read the Excel file with all options
const workbook = XLSX.readFile('attached_assets/Video Production Status_1755865193780.xlsx', {
  cellHTML: true,
  cellStyles: true,
  cellFormula: true,
  cellDates: true,
  WTF: true
});

console.log('Testing XLSX hyperlink extraction...');
console.log('=' .repeat(60));

// Check the first sheet
const sheetName = 'LV1(UP)';
const worksheet = workbook.Sheets[sheetName];

console.log(`\nAnalyzing sheet: ${sheetName}`);

// Method 1: Check for !links array
if (worksheet['!links']) {
  console.log('Found !links array with', worksheet['!links'].length, 'links');
} else {
  console.log('No !links array found');
}

// Method 2: Check cells for .l property
let cellsWithLinks = 0;
let exampleLinks = [];

for (const cell in worksheet) {
  if (cell[0] !== '!') {
    const cellObj = worksheet[cell];
    if (cellObj && cellObj.l) {
      cellsWithLinks++;
      if (exampleLinks.length < 3) {
        exampleLinks.push({
          cell: cell,
          target: cellObj.l.Target || cellObj.l.href || cellObj.l.Rel
        });
      }
    }
  }
}

console.log(`Found ${cellsWithLinks} cells with .l property`);
if (exampleLinks.length > 0) {
  console.log('Example links:');
  exampleLinks.forEach(link => {
    console.log(`  ${link.cell}: ${link.target}`);
  });
}

// Method 3: Check if links are in HTML format
const cellG2 = worksheet['G2'];
if (cellG2) {
  console.log('\nCell G2 properties:');
  console.log('  Value:', cellG2.v);
  console.log('  Type:', cellG2.t);
  console.log('  Has .l:', !!cellG2.l);
  console.log('  Has .h:', !!cellG2.h);
  if (cellG2.h) {
    console.log('  HTML:', cellG2.h.substring(0, 100) + '...');
  }
}

// Method 4: Check worksheet properties
console.log('\nWorksheet special properties:');
for (const key in worksheet) {
  if (key[0] === '!') {
    console.log(`  ${key}:`, typeof worksheet[key], Array.isArray(worksheet[key]) ? `Array(${worksheet[key].length})` : '');
  }
}