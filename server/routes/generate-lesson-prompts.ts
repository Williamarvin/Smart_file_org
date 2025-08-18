import express from "express";
import OpenAI from "openai";
import { storage } from "../storage.js";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// POST /generate-lesson-prompts - Generate structured lesson prompts
router.post("/", async (req, res) => {
  try {
    const { fileIds = [], folderIds = [] } = req.body;

    // Get user (demo user for now)
    const userId = "demo-user";

    // Collect content from selected files and folders
    let contentSources: string[] = [];
    
    // Get content from selected files
    if (fileIds.length > 0) {
      const files = await storage.getFiles(userId, 100);
      const selectedFiles = files.filter(file => fileIds.includes(file.id));
      
      for (const file of selectedFiles) {
        try {
          const metadata = await storage.getFileMetadata(file.id, userId);
          if (metadata?.extractedText) {
            contentSources.push(`File: ${file.originalName}\n${metadata.extractedText}`);
          }
        } catch (error) {
          console.error(`Error getting metadata for file ${file.id}:`, error);
        }
      }
    }

    // Get content from selected folders (get files in those folders)
    if (folderIds.length > 0) {
      const files = await storage.getFiles(userId, 100);
      const folderFiles = files.filter(file => file.folderId && folderIds.includes(file.folderId));
      
      for (const file of folderFiles) {
        try {
          const metadata = await storage.getFileMetadata(file.id, userId);
          if (metadata?.extractedText) {
            contentSources.push(`File: ${file.originalName}\n${metadata.extractedText}`);
          }
        } catch (error) {
          console.error(`Error getting metadata for file ${file.id}:`, error);
        }
      }
    }

    // If no content found, return error
    if (contentSources.length === 0) {
      return res.status(400).json({ 
        error: "No content found in selected files and folders" 
      });
    }

    // Combine all content for context
    const combinedContent = contentSources.join("\n\n---\n\n");
    
    // Generate structured lesson prompts using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are an expert educational content designer. Based on the provided content, generate 5 different prompts for 5 specialized lesson creation agents. Each prompt should be detailed and specific to help that agent create high-quality educational content.

The 5 agents are:
1. Introduction Agent - Creates engaging lesson introductions
2. Warm-Up Agent - Designs warm-up activities and icebreakers  
3. Content Agent - Develops main lesson content and materials
4. Practice Agent - Creates practice exercises and activities
5. Homework Agent - Designs homework assignments and assessments

For each agent, create a detailed prompt that:
- References the specific content provided
- Gives clear instructions for that agent's role
- Includes specific guidelines for the type of content to create
- Considers the target audience and learning objectives

Return the response as JSON with this structure:
{
  "prompts": {
    "introduction": "detailed prompt for introduction agent...",
    "warmup": "detailed prompt for warm-up agent...", 
    "content": "detailed prompt for content agent...",
    "practice": "detailed prompt for practice agent...",
    "homework": "detailed prompt for homework agent..."
  }
}`
        },
        {
          role: "user",
          content: `Based on the following educational content, generate 5 specialized lesson creation prompts:

${combinedContent}

Please analyze this content and create detailed prompts for each of the 5 lesson creation agents.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 3000
    });

    const result = completion.choices[0].message.content;
    if (!result) {
      throw new Error("No response from OpenAI");
    }

    const parsedResult = JSON.parse(result);
    
    res.json(parsedResult);
  } catch (error) {
    console.error("Error generating lesson prompts:", error);
    res.status(500).json({ 
      error: "Failed to generate lesson prompts",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;