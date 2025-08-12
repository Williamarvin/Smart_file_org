import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { extractFileMetadata, generateContentEmbedding, generateSearchEmbedding, findSimilarContent, generateContentFromFiles, chatWithFiles, transcribeVideo } from "./openai";
// Removed authentication
import multer from "multer";
import PDFParse from "pdf-parse";
import mammoth from "mammoth";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

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
      
      // Video file types
      case "video/mp4":
      case "video/avi":
      case "video/mov":
      case "video/wmv":
      case "video/flv":
      case "video/webm":
      case "video/mkv":
        // For video files, we need to save the buffer to a temporary file first
        const tempVideoPath = path.join('/tmp', `video_${nanoid()}_${filename}`);
        fs.writeFileSync(tempVideoPath, buffer);
        
        try {
          const transcription = await transcribeVideo(tempVideoPath);
          // Clean up temporary file
          fs.unlinkSync(tempVideoPath);
          return transcription;
        } catch (videoError) {
          // Clean up temporary file even if transcription fails
          if (fs.existsSync(tempVideoPath)) {
            fs.unlinkSync(tempVideoPath);
          }
          throw videoError;
        }
      
      default:
        throw new Error(`Unsupported file type: ${mimeType}`);
    }
  } catch (error: any) {
    throw new Error(`Failed to extract text from ${filename}: ${error?.message || "Unknown error"}`);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Mock user endpoint - no authentication
  app.get('/api/auth/user', async (req: any, res) => {
    // Return a mock user for testing
    res.json({
      id: "demo-user",
      email: "demo@example.com",
      firstName: "Demo",
      lastName: "User",
      profileImageUrl: null
    });
  });

  const objectStorageService = new ObjectStorageService();

  // Get upload URL for file
  app.post("/api/files/upload-url", async (req: any, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Create file record after upload
  app.post("/api/files", async (req: any, res) => {
    try {
      const userId = "demo-user";
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
        userId: "demo-user",
      });

      // Start processing in the background
      processFileAsync(file.id, userId);

      res.json(file);
    } catch (error) {
      console.error("Error creating file record:", error);
      res.status(500).json({ error: "Failed to create file record" });
    }
  });

  // Get all files
  app.get("/api/files", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const files = await storage.getFiles("demo-user", limit, offset);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  // Get files by category
  app.get("/api/files/category/:category", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const category = req.params.category as string;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const files = await storage.getFilesByCategory(category, "demo-user", limit);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files by category:", error);
      res.status(500).json({ error: "Failed to fetch files by category" });
    }
  });

  // Get file categories with counts
  // Category mapping function to standardize categories
  function normalizeCategory(category: string): string {
    const categoryMap: { [key: string]: string } = {
      'educational': 'Education',
      'education': 'Education',
      'academic': 'Education',
      'learning': 'Education',
      'business': 'Business',
      'corporate': 'Business',
      'work': 'Business',
      'professional': 'Business',
      'technical': 'Technology',
      'technology': 'Technology',
      'tech': 'Technology',
      'programming': 'Technology',
      'software': 'Technology',
      'entertainment': 'Entertainment',
      'fun': 'Entertainment',
      'music': 'Entertainment',
      'video': 'Entertainment',
      'health': 'Health',
      'medical': 'Health',
      'wellness': 'Health',
      'finance': 'Finance',
      'financial': 'Finance',
      'money': 'Finance',
      'investment': 'Finance',
      'science': 'Science',
      'research': 'Science',
      'scientific': 'Science',
      'news': 'News',
      'current events': 'News',
      'politics': 'News',
      'personal': 'Personal',
      'life': 'Personal',
      'diary': 'Personal',
      'reference': 'Reference',
      'documentation': 'Reference',
      'manual': 'Reference',
      'guide': 'Reference'
    };
    
    return categoryMap[category.toLowerCase()] || 'Reference';
  }

  app.get("/api/categories", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const rawCategories = await storage.getCategories(userId);
      
      // Normalize and aggregate categories
      const normalizedCategories: { [key: string]: number } = {};
      for (const cat of rawCategories) {
        const normalized = normalizeCategory(cat.category);
        normalizedCategories[normalized] = (normalizedCategories[normalized] || 0) + cat.count;
      }
      
      // Convert back to array format
      const categories = Object.entries(normalizedCategories).map(([category, count]) => ({
        category,
        count
      })).sort((a, b) => b.count - a.count);
      
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // Get specific file
  app.get("/api/files/:id", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const file = await storage.getFile(req.params.id, userId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const metadata = await storage.getFileMetadata(file.id, userId);
      res.json({ ...file, metadata });
    } catch (error) {
      console.error("Error fetching file:", error);
      res.status(500).json({ error: "Failed to fetch file" });
    }
  });

  // Delete file
  app.delete("/api/files/:id", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const file = await storage.getFile(req.params.id, userId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // TODO: Delete from object storage as well
      await storage.deleteFile(req.params.id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Browse/Search files - returns all files when query is empty, searches when query provided
  app.get("/api/search/:query?", async (req, res) => {
    try {
      const query = req.params.query as string;
      const userId = "demo-user";
      
      // If no query provided, return all files (browse mode)
      if (!query || query.trim() === '') {
        console.log("No search query provided, returning all files (browse mode)");
        const files = await storage.getFiles(userId, 50, 0);
        console.log(`Browse mode: returning ${files.length} files`);
        res.json(files);
        return;
      }
      
      console.log(`Searching for: "${query}"`);

      // Use pgvector semantic similarity search with text fallback
      let files: any[] = [];
      
      try {
        console.log("Attempting pgvector semantic similarity search...");
        const queryEmbedding = await generateSearchEmbedding(query);
        files = await storage.searchFilesBySimilarity(queryEmbedding, userId);
        console.log(`Pgvector semantic search found ${files.length} files`);
        
        // If semantic search found no relevant results, fallback to text search
        if (files.length === 0) {
          console.log("Semantic search returned no relevant results (similarity threshold not met), trying text search fallback...");
          files = await storage.searchFiles(query, userId, 20);
          console.log(`Text search fallback found ${files.length} files`);
        }
      } catch (embeddingError) {
        console.error("Semantic search failed, falling back to text search:", embeddingError);
        // Fallback to text-based search
        files = await storage.searchFiles(query, userId, 20);
        console.log(`Text search found ${files.length} files`);
      }

      console.log(`Found ${files.length} files matching "${query}"`);
      console.log(`Files:`, files.map(f => ({ 
        id: f.id, 
        filename: f.filename, 
        hasMetadata: !!f.metadata,
        similarity: f.similarity ? (f.similarity * 100).toFixed(1) + '%' : 'N/A'
      })));
      
      // Store search history
      if (files.length > 0) {
        try {
          await storage.createSearchHistory({
            query,
            userId,
            results: files.map(f => ({ id: f.id, similarity: 100 })),
          }, userId);
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
  app.get("/api/stats", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const stats = await storage.getFileStats(userId);
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
  app.post("/api/generate-content", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { prompt, fileIds, type } = z.object({
        prompt: z.string(),
        fileIds: z.array(z.string()),
        type: z.string(),
      }).parse(req.body);

      // Get files and their content
      const files = await storage.getFilesByIds(fileIds, userId);
      if (files.length === 0) {
        return res.status(400).json({ error: "No valid files found" });
      }

      // Combine file contents for context
      const fileContents = files.map(file => ({
        filename: file.filename,
        content: file.metadata?.extractedText || "",
        category: file.metadata?.categories?.[0] || "uncategorized"
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
  app.post("/api/chat", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { message, fileIds } = z.object({
        message: z.string(),
        fileIds: z.array(z.string()).optional().default([]),
      }).parse(req.body);

      // Get context files
      const files = fileIds.length > 0 ? await storage.getFilesByIds(fileIds, userId) : [];
      
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
  async function processFileAsync(fileId: string, userId: string) {
    try {
      await storage.updateFileProcessingStatus(fileId, userId, "processing");

      const file = await storage.getFile(fileId, userId);
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

      await storage.updateFileProcessedAt(fileId, userId);

      console.log(`Successfully processed file: ${file.originalName}`);
    } catch (error: any) {
      console.error(`Error processing file ${fileId}:`, error);
      await storage.updateFileProcessingStatus(fileId, userId, "error", error?.message || "Unknown error");
    }
  }

  // Folder management endpoints
  // Get all folders (for move dialog)
  app.get("/api/folders/all", async (req: any, res) => {
    try {
      const userId = "demo-user";
      console.log("Getting all folders for user:", userId);
      const allFolders = await storage.getAllFolders(userId);
      res.json(allFolders);
    } catch (error) {
      console.error("Error getting all folders:", error);
      res.status(500).json({ error: "Failed to get folders" });
    }
  });

  app.get("/api/folders", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const parentId = req.query.parentId === 'null' ? null : req.query.parentId;
      console.log(`Getting folders for parent: ${parentId}`);
      
      const folders = await storage.getFolders(userId, parentId);
      res.json(folders);
    } catch (error) {
      console.error("Error getting folders:", error);
      res.status(500).json({ error: "Failed to get folders" });
    }
  });

  app.post("/api/folders", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const folderData = z.object({
        name: z.string().min(1),
        parentId: z.string().optional().nullable(),
        color: z.string().optional(),
        description: z.string().optional(),
      }).parse(req.body);

      const folder = await storage.createFolder({
        path: `/${folderData.name}`,
        name: folderData.name,
        userId: userId,
        color: folderData.color || undefined,
        description: folderData.description || undefined,
        parentId: folderData.parentId || null,
      });
      res.status(201).json(folder);
    } catch (error) {
      console.error("Error creating folder:", error);
      res.status(500).json({ error: "Failed to create folder" });
    }
  });

  app.put("/api/folders/:id", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { id } = req.params;
      const updates = z.object({
        name: z.string().min(1).optional(),
        color: z.string().optional(),
        description: z.string().optional(),
      }).parse(req.body);

      await storage.updateFolder(id, userId, updates);
      const folder = await storage.getFolder(id, userId);
      res.json(folder);
    } catch (error) {
      console.error("Error updating folder:", error);
      res.status(500).json({ error: "Failed to update folder" });
    }
  });

  app.delete("/api/folders/:id", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { id } = req.params;

      await storage.deleteFolder(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting folder:", error);
      res.status(500).json({ error: "Failed to delete folder" });
    }
  });

  app.get("/api/folders/:id/files", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { id } = req.params;
      const folderId = id === 'root' ? null : id;

      const files = await storage.getFilesInFolder(folderId, userId);
      res.json(files);
    } catch (error) {
      console.error("Error getting files in folder:", error);
      res.status(500).json({ error: "Failed to get files" });
    }
  });

  app.put("/api/files/:fileId/move", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { fileId } = req.params;
      const { folderId } = z.object({
        folderId: z.string().nullable(),
      }).parse(req.body);

      await storage.moveFileToFolder(fileId, folderId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error moving file:", error);
      res.status(500).json({ error: "Failed to move file" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
