
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function testDownloadMP4() {
  try {
    // Get files from the database that were imported from Excel
    const response = await fetch('http://localhost:5000/api/files');
    const files = await response.json();
    
    // Find Excel-imported files with video type
    const excelVideoFiles = files.filter(file => 
      file.storageType === 'excel-metadata' && 
      (file.mimeType === 'video/mp4' || file.filename.endsWith('.mp4'))
    );
    
    console.log(`Found ${excelVideoFiles.length} video files from Excel import`);
    
    if (excelVideoFiles.length === 0) {
      console.log('No video files found from Excel import');
      return;
    }
    
    // Pick the first video file to test
    const testFile = excelVideoFiles[0];
    console.log(`Testing download of: ${testFile.filename}`);
    console.log(`File path: ${testFile.objectPath}`);
    
    // Try to get metadata to see if there's a URL
    const metadataResponse = await fetch(`http://localhost:5000/api/files/${testFile.id}`);
    const fileDetails = await metadataResponse.json();
    
    console.log('File details:', JSON.stringify(fileDetails, null, 2));
    
    // Check if metadata contains a URL or link
    if (fileDetails.metadata && fileDetails.metadata.extractedText) {
      console.log('Extracted text contains:', fileDetails.metadata.extractedText);
      
      // Look for URLs in the extracted text
      const urlMatches = fileDetails.metadata.extractedText.match(/https?:\/\/[^\s]+/g);
      if (urlMatches && urlMatches.length > 0) {
        const videoUrl = urlMatches[0];
        console.log(`Found URL: ${videoUrl}`);
        
        // Try to download the first 1KB to test accessibility
        console.log('Testing URL accessibility...');
        const testResponse = await fetch(videoUrl, {
          method: 'HEAD' // Just check headers, don't download content
        });
        
        console.log(`Status: ${testResponse.status}`);
        console.log(`Content-Type: ${testResponse.headers.get('content-type')}`);
        console.log(`Content-Length: ${testResponse.headers.get('content-length')}`);
        
        if (testResponse.ok) {
          console.log('✅ URL is accessible!');
          console.log('File can be downloaded if needed.');
        } else {
          console.log('❌ URL is not accessible');
        }
      } else {
        console.log('No URLs found in extracted text');
      }
    }
    
  } catch (error) {
    console.error('Error testing MP4 download:', error);
  }
}

testDownloadMP4();
