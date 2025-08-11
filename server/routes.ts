import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { extractFileMetadata, generateContentEmbedding, findSimilarContent, generateContentFromFiles, chatWithFiles } from "./openai";
import multer from "multer";
import PDFParse from "pdf-parse";
import mammoth from "mammoth";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

async function extractTextFromFile(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  try {
    switch (mimeType) {
      case "application/pdf":
        const pdfData = await PDFParse(buffer);
        return pdfData.text;
      
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        const docxResult = await mammoth.extractRawText({ buffer });
        return docxResult.value;
      
      case "text/plain":
        return buffer.toString("utf-8");
      
      default:
        throw new Error(`Unsupported file type: ${mimeType}`);
    }
  } catch (error: any) {
    throw new Error(`Failed to extract text from ${filename}: ${error?.message || "Unknown error"}`);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const objectStorageService = new ObjectStorageService();

  // Get upload URL for file
  app.post("/api/files/upload-url", async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Create file record after upload
  app.post("/api/files", async (req, res) => {
    try {
      const fileData = z.object({
        filename: z.string(),
        originalName: z.string(),
        mimeType: z.string(),
        size: z.number(),
        uploadURL: z.string(),
      }).parse(req.body);

      // Normalize the object path
      const objectPath = objectStorageService.normalizeObjectEntityPath(fileData.uploadURL);

      const file = await storage.createFile({
        filename: fileData.filename,
        originalName: fileData.originalName,
        mimeType: fileData.mimeType,
        size: fileData.size,
        objectPath,
        processingStatus: "pending",
        userId: null, // TODO: Add user authentication
      });

      // Start processing in the background
      processFileAsync(file.id);

      res.json(file);
    } catch (error) {
      console.error("Error creating file record:", error);
      res.status(500).json({ error: "Failed to create file record" });
    }
  });

  // Get all files
  app.get("/api/files", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const files = await storage.getFiles(limit, offset);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  // Get files by category
  app.get("/api/files/category/:category", async (req, res) => {
    try {
      const category = req.params.category as string;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const files = await storage.getFilesByCategory(category, limit);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files by category:", error);
      res.status(500).json({ error: "Failed to fetch files by category" });
    }
  });

  // Get file categories with counts
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // Get specific file
  app.get("/api/files/:id", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const metadata = await storage.getFileMetadata(file.id);
      res.json({ ...file, metadata });
    } catch (error) {
      console.error("Error fetching file:", error);
      res.status(500).json({ error: "Failed to fetch file" });
    }
  });

  // Delete file
  app.delete("/api/files/:id", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // TODO: Delete from object storage as well
      await storage.deleteFile(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Search files
  app.get("/api/search/:query", async (req, res) => {
    try {
      const query = req.params.query as string;
      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }
      
      console.log(`Searching for: "${query}"`);

      const files = await storage.searchFiles(query);
      console.log(`Found ${files.length} files matching "${query}"`);
      console.log(`Files:`, files.map(f => ({ id: f.id, filename: f.filename, hasMetadata: !!f.metadata })));
      
      // Store search history
      if (files.length > 0) {
        try {
          await storage.createSearchHistory({
            query,
            results: files.map(f => ({ id: f.id, similarity: 100 })),
            userId: null,
          });
        } catch (error) {
          console.error("Error storing search history:", error);
        }
      }

      console.log(`Returning ${files.length} files`);
      res.json(files);
    } catch (error) {
      console.error("Error searching files:", error);
      res.status(500).json({ error: "Failed to search files" });
    }
  });

  // Get file statistics
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getFileStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });

  // Serve files from object storage
  app.get("/objects/:objectPath(*)", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving file:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Generate content using existing files
  app.post("/api/generate-content", async (req, res) => {
    try {
      const { prompt, fileIds, type } = z.object({
        prompt: z.string(),
        fileIds: z.array(z.string()),
        type: z.string(),
      }).parse(req.body);

      // Get files and their content
      const files = await storage.getFilesByIds(fileIds);
      if (files.length === 0) {
        return res.status(400).json({ error: "No valid files found" });
      }

      // Combine file contents for context
      const fileContents = files.map(file => ({
        filename: file.filename,
        content: file.extractedText || "",
        category: file.metadata?.category || "uncategorized"
      }));

      // Generate content using AI
      const generatedContent = await generateContentFromFiles(prompt, fileContents, type);
      
      res.json({ content: generatedContent });
    } catch (error) {
      console.error("Error generating content:", error);
      res.status(500).json({ error: "Failed to generate content" });
    }
  });

  // Chat with files endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, fileIds } = z.object({
        message: z.string(),
        fileIds: z.array(z.string()).optional().default([]),
      }).parse(req.body);

      // Get context files
      const files = fileIds.length > 0 ? await storage.getFilesByIds(fileIds) : [];
      
      // Generate response using AI
      const response = await chatWithFiles(message, files);
      
      res.json({ 
        response,
        relatedFiles: fileIds
      });
    } catch (error) {
      console.error("Error in chat:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // Background processing function
  async function processFileAsync(fileId: string) {
    try {
      await storage.updateFileProcessingStatus(fileId, "processing");

      const file = await storage.getFile(fileId);
      if (!file) {
        throw new Error("File not found");
      }

      // Get file from object storage
      const objectFile = await objectStorageService.getObjectEntityFile(file.objectPath);
      const [fileData] = await objectFile.download();

      // Extract text from file
      const extractedText = await extractTextFromFile(fileData, file.mimeType, file.originalName);

      // Generate metadata using GPT
      const metadata = await extractFileMetadata(extractedText, file.originalName);

      // Generate embedding for similarity search
      const embedding = await generateContentEmbedding(extractedText);

      // Save metadata
      await storage.createFileMetadata({
        fileId: file.id,
        summary: metadata.summary,
        keywords: metadata.keywords,
        topics: metadata.topics,
        categories: metadata.categories,
        extractedText: extractedText.slice(0, 10000), // Store first 10k chars
        embedding,
        confidence: metadata.confidence,
      });

      await storage.updateFileProcessedAt(fileId);

      console.log(`Successfully processed file: ${file.originalName}`);
    } catch (error: any) {
      console.error(`Error processing file ${fileId}:`, error);
      await storage.updateFileProcessingStatus(fileId, "error", error?.message || "Unknown error");
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}
