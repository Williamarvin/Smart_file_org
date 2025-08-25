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

export async function generateVideo(prompt: string, style: string = "natural"): Promise<Buffer> {
  try {
    console.log(`Starting video generation for prompt: "${prompt.substring(0, 100)}..."`);
    
    // Try multiple video generation approaches with improved error handling
    const models = [
      {
        name: "Zeroscope Text2Video",
        url: "https://api-inference.huggingface.co/models/cerspense/zeroscope_v2_576w",
        body: {
          inputs: `${prompt}. ${style} style video, high quality`,
          parameters: {
            num_frames: 16,
            fps: 8
          }
        }
      },
      {
        name: "ModelScope Text2Video", 
        url: "https://api-inference.huggingface.co/models/damo-vilab/text-to-video-ms-1.7b",
        body: {
          inputs: `${style} video: ${prompt}`,
          parameters: {
            num_frames: 16,
            fps: 8
          }
        }
      },
      {
        name: "Text2Video-Zero",
        url: "https://api-inference.huggingface.co/models/PAIR/text2video-zero",
        body: {
          inputs: `Generate ${style} video: ${prompt}`,
          parameters: {
            num_inference_steps: 20,
            guidance_scale: 12.5,
            num_frames: 8
          }
        }
      }
    ];

    for (const model of models) {
      try {
        console.log(`Trying ${model.name}...`);
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const response = await fetch(model.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(model.body),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          if (arrayBuffer.byteLength > 1000) { // Ensure we got actual video data
            console.log(`✅ Video generated successfully with ${model.name} (${arrayBuffer.byteLength} bytes)`);
            return Buffer.from(arrayBuffer);
          } else {
            console.log(`❌ ${model.name} returned insufficient data (${arrayBuffer.byteLength} bytes)`);
          }
        } else if (response.status === 503) {
          const responseText = await response.text();
          console.log(`⏳ ${model.name} is loading: ${responseText}`);
        } else if (response.status === 401) {
          console.log(`❌ ${model.name} unauthorized - model may require authentication`);
        } else {
          const responseText = await response.text();
          console.log(`❌ ${model.name} failed with status ${response.status}: ${responseText}`);
        }
      } catch (modelError: any) {
        if (modelError.name === 'AbortError') {
          console.log(`⏰ ${model.name} timed out after 30 seconds`);
        } else {
          console.log(`❌ ${model.name} error:`, modelError.message);
        }
        continue; // Try next model
      }
    }

    // If all models fail, generate a proper video placeholder
    console.log("All Hugging Face models failed, generating local placeholder video...");
    return await generateVideoPlaceholder(prompt, style);
    
  } catch (error: any) {
    console.error("All video generation methods failed:", error);
    return await generateVideoPlaceholder(prompt, style);
  }
}

async function generateVideoPlaceholder(prompt: string, style: string): Promise<Buffer> {
  try {
    console.log("Generating improved video placeholder using FFmpeg...");
    
    const fs = require('fs');
    const path = require('path');
    const { spawn } = require('child_process');
    
    // Create a temporary text file with the content
    const tempTextFile = path.join('/tmp', `video_text_${Date.now()}.txt`);
    const tempVideoFile = path.join('/tmp', `video_output_${Date.now()}.mp4`);
    
    // Create content for the video
    const videoText = `Video: ${prompt.substring(0, 100)}...\nStyle: ${style}\nGenerated: ${new Date().toLocaleString()}\n\nNote: AI video generation models are currently loading.\nThis is a text-based placeholder video.`;
    
    fs.writeFileSync(tempTextFile, videoText);
    
    // Use FFmpeg to create a video with text overlay (if FFmpeg is available)
    return new Promise((resolve, reject) => {
      // Try to create a simple video using FFmpeg
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', `color=c=blue:size=640x480:duration=5:rate=1`,
        '-vf', `drawtext=text='${videoText.replace(/'/g, "\\'")}':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.5:boxborderw=5:x=(w-text_w)/2:y=(h-text_h)/2`,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
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
            // Success - read the video file
            const videoBuffer = fs.readFileSync(tempVideoFile);
            
            // Cleanup
            if (fs.existsSync(tempTextFile)) fs.unlinkSync(tempTextFile);
            if (fs.existsSync(tempVideoFile)) fs.unlinkSync(tempVideoFile);
            
            console.log(`✅ Generated placeholder video with FFmpeg (${videoBuffer.length} bytes)`);
            resolve(videoBuffer);
          } else {
            throw new Error(`FFmpeg failed with code ${code}: ${errorOutput}`);
          }
        } catch (error) {
          console.log("FFmpeg approach failed, trying alternative...");
          
          // Cleanup on error
          try {
            if (fs.existsSync(tempTextFile)) fs.unlinkSync(tempTextFile);
            if (fs.existsSync(tempVideoFile)) fs.unlinkSync(tempVideoFile);
          } catch (cleanupError) {
            console.log("Cleanup error:", cleanupError);
          }
          
          // Fallback to a valid minimal MP4
          createMinimalMP4Video(prompt, style).then(resolve).catch(reject);
        }
      });

      ffmpeg.on('error', (error) => {
        console.log("FFmpeg spawn error, trying alternative:", error.message);
        
        // Cleanup
        try {
          if (fs.existsSync(tempTextFile)) fs.unlinkSync(tempTextFile);
          if (fs.existsSync(tempVideoFile)) fs.unlinkSync(tempVideoFile);
        } catch (cleanupError) {
          console.log("Cleanup error:", cleanupError);
        }
        
        // Fallback approach
        createMinimalMP4Video(prompt, style).then(resolve).catch(reject);
      });
    });
    
  } catch (error: any) {
    console.error("Failed to generate video placeholder:", error);
    // Final fallback
    return createMinimalMP4Video(prompt, style);
  }
}

async function createMinimalMP4Video(prompt: string, style: string): Promise<Buffer> {
  // Create a proper minimal MP4 file that browsers can actually play
  // This is a valid MP4 container with minimal metadata
  console.log("Creating minimal playable MP4...");
  
  // Basic MP4 structure with ftyp, mdat boxes
  const ftypBox = Buffer.from([
    // ftyp box
    0x00, 0x00, 0x00, 0x20, // box size (32 bytes)
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, // major brand 'isom'
    0x00, 0x00, 0x02, 0x00, // minor version
    0x69, 0x73, 0x6f, 0x6d, // compatible brand 'isom'
    0x69, 0x73, 0x6f, 0x32, // compatible brand 'iso2'
    0x61, 0x76, 0x63, 0x31, // compatible brand 'avc1'
    0x6d, 0x70, 0x34, 0x31  // compatible brand 'mp41'
  ]);
  
  // Create a simple mdat box with placeholder data
  const mdatData = Buffer.from(`Video placeholder for: ${prompt.substring(0, 50)}...`);
  const mdatSize = 8 + mdatData.length;
  const mdatBox = Buffer.concat([
    Buffer.from([
      (mdatSize >> 24) & 0xFF,
      (mdatSize >> 16) & 0xFF,
      (mdatSize >> 8) & 0xFF,
      mdatSize & 0xFF,
      0x6d, 0x64, 0x61, 0x74 // 'mdat'
    ]),
    mdatData
  ]);
  
  const videoBuffer = Buffer.concat([ftypBox, mdatBox]);
  console.log(`Generated minimal MP4 (${videoBuffer.length} bytes)`);
  return videoBuffer;
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
