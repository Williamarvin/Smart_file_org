import * as XLSX from 'xlsx';
import * as fs from 'fs';

// Create a test workbook
const wb = XLSX.utils.book_new();

// Create sample data with file references
const data = [
  {
    'Lesson': 'Introduction to Physics',
    'Topic': 'Motion and Forces',
    'Lesson Plan': 'Lesson Plan - Motion.docx',
    'Presentation': 'Motion Presentation.pptx',
    'Video': 'Motion Explained.mp4',
    'Resources': 'Additional Resources.pdf'
  },
  {
    'Lesson': 'Advanced Physics',
    'Topic': 'Energy and Work',
    'Lesson Plan': 'Lesson Plan - Energy.docx',
    'Presentation': 'Energy Presentation.pptx',
    'Video': 'Energy Concepts.mp4',
    'Resources': 'Practice Problems.pdf'
  },
  {
    'Lesson': 'Lab Session',
    'Topic': 'Experiments',
    'Lesson Plan': 'Lab Manual.docx',
    'Presentation': 'Lab Safety.pptx',
    'Video': 'Lab Demo.mp4',
    'Resources': 'Lab Report Template.pdf'
  }
];

// Convert data to worksheet
const ws = XLSX.utils.json_to_sheet(data);

// Add the worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, 'Course Content');

// Write the Excel file
XLSX.writeFile(wb, 'Test_Course_Materials.xlsx');

console.log('Test Excel file created: Test_Course_Materials.xlsx');