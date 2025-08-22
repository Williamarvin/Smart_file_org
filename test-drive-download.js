// Test script to verify Google Drive file download functionality
const axios = require('axios');

async function testDriveDownload() {
  try {
    console.log('Testing Google Drive file processing...');
    
    // Test the API endpoint
    const response = await axios.post('http://localhost:5000/api/files/process-drive-files', {}, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response:', response.data);
    
    if (response.data.success) {
      console.log(`✅ Successfully processed ${response.data.processed} files`);
      console.log(`⚠️ Failed: ${response.data.failed} files`);
      console.log(`⏭️ Skipped: ${response.data.skipped} files`);
    } else {
      console.log('❌ Processing failed:', response.data.message);
    }
  } catch (error) {
    console.error('Error testing Google Drive download:', error.response?.data || error.message);
  }
}

// Run the test
testDriveDownload();