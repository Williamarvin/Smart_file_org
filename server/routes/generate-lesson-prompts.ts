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
      const files = await storage.getFiles(userId, 1000);
      const selectedFiles = files.filter((file) => fileIds.includes(file.id));

      console.log(
        `Found ${selectedFiles.length} selected files out of ${fileIds.length} requested`,
      );

      for (const file of selectedFiles) {
        try {
          const metadata = await storage.getFileMetadata(file.id, userId);
          if (metadata?.extractedText) {
            contentSources.push(
              `File: ${file.originalName}\n${metadata.extractedText}`,
            );
          }
        } catch (error) {
          console.error(`Error getting metadata for file ${file.id}:`, error);
        }
      }
    }

    // Get content from selected folders (including subfolders recursively)
    if (folderIds.length > 0) {
      const allFiles = await storage.getFiles(userId, 1000);

      // Function to get all folder IDs recursively
      const getAllSubfolderIds = async (
        parentIds: string[],
      ): Promise<string[]> => {
        let allFolderIds = [...parentIds];
        const folders = await storage.getAllFolders(userId);

        console.log(`Total folders available: ${folders.length}`);

        for (const parentId of parentIds) {
          const subfolders = folders.filter((f) => f.parentId === parentId);
          console.log(
            `Found ${subfolders.length} direct subfolders for folder ${parentId}`,
          );

          if (subfolders.length > 0) {
            const subfolderIds = subfolders.map((f) => f.id);
            allFolderIds = [...allFolderIds, ...subfolderIds];
            // Recursively get subfolders of subfolders
            const deeperSubfolders = await getAllSubfolderIds(subfolderIds);
            allFolderIds = [...allFolderIds, ...deeperSubfolders];
          }
        }

        return Array.from(new Set(allFolderIds)); // Remove duplicates
      };

      // Get all folder IDs including subfolders
      const allFolderIds = await getAllSubfolderIds(folderIds);
      console.log(
        `Processing ${allFolderIds.length} folders (including subfolders)`,
      );

      const folderFiles = allFiles.filter(
        (file) => file.folderId && allFolderIds.includes(file.folderId),
      );

      console.log(`Found ${folderFiles.length} files in selected folders`);

      for (const file of folderFiles) {
        try {
          const metadata = await storage.getFileMetadata(file.id, userId);
          if (metadata?.extractedText) {
            contentSources.push(
              `File: ${file.originalName}\n${metadata.extractedText}`,
            );
          }
        } catch (error) {
          console.error(`Error getting metadata for file ${file.id}:`, error);
        }
      }
    }

    console.log(`Total content sources found: ${contentSources.length}`);

    // If no content found, return error
    if (contentSources.length === 0) {
      return res.status(400).json({
        error: "No content found in selected files and folders",
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
1. Introduction Agent - Creates engaging lesson introductions AS POWERPOINT SLIDES
2. Warm-Up Agent - Designs warm-up activities AS FLASHCARDS
3. Content Agent - Develops main lesson content AS POWERPOINT SLIDES
4. Practice Agent - Creates practice exercises AS QUIZ QUESTIONS
5. Homework Agent - Designs homework assignments AS QUIZ QUESTIONS

IMPORTANT OUTPUT FORMAT REQUIREMENTS:
- Introduction Agent: Must generate PowerPoint slide format with clear slide titles, bullet points, and speaker notes
- Warm-Up Agent: Must generate flashcard format with front/back content for each card
- Content Agent: Must generate PowerPoint slide format with detailed slide content and speaker notes
- Practice Agent: Must generate quiz format with multiple choice, true/false, or short answer questions
- Homework Agent: Must generate quiz format with questions and answer keys

For each agent, create a detailed prompt that:
- References the specific content provided
- Gives clear instructions for that agent's role and REQUIRED OUTPUT FORMAT
- Includes specific guidelines for the type of content to create
- Considers the target audience and learning objectives
- EXPLICITLY states the required output format (PowerPoint slides, flashcards, or quiz)

Return the response as JSON with this structure:
{
  "prompts": {
    "introduction": "detailed prompt for introduction agent that MUST specify PowerPoint slide output...",
    "warmup": "detailed prompt for warm-up agent that MUST specify flashcard output...", 
    "content": "detailed prompt for content agent that MUST specify PowerPoint slide output...",
    "practice": "detailed prompt for practice agent that MUST specify quiz output...",
    "homework": "detailed prompt for homework agent that MUST specify quiz output..."
  }
}

CRITICAL: Each generated prompt MUST explicitly include the required output format. For example:
- Introduction prompt must include: "Generate your response as PowerPoint slides with clear slide titles, bullet points, and speaker notes."
- Warm-up prompt must include: "Generate your response as flashcards with front and back content for each card."
- Content prompt must include: "Generate your response as PowerPoint slides with detailed slide content and speaker notes."
- Practice prompt must include: "Generate your response as quiz questions with multiple choice, true/false, or short answer format."
- Homework prompt must include: "Generate your response as quiz questions with answer keys included."`,
        },
        {
          role: "user",
          content: `Based on the following educational content, generate 5 specialized lesson creation prompts:

${combinedContent}

Please analyze this content and create detailed prompts for each of the 5 lesson creation agents.

MANDATORY: Each prompt you generate MUST include explicit output format instructions:
- Introduction prompt MUST include: "Generate your response as PowerPoint slides with clear slide titles, bullet points, and speaker notes."
- Warm-up prompt MUST include: "Generate your response as flashcards with front and back content for each card."
- Content prompt MUST include: "Generate your response as PowerPoint slides with detailed slide content and speaker notes."
- Practice prompt MUST include: "Generate your response as quiz questions with multiple choice, true/false, or short answer format."
- Homework prompt MUST include: "Generate your response as quiz questions with answer keys included."

Do not forget to include these format specifications in each individual prompt you create.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 3000,
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
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
