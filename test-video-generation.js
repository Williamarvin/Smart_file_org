
const fetch = require('node-fetch');

async function testVideoGenerationWithFile() {
  try {
    console.log('🎬 Testing video generation with user files...');
    
    // First, get available files
    const filesResponse = await fetch('http://localhost:5000/api/files');
    const files = await filesResponse.json();
    
    console.log(`Found ${files.length} files in database`);
    
    if (files.length === 0) {
      console.log('No files found to generate video from');
      return;
    }
    
    // Find a processed file with content
    const processedFiles = files.filter(f => 
      f.processingStatus === 'completed' && 
      f.processedAt !== null
    );
    
    console.log(`Found ${processedFiles.length} processed files`);
    
    if (processedFiles.length === 0) {
      console.log('No processed files found');
      return;
    }
    
    // Use the first processed file
    const testFile = processedFiles[0];
    console.log(`Using file: ${testFile.originalName}`);
    
    // Generate content with video
    const generateRequest = {
      prompt: "Create a 30-second educational video summary of this content",
      fileIds: [testFile.id],
      type: "summary",
      generateVideo: true,
      videoStyle: "educational"
    };
    
    console.log('📝 Sending generation request...');
    console.log('Request:', JSON.stringify(generateRequest, null, 2));
    
    const generateResponse = await fetch('http://localhost:5000/api/generate-content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(generateRequest)
    });
    
    const result = await generateResponse.json();
    
    if (generateResponse.ok) {
      console.log('✅ Generation successful!');
      console.log('Content length:', result.content?.length || 0);
      
      if (result.video) {
        console.log('🎬 Video generated!');
        console.log('Video data length:', result.video.length);
        
        // Save video to file for testing
        const fs = require('fs');
        const videoBuffer = Buffer.from(result.video, 'base64');
        const filename = `test-generated-video-${Date.now()}.mp4`;
        fs.writeFileSync(filename, videoBuffer);
        
        console.log(`💾 Video saved as: ${filename}`);
        console.log(`📊 Video file size: ${videoBuffer.length} bytes`);
        
        // Check if it's a valid video file
        if (videoBuffer.length > 100) {
          console.log('✅ Video appears to have content');
          
          // Check for MP4 signature
          const header = videoBuffer.slice(0, 12).toString('hex');
          console.log(`🔍 Video header: ${header}`);
          
          if (header.includes('66747970') || header.includes('6d646174')) {
            console.log('✅ Valid MP4 file structure detected');
          } else {
            console.log('⚠️  Unusual video format - may be placeholder');
          }
        } else {
          console.log('⚠️  Video file seems very small');
        }
        
      } else if (result.error) {
        console.log('❌ Video generation failed:', result.error);
        if (result.suggestion) {
          console.log('💡 Suggestion:', result.suggestion);
        }
      } else {
        console.log('ℹ️  No video generated (video generation was not requested or failed)');
      }
      
      if (result.content) {
        console.log('📄 Generated content preview:');
        console.log(result.content.substring(0, 200) + '...');
      }
      
    } else {
      console.log('❌ Generation failed');
      console.log('Status:', generateResponse.status);
      console.log('Error:', result);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testVideoGenerationWithFile();
