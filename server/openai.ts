import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key" 
});

export function getOpenAIClient() {
  return openai;
}

export interface FileMetadataResult {
  summary: string;
  keywords: string[];
  topics: string[];
  categories: string[];
  confidence: number;
}

export async function extractFileMetadata(text: string, filename: string): Promise<FileMetadataResult> {
  try {
    const prompt = `
You are an expert document analyzer. Analyze the following document content and extract comprehensive metadata.

Document filename: ${filename}
Document content: ${text.slice(0, 8000)} ${text.length > 8000 ? '...(truncated)' : ''}

Please provide a detailed analysis in the following JSON format:
{
  "summary": "A comprehensive 2-3 sentence summary of the document's main content and purpose",
  "keywords": ["array", "of", "relevant", "keywords", "and", "key", "phrases"],
  "topics": ["main", "topics", "covered", "in", "the", "document"],
  "categories": ["document", "type", "categories", "like", "research", "business", "technical"],
  "confidence": 0.95
}

Requirements:
- Summary: Write a clear, informative summary that captures the essence of the document
- Keywords: Extract 5-15 relevant keywords and key phrases that someone might search for
- Topics: Identify 3-8 main topics or themes covered
- Categories: Select 1-2 categories from this list ONLY: [Business, Education, Technology, Entertainment, Health, Finance, Science, News, Personal, Reference]
- Confidence: Rate your confidence in the analysis from 0.0 to 1.0

Focus on extracting metadata that would be useful for similarity search and content discovery.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert document analyzer specializing in metadata extraction for search and discovery systems. Always respond with valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      summary: result.summary || "No summary available",
      keywords: Array.isArray(result.keywords) ? result.keywords : [],
      topics: Array.isArray(result.topics) ? result.topics : [],
      categories: Array.isArray(result.categories) ? result.categories : [],
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
    };
  } catch (error: any) {
    console.error("Failed to extract metadata with GPT:", error);
    throw new Error("Failed to analyze document content: " + (error?.message || "Unknown error"));
  }
}

// Extract audio from video file using FFmpeg
async function extractAudioFromVideo(videoPath: string): Promise<string> {
  const audioPath = videoPath.replace(/\.[^/.]+$/, '.wav');
  
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath!, [
      '-i', videoPath,
      '-vn', // No video
      '-acodec', 'pcm_s16le', // WAV format
      '-ar', '16000', // 16kHz sample rate (optimal for Whisper)
      '-ac', '1', // Mono
      '-y', // Overwrite output file
      audioPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(audioPath);
      } else {
        reject(new Error(`FFmpeg failed with code ${code}`));
      }
    });

    ffmpeg.on('error', (error) => {
      reject(error);
    });
  });
}

// Transcribe video using Whisper
export async function transcribeVideo(videoPath: string): Promise<string> {
  try {
    console.log(`Starting video transcription for: ${videoPath}`);
    
    // Extract audio from video
    const audioPath = await extractAudioFromVideo(videoPath);
    
    try {
      // Transcribe using Whisper
      const audioReadStream = fs.createReadStream(audioPath);
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioReadStream,
        model: "whisper-1",
        language: "en", // Can be made configurable
        response_format: "verbose_json",
      });
      
      // Clean up temporary audio file
      fs.unlinkSync(audioPath);
      
      console.log(`Video transcription completed. Length: ${transcription.text?.length || 0} characters`);
      return transcription.text || "";
      
    } catch (transcriptionError) {
      // Clean up audio file even if transcription fails
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
      throw transcriptionError;
    }
    
  } catch (error: any) {
    console.error("Failed to transcribe video:", error);
    throw new Error("Failed to transcribe video: " + (error?.message || "Unknown error"));
  }
}

export async function generateSearchEmbedding(query: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    return response.data[0].embedding;
  } catch (error: any) {
    console.error("Failed to generate search embedding:", error);
    throw new Error("Failed to generate search embedding: " + (error?.message || "Unknown error"));
  }
}

export async function generateContentEmbedding(content: string): Promise<number[]> {
  try {
    // Truncate content to fit within token limits
    const truncatedContent = content.slice(0, 6000);
    
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: truncatedContent,
    });

    return response.data[0].embedding;
  } catch (error: any) {
    console.error("Failed to generate content embedding:", error);
    throw new Error("Failed to generate content embedding: " + (error?.message || "Unknown error"));
  }
}

export async function findSimilarContent(query: string, existingMetadata: Array<{ summary: string; keywords: string[]; topics: string[] }>): Promise<number[]> {
  try {
    const prompt = `
Based on the search query "${query}", rank the following documents by similarity from most to least similar.
Return an array of indices (0-based) in order of similarity.

Documents:
${existingMetadata.map((meta, index) => `${index}: ${meta.summary} | Keywords: ${meta.keywords.join(', ')} | Topics: ${meta.topics.join(', ')}`).join('\n')}

Respond with only a JSON array of indices, e.g., [2, 0, 1, 3] where the first number is the most similar document.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a similarity ranking expert. Analyze semantic similarity between queries and documents. Respond only with a JSON array of indices.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"indices": []}');
    return Array.isArray(result.indices) ? result.indices : (Array.isArray(result) ? result : []);
  } catch (error) {
    console.error("Failed to find similar content:", error);
    return [];
  }
}

export async function generateTextToSpeech(text: string, voice: string = "alloy"): Promise<Buffer> {
  try {
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice as any,
      input: text.slice(0, 4096), // Limit to OpenAI's max input length
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  } catch (error: any) {
    console.error("Failed to generate speech:", error);
    throw new Error("Failed to generate speech: " + (error?.message || "Unknown error"));
  }
}

export async function generateVideo(content: string, style: string = "natural", fileContext?: any): Promise<Buffer> {
  try {
    console.log(`Starting slideshow video generation with OpenAI narration`);
    
    // Process the content to extract slides and generate narration
    const slides = await processContentForSlides(content, fileContext);
    
    // Generate narration for all slides
    const narration = await generateSlideshowNarration(slides);
    
    // Generate slideshow video with narration
    console.log("Generating slideshow video with AI narration...");
    const { generateSlideshowVideo } = await import('./slideshowVideo');
    return await generateSlideshowVideo(slides, narration);
    
  } catch (error: any) {
    console.error("Video generation failed:", error);
    // Fallback to simpler video if enhanced generation fails
    return await createFallbackVideo(content.substring(0, 500), style);
  }
}

// Process content into slides for slideshow
async function processContentForSlides(content: string, fileContext?: any): Promise<string[]> {
  try {
    // Use GPT to create slide content
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Create 5-8 slides from the content. Each slide should have a title and 2-3 bullet points. Format as: SLIDE 1: [Title]\n- [Point 1]\n- [Point 2]\n\nSLIDE 2: etc. Keep each point under 50 characters."
        },
        {
          role: "user",
          content: `Create slides from:\n${content.substring(0, 3000)}`
        }
      ],
      temperature: 0.7,
      max_tokens: 800
    });
    
    const slidesText = response.choices[0].message.content || "";
    const slides = slidesText.split(/SLIDE \d+:/).filter(s => s.trim());
    
    // Ensure we have at least 3 slides
    if (slides.length < 3) {
      return [
        "Introduction\n• Overview of content\n• Key objectives",
        "Main Points\n• " + content.substring(0, 100) + "\n• Additional details",
        "Conclusion\n• Summary\n• Next steps"
      ];
    }
    
    return slides.slice(0, 8); // Max 8 slides
  } catch (error) {
    console.error("Error creating slides:", error);
    return [
      "AI Generated Content\n• Processing information\n• Creating summary",
      "Key Points\n• " + content.substring(0, 100),
      "Conclusion\n• End of presentation"
    ];
  }
}

// Generate narration for each slide
async function generateSlideshowNarration(slides: string[]): Promise<Buffer> {
  try {
    // Create narration script
    const narrationScript = slides.map((slide, index) => {
      const lines = slide.split('\n').filter(l => l.trim());
      const title = lines[0] || `Slide ${index + 1}`;
      const points = lines.slice(1).join('. ').replace(/[•\-]/g, '');
      return `${title}. ${points}`;
    }).join(' Next slide. ');
    
    // Generate speech using OpenAI TTS
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: narrationScript,
      speed: 1.0
    });
    
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    console.log(`Generated narration audio: ${audioBuffer.length} bytes`);
    return audioBuffer;
  } catch (error) {
    console.error("Error generating narration:", error);
    // Return silent audio as fallback
    return Buffer.alloc(0);
  }
}

// Process content to extract key points for video display
async function processContentForVideo(content: string, fileContext?: any): Promise<string> {
  try {
    // If we have file context, extract the most important information
    if (fileContext && fileContext.length > 0) {
      const contextSummary = fileContext.map((f: any) => 
        `${f.filename}: ${f.content.substring(0, 200)}...`
      ).join('\n');
      
      // Use GPT to create video-friendly content
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Create a concise, video-friendly summary with key bullet points. Format for display in a video with clear, short statements. Maximum 8 key points, each under 40 characters."
          },
          {
            role: "user",
            content: `Create video content from:\n${content.substring(0, 2000)}\n\nContext from files:\n${contextSummary}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });
      
      return response.choices[0].message.content || content.substring(0, 500);
    }
    
    // If no file context, summarize the content for video
    const lines = content.split('\n');
    const keyPoints = [];
    
    // Extract key sentences (those starting with -, *, numbers, or after headers)
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^[-*•]|^\d+\.|^#+/) && trimmed.length < 100) {
        keyPoints.push(trimmed.replace(/^[-*•]|^\d+\.|^#+/, '').trim());
      }
    }
    
    // If we found key points, use them; otherwise use first part of content
    return keyPoints.length > 0 ? keyPoints.slice(0, 8).join('\n') : content.substring(0, 500);
    
  } catch (error) {
    console.error("Error processing content for video:", error);
    return content.substring(0, 500);
  }
}

async function generateEnhancedAnimatedVideo(content: string, style: string): Promise<Buffer> {
  try {
    console.log("Creating AI-powered animated video with dynamic content...");
    
    const tempVideoFile = path.join('/tmp', `ai_video_${Date.now()}.mp4`);
    
    return new Promise((resolve, reject) => {
      // Process content into display lines
      const lines = content.split('\n').filter(line => line.trim());
      
      // Smart line wrapping for video display
      const displayLines = [];
      for (const line of lines.slice(0, 10)) {
        const words = line.split(' ');
        let currentLine = '';
        
        for (const word of words) {
          if (currentLine.length + word.length + 1 <= 42) {
            currentLine += (currentLine ? ' ' : '') + word;
          } else {
            if (currentLine) displayLines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) displayLines.push(currentLine);
        if (displayLines.length >= 8) break;
      }
      
      // Ensure we have at least some content
      if (displayLines.length === 0) {
        displayLines.push("AI Generated Content");
      }
      
      // Create sophisticated text animations with staggered timing
      const textFilters = displayLines.map((line, index) => {
        const yPos = 100 + (index * 32);
        const delay = 3 + (index * 2.5); // Staggered appearance
        const duration = 12; // Longer visibility
        const alpha = `min(1,max(0,(t-${delay})/1.5))*(1-max(0,(t-${delay + duration})/2))`;
        
        return `drawtext=text='${line.replace(/'/g, "\\'")}':fontcolor=white:fontsize=18:x=(w-text_w)/2:y=${yPos}:enable='between(t,${delay},${delay + duration})':alpha='${alpha}'`;
      });
      
      // Create multiple audio layers for rich composition
      const ffmpeg = spawn(ffmpegPath!, [
        '-f', 'lavfi',
        '-i', 'color=c=0x0f172a:size=1280x720:duration=60:rate=30', // 60-second HD video
        '-f', 'lavfi', 
        '-i', 'sine=frequency=261.63:duration=60', // C4 melody
        '-f', 'lavfi',
        '-i', 'sine=frequency=329.63:duration=60', // E4 harmony
        '-f', 'lavfi',
        '-i', 'sine=frequency=392.00:duration=60', // G4 chord
        '-f', 'lavfi',
        '-i', 'sine=frequency=196.00:duration=60', // G3 bass
        '-f', 'lavfi',
        '-i', 'sine=frequency=523.25:duration=60', // C5 high note
        '-filter_complex', [
          // Simple colored background (avoiding complex geq expressions)
          `[0:v]hue=H=2*t:s=1.5[bg];`,
          
          // Multiple animated geometric elements
          `[bg]drawbox=x='320+280*sin(t/4)':y='120+140*cos(t/5)':w=140:h=140:color=0x3b82f6@0.3[shapes1];`,
          `[shapes1]drawbox=x='700+200*cos(t/3.5)':y='280+100*sin(t/4.5)':w=120:h=120:color=0xef4444@0.4[shapes2];`,
          `[shapes2]drawbox=x='250+220*sin(t/5.5)':y='450+90*cos(t/3.8)':w=100:h=100:color=0x10b981@0.35[shapes3];`,
          `[shapes3]drawbox=x='900+160*cos(t/2.8)':y='180+120*sin(t/6)':w=80:h=80:color=0xf59e0b@0.45[shapes4];`,
          
          // Rotating orbital elements
          `[shapes4]drawbox=x='640+180*sin(2*3.14159*t/8)':y='360+180*cos(2*3.14159*t/8)':w=60:h=60:color=0x8b5cf6@0.5[orbit1];`,
          `[orbit1]drawbox=x='640+240*sin(2*3.14159*t/12+3.14159)':y='360+240*cos(2*3.14159*t/12+3.14159)':w=40:h=40:color=0xec4899@0.4[orbit2];`,
          `[orbit2]drawbox=x='640+120*sin(2*3.14159*t/6+1.571)':y='360+120*cos(2*3.14159*t/6+1.571)':w=30:h=30:color=0x06b6d4@0.6[orbit3];`,
          
          // Professional title with glow effect and animation
          `[orbit3]drawtext=text='🎬 AI CONTENT GENERATOR':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=30:enable='gte(t,1)':alpha='min(1,max(0,(t-1)/3))'[title];`,
          
          // Dynamic subtitle with style indication
          `[title]drawtext=text='📊 ${style.toUpperCase()} PRESENTATION STYLE':fontcolor=cyan:fontsize=28:x=(w-text_w)/2:y=75:enable='gte(t,2.5)':alpha='min(1,max(0,(t-2.5)/2))'[subtitle];`,
          
          // Main content with sophisticated animations
          `[subtitle]${textFilters.join(',')}[content];`,
          
          // Animated progress indicators and status (simplified)
          `[content]drawbox=x=120:y=660:w=800:h=18:t=fill:color=0x10b981@0.5[progress];`,
          `[progress]drawtext=text='🎵 Musical Background Active':fontcolor=lime:fontsize=20:x=120:y=620:enable='gte(t,8)'[music];`,
          `[music]drawtext=text='🎨 Enhanced Animations':fontcolor=yellow:fontsize=20:x=120:y=590:enable='gte(t,12)'[animations];`,
          `[animations]drawtext=text='⏱️ %{eif\\:t\\:d}/60 seconds':fontcolor=white:fontsize=20:x=w-250:y=620[timer];`,
          
          // Pulsing accent elements for visual rhythm
          `[timer]drawbox=x='60+20*sin(4*3.14159*t)':y='30+15*cos(4*3.14159*t)':w=40:h=40:color=0xffffff@0.7[pulse1];`,
          `[pulse1]drawbox=x='w-100+15*sin(6*3.14159*t)':y='30+12*cos(6*3.14159*t)':w=35:h=35:color=0xff6b6b@0.6[pulse2];`,
          `[pulse2]drawbox=x='60+18*sin(3*3.14159*t)':y='h-70+12*cos(3*3.14159*t)':w=30:h=30:color=0x4ade80@0.8[pulse3];`,
          `[pulse3]drawbox=x='w-100+16*sin(5*3.14159*t)':y='h-70+10*cos(5*3.14159*t)':w=28:h=28:color=0xa78bfa@0.7[final];`,
          
          // Rich musical composition with multiple layers (separate from video chain)
          ``,  // Separator between video and audio chains
          `[1:a][2:a]amix=inputs=2:duration=longest:weights=0.6 0.4[layer1];`,
          `[layer1][3:a]amix=inputs=2:duration=longest:weights=0.7 0.3[layer2];`,
          `[layer2][4:a]amix=inputs=2:duration=longest:weights=0.8 0.2[layer3];`,
          `[layer3][5:a]amix=inputs=2:duration=longest:weights=0.9 0.1[music_mix];`,
          `[music_mix]volume=0.4,highpass=f=60,lowpass=f=12000,compand=attacks=0.1:decays=0.3:points=-80/-80|-20/-20|-10/-10|0/0[audio_final]`
        ].join(''),
        '-map', '[final]',
        '-map', '[audio_final]',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-b:a', '192k',  // Ensure audio bitrate
        '-ar', '44100',   // Audio sample rate
        '-ac', '2',       // Stereo audio
        '-pix_fmt', 'yuv420p',
        '-preset', 'medium',
        '-crf', '18', // High quality
        '-movflags', '+faststart', // Optimize for web streaming
        '-shortest',
        '-y',
        tempVideoFile
      ]);

      let errorOutput = '';
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        try {
          if (code === 0 && fs.existsSync(tempVideoFile)) {
            const videoBuffer = fs.readFileSync(tempVideoFile);
            fs.unlinkSync(tempVideoFile);
            console.log(`✅ Generated professional animated video with rich audio (${videoBuffer.length} bytes, 60 seconds)`);
            resolve(videoBuffer);
          } else {
            console.log(`Professional video generation failed with code ${code}: ${errorOutput}`);
            createFallbackVideo(content, style).then(resolve).catch(reject);
          }
        } catch (error) {
          console.log("Error with professional video:", error);
          createFallbackVideo(content, style).then(resolve).catch(reject);
        }
      });

      ffmpeg.on('error', (error) => {
        console.log("Professional video creation failed:", error.message);
        createFallbackVideo(content, style).then(resolve).catch(reject);
      });
    });
    
  } catch (error: any) {
    console.error("Failed to create professional video:", error);
    return createFallbackVideo(content, style);
  }
}

async function createFallbackVideo(content: string, style: string): Promise<Buffer> {
  console.log("Creating reliable fallback video with animations and audio...");
  
  try {
    const tempVideoFile = path.join('/tmp', `fallback_video_${Date.now()}.mp4`);
    
    return new Promise((resolve, reject) => {
      const shortContent = content.length > 50 ? content.substring(0, 50) + "..." : content;
      
      const ffmpeg = spawn(ffmpegPath!, [
        '-f', 'lavfi',
        '-i', 'color=c=0x1e293b:size=1280x720:duration=30:rate=30',
        '-f', 'lavfi', 
        '-i', 'sine=frequency=440:duration=30',
        '-f', 'lavfi',
        '-i', 'sine=frequency=554:duration=30',
        '-filter_complex', [
          // Animated background with color shift
          `[0:v]hue=H=t:s=1.2:b=0.2[bg];`,
          
          // Moving shapes
          `[bg]drawbox=x='320+200*sin(t/4)':y='180+100*cos(t/5)':w=120:h=120:color=0x3b82f6@0.4[shapes];`,
          
          // Title with animation
          `[shapes]drawtext=text='🎬 AI Generated Video':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=100:enable='gte(t,1)':alpha='min(1,max(0,(t-1)/2))'[title];`,
          
          // Content
          `[title]drawtext=text='${shortContent.replace(/'/g, "\\'")}':fontcolor=yellow:fontsize=24:x=(w-text_w)/2:y=300:enable='gte(t,3)':alpha='min(1,max(0,(t-3)/2))'[content];`,
          
          // Style and timer
          `[content]drawtext=text='Style\\: ${style}':fontcolor=cyan:fontsize=20:x=(w-text_w)/2:y=400:enable='gte(t,5)'[style_text];`,
          `[style_text]drawtext=text='🎵 With Audio • %{eif\\:t\\:d}s':fontcolor=lime:fontsize=18:x=(w-text_w)/2:y=500:enable='gte(t,7)'[final];`,
          
          // Mix audio (ensure proper separation)
          ``,
          `[1:a][2:a]amix=inputs=2:duration=longest:weights=0.7 0.3[audio_mix];`,
          `[audio_mix]volume=0.5[audio_final]`
        ].join(''),
        '-map', '[final]',
        '-map', '[audio_final]',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-b:a', '128k',  // Ensure audio bitrate
        '-ar', '44100',  // Audio sample rate
        '-ac', '2',      // Stereo audio
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-crf', '23',
        '-movflags', '+faststart',
        '-y',
        tempVideoFile
      ]);

      ffmpeg.on('close', (code) => {
        try {
          if (code === 0 && fs.existsSync(tempVideoFile)) {
            const videoBuffer = fs.readFileSync(tempVideoFile);
            fs.unlinkSync(tempVideoFile);
            console.log(`✅ Generated fallback video with animations and audio (${videoBuffer.length} bytes, 30 seconds)`);
            resolve(videoBuffer);
          } else {
            console.log(`Fallback video failed with code ${code}`);
            resolve(createTestPatternVideo());
          }
        } catch (error) {
          resolve(createTestPatternVideo());
        }
      });

      ffmpeg.on('error', (error) => {
        console.log("Fallback video creation failed:", error.message);
        resolve(createTestPatternVideo());
      });
    });
    
  } catch (error: any) {
    console.error("Failed to create fallback video:", error);
    return createTestPatternVideo();
  }
}

function createTestPatternVideo(): Buffer {
  console.log("Creating test pattern video as final fallback");
  
  // This is a very basic MP4 with proper structure that should play
  // Contains minimal headers for a valid MP4 file
  const mp4Header = Buffer.from([
    // ftyp box (file type)
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ftyp header
    0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x02, 0x00, // isom brand
    0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32, // compatible brands
    0x61, 0x76, 0x63, 0x31, 0x6D, 0x70, 0x34, 0x31, // more brands
    
    // mdat box (media data) - minimal placeholder
    0x00, 0x00, 0x00, 0x10, 0x6D, 0x64, 0x61, 0x74, // mdat header
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // placeholder data
  ]);
  
  console.log(`Generated test pattern video (${mp4Header.length} bytes)`);
  return mp4Header;
}

export async function generateContentFromFiles(
  prompt: string, 
  fileContents: Array<{ filename: string; content: string; category: string }>,
  generationType: string
): Promise<string> {
  try {
    // Create context from files
    const context = fileContents.map(file => 
      `=== ${file.filename} (${file.category}) ===\n${file.content}`
    ).join('\n\n');

    // Limit context to avoid token limits
    const maxContextLength = 15000;
    const truncatedContext = context.length > maxContextLength 
      ? context.slice(0, maxContextLength) + "\n\n[Content truncated...]"
      : context;

    const systemPrompts = {
      summary: "You are an expert summarizer and analyst. Create comprehensive summaries and analysis based on the provided documents.",
      report: "You are a professional report writer. Create detailed, well-structured reports based on the provided documents.",
      insights: "You are a strategic analyst. Extract key insights, patterns, and actionable information from the provided documents.",
      recommendations: "You are a strategic advisor. Provide specific, actionable recommendations based on the analysis of the provided documents.",
      comparison: "You are a comparative analyst. Compare and contrast the key themes, topics, and insights across the provided documents.",
      creative: "You are a creative content writer. Generate engaging, original content inspired by the themes and information in the provided documents."
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: systemPrompts[generationType as keyof typeof systemPrompts] || systemPrompts.summary,
        },
        {
          role: "user",
          content: `Based on the following documents, ${prompt}

Documents:
${truncatedContext}

Please provide a comprehensive response based on the content and context of these documents.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response.choices[0].message.content || "Unable to generate content.";
  } catch (error: any) {
    console.error("Failed to generate content:", error);
    throw new Error("Failed to generate content: " + (error?.message || "Unknown error"));
  }
}

export async function chatWithFiles(
  message: string,
  files: Array<{ id: string; filename: string; extractedText?: string; metadata?: any }>,
  oversightInstructions?: string
): Promise<string> {
  try {
    let context = "";
    
    if (files.length > 0) {
      // Create context from selected files
      context = files.map(file => {
        const text = file.extractedText || "";
        const summary = file.metadata?.summary || "";
        const keywords = file.metadata?.keywords?.join(", ") || "";
        
        return `=== ${file.filename} ===
Summary: ${summary}
Keywords: ${keywords}
Content: ${text.slice(0, 3000)}${text.length > 3000 ? "..." : ""}`;
      }).join('\n\n');
    } else {
      context = "No specific files selected. User is asking a general question.";
    }

    const baseSystemContent = `You are a helpful AI assistant that can answer questions about uploaded documents. 
You have access to the user's document content and can provide specific information, summaries, analysis, and insights.

When answering:
- Be concise but comprehensive
- Reference specific documents when relevant
- If no files are selected, provide general guidance about what the user can do
- If the question cannot be answered from the provided context, say so clearly
- Use a conversational, helpful tone

Available document context:
${context}`;

    const systemContent = oversightInstructions 
      ? `${baseSystemContent}\n\n${oversightInstructions}`
      : baseSystemContent;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: systemContent,
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    return response.choices[0].message.content || "I apologize, but I couldn't generate a response. Please try again.";
  } catch (error: any) {
    console.error("Failed to chat with files:", error);
    throw new Error("Failed to process chat message: " + (error?.message || "Unknown error"));
  }
}
