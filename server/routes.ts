import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
// Removed fastStorage imports - using existing cache system
// Using existing optimized storage layer
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

  // Create folder
  app.post("/api/folders", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const folderData = z.object({
        name: z.string(),
        path: z.string(),
        parentId: z.string().nullable().optional(),
        color: z.string().optional(),
        description: z.string().optional(),
      }).parse(req.body);

      const folder = await storage.createFolder({
        name: folderData.name,
        path: folderData.path,
        parentId: folderData.parentId || null,
        color: folderData.color,
        description: folderData.description,
        userId: userId,
      }, userId);

      res.json(folder);
    } catch (error) {
      console.error("Error creating folder:", error);
      res.status(500).json({ error: "Failed to create folder" });
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
        folderId: z.string().nullable().optional(),
      }).parse(req.body);

      // Normalize the object path
      const objectPath = objectStorageService.normalizeObjectEntityPath(fileData.uploadURL);

      const file = await storage.createFile({
        filename: fileData.filename,
        originalName: fileData.originalName,
        mimeType: fileData.mimeType,
        size: fileData.size,
        objectPath,
        folderId: fileData.folderId || null,
        processingStatus: "pending",
        userId: userId,
      }, userId);

      // Invalidate caches when new files are created
      // Cache invalidation handled in storage layer

      // Start processing in the background with raw file data for dual storage
      const rawFileData = req.file?.buffer;
      processFileAsync(file.id, userId, rawFileData);

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
      
      const files = await storage.getFiles(userId, limit, offset);
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
        console.log(`Browse mode: returning ${Array.isArray(files) ? files.length : 0} files`);
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

  // Serve files from cloud storage
  app.get("/api/files/:fileId/data", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const fileId = req.params.fileId;
      
      // Get file info
      const file = await storage.getFile(fileId, userId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Try BYTEA first (faster for files ≤10MB), fallback to cloud storage
      const fileData = await storage.getFileData(fileId, userId);
      
      if (fileData) {
        // Serve from BYTEA (faster)
        const sanitizedFilename = file.originalName.replace(/[^\w\-_\. ]/g, '');
        res.set({
          'Content-Type': file.mimeType,
          'Content-Length': fileData.length.toString(),
          'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
          'Cache-Control': 'private, max-age=3600'
        });
        res.send(fileData);
        console.log(`Served file ${file.originalName} from BYTEA (${fileData.length} bytes)`);
      } else {
        // Fallback to Google Cloud Storage
        const objectStorageService = new ObjectStorageService();
        const objectFile = await objectStorageService.getObjectEntityFile(file.objectPath);
        const [data] = await objectFile.download();
        
        const sanitizedFilename = file.originalName.replace(/[^\w\-_\. ]/g, '');
        res.set({
          'Content-Type': file.mimeType,
          'Content-Length': data.length.toString(),
          'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
          'Cache-Control': 'private, max-age=3600'
        });
        res.send(data);
        console.log(`Served file ${file.originalName} from cloud storage (${data.length} bytes)`);
        
        // Backfill BYTEA for small files
        if (data.length <= 10 * 1024 * 1024) { // ≤10MB
          await storage.updateFileData(fileId, userId, data);
          console.log(`Backfilled BYTEA storage for ${file.originalName}`);
        }
      }
    } catch (error) {
      console.error("Error serving file data:", error);
      res.status(500).json({ error: "Failed to serve file" });
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
      const { message, fileIds, chatHistory = [], conversationContext } = z.object({
        message: z.string(),
        fileIds: z.array(z.string()).optional().default([]),
        chatHistory: z.array(z.object({
          role: z.string(),
          content: z.string()
        })).optional().default([]),
        conversationContext: z.any().optional()
      }).parse(req.body);

      // Process with oversight agent
      const { processWithOversight } = await import("./oversightAgent");
      const { oversightInstructions, updatedContext } = await processWithOversight(
        message,
        chatHistory,
        conversationContext
      );

      // Get context files
      const files = fileIds.length > 0 ? await storage.getFilesByIds(fileIds, userId) : [];
      
      // Generate response using AI with oversight
      const response = await chatWithFiles(message, files, oversightInstructions);
      
      res.json({ 
        response,
        relatedFiles: fileIds,
        conversationContext: updatedContext
      });
    } catch (error) {
      console.error("Error in chat:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // Background processing function
  async function processFileAsync(fileId: string, userId: string, rawFileData?: Buffer) {
    try {
      await storage.updateFileProcessingStatus(fileId, userId, "processing");

      const file = await storage.getFile(fileId, userId);
      if (!file) {
        throw new Error("File not found");
      }

      // Get file data using hybrid storage (BYTEA + Cloud)
      let fileData: Buffer;
      if (rawFileData) {
        fileData = rawFileData;
        console.log("Using raw file data from upload");
        
        // Store in BYTEA if ≤10MB
        if (fileData.length <= 10 * 1024 * 1024 && !await storage.hasFileData(fileId, userId)) {
          await storage.updateFileData(fileId, userId, fileData);
          console.log(`Stored file data in BYTEA: ${file.filename}`);
        }
      } else {
        // Try BYTEA first (faster for ≤10MB files)
        const bytea = await storage.getFileData(fileId, userId);
        if (bytea) {
          fileData = bytea;
          console.log("Retrieved file data from BYTEA");
        } else {
          // Fallback to Google Cloud Storage
          const objectFile = await objectStorageService.getObjectEntityFile(file.objectPath);
          const [downloadedData] = await objectFile.download();
          fileData = downloadedData;
          console.log("Retrieved file data from cloud storage");
          
          // Backfill BYTEA if ≤10MB
          if (fileData.length <= 10 * 1024 * 1024) {
            await storage.updateFileData(fileId, userId, fileData);
            console.log(`Backfilled BYTEA storage: ${file.filename}`);
          }
        }
      }

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
      }, userId);

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
      }, userId);
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

  // Backfill existing files to dual storage
  app.post("/api/files/backfill-dual-storage", async (req: any, res) => {
    try {
      const userId = "demo-user";
      
      // Get all files that don't have BYTEA data yet
      // Get files that could benefit from BYTEA caching (≤10MB without file_content)
      const filesToBackfill = await storage.getFiles(userId, 100).then(files => 
        files.filter(f => f.size <= 10 * 1024 * 1024 && !f.fileContent)
      );
      
      if (filesToBackfill.length === 0) {
        return res.json({ message: "All files already have dual storage", count: 0 });
      }
      
      console.log(`Starting backfill for ${filesToBackfill.length} files...`);
      
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      
      for (const file of filesToBackfill) {
        try {
          console.log(`Backfilling file: ${file.originalName} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
          
          // Download from cloud storage
          const objectFile = await objectStorageService.getObjectEntityFile(file.objectPath);
          const [fileData] = await objectFile.download();
          
          // Store in database
          await storage.updateFileData(file.id, userId, fileData);
          // Storage type is now automatically hybrid for all files
          
          successCount++;
          console.log(`✓ Backfilled: ${file.originalName}`);
          
        } catch (error: any) {
          errorCount++;
          const errorMsg = `Failed to backfill ${file.originalName}: ${error?.message || 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
      
      const result = {
        message: `Backfill completed: ${successCount} successful, ${errorCount} failed`,
        successful: successCount,
        failed: errorCount,
        total: filesToBackfill.length,
        errors: errors
      };
      
      console.log("Backfill summary:", result);
      res.json(result);
      
    } catch (error) {
      console.error("Error in backfill operation:", error);
      res.status(500).json({ error: "Failed to backfill dual storage" });
    }
  });

  // Generate lesson prompts endpoint
  app.post("/api/generate-lesson-prompts", async (req: any, res) => {
    try {
      const { fileIds = [], folderIds = [], additionalContext } = req.body;

      // Get user (demo user for now)
      const userId = "demo-user";

      // Collect content from selected files and folders
      let contentSources: string[] = [];
      
      // Add additional context if provided
      if (additionalContext && additionalContext.trim()) {
        contentSources.push(`Additional Context: ${additionalContext.trim()}`);
      }
      
      // Get content from selected files (only include fully processed files)
      if (fileIds.length > 0) {
        const files = await storage.getFiles(userId, 100);
        const selectedFiles = files.filter(file => 
          fileIds.includes(file.id) && 
          file.processingStatus === "completed" && 
          file.processedAt !== null
        );
        
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

      // Get content from selected folders (only include fully processed files)
      if (folderIds.length > 0) {
        const files = await storage.getFiles(userId, 100);
        const folderFiles = files.filter(file => 
          file.folderId && 
          folderIds.includes(file.folderId) &&
          file.processingStatus === "completed" && 
          file.processedAt !== null
        );
        
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

      // If no content found, return error with helpful message
      if (contentSources.length === 0) {
        return res.status(400).json({ 
          error: "No content found in selected files or folders. Make sure the files have finished processing and contain extractable content." 
        });
      }

      // Combine all content for context
      const combinedContent = contentSources.join("\n\n---\n\n");
      
      // Generate structured lesson prompts using OpenAI
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
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
- Homework prompt must include: "Generate your response as quiz questions with answer keys included."`
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

Do not forget to include these format specifications in each individual prompt you create.`
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

  // Generate consolidated teacher agent prompt
  app.post("/api/generate-teacher-prompt", async (req: any, res) => {
    try {
      const { fileIds = [], folderIds = [], additionalContext, courseTitle, targetAudience } = req.body;

      const userId = "demo-user";
      let contentSources: string[] = [];
      
      if (additionalContext && additionalContext.trim()) {
        contentSources.push(`Additional Context: ${additionalContext.trim()}`);
      }
      
      // Get content from selected files (only processed ones)
      if (fileIds.length > 0) {
        const files = await storage.getFiles(userId, 100);
        const selectedFiles = files.filter(file => 
          fileIds.includes(file.id) && 
          file.processingStatus === "completed" && 
          file.processedAt !== null
        );
        
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

      // Get content from selected folders (only processed files)
      if (folderIds.length > 0) {
        const files = await storage.getFiles(userId, 100);
        const folderFiles = files.filter(file => 
          file.folderId && 
          folderIds.includes(file.folderId) &&
          file.processingStatus === "completed" && 
          file.processedAt !== null
        );
        
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

      if (contentSources.length === 0) {
        return res.status(400).json({ 
          error: "No content found in selected files or folders. Make sure the files have finished processing and contain extractable content." 
        });
      }

      const combinedContent = contentSources.join("\n\n---\n\n");
      
      // Get list of selected files and folders for the prompt display
      let filesList: string[] = [];
      let foldersList: string[] = [];
      
      if (fileIds.length > 0) {
        const allFiles = await storage.getFiles(userId, 100);
        const selectedFileNames = allFiles
          .filter(file => fileIds.includes(file.id) && file.processingStatus === "completed")
          .map(file => `• ${file.originalName}`);
        filesList = selectedFileNames;
      }
      
      if (folderIds.length > 0) {
        const allFolders = await storage.getFolders(userId);
        const selectedFolderNames = allFolders
          .filter(folder => folderIds.includes(folder.id))
          .map(folder => `• ${folder.name}`);
        foldersList = selectedFolderNames;
      }
      
      // Generate comprehensive teacher agent prompt (for display)
      const teacherPrompt = `# Master Teacher Agent for: ${courseTitle || 'Educational Course'}

## Target Audience: ${targetAudience || 'General learners'}

You are an experienced educator designing a complete course structure. Based on the provided content, you will act as a comprehensive teacher agent that creates educational materials across 5 key sections.

## Course Structure:
Your course should follow this 5-section structure:

### 1. INTRODUCTION SECTION
- Welcome students and set expectations
- Present course overview and learning objectives  
- Establish relevance and motivation
- **Output Format: PowerPoint slides** with clear slide titles, bullet points, and speaker notes

### 2. WARM-UP ACTIVITIES SECTION
- Create engaging pre-learning activities
- Activate prior knowledge and interest
- Build foundational concepts
- **Output Format: Interactive flashcards** with front/back content for each card

### 3. MAIN CONTENT SECTION  
- Present core educational material
- Explain key concepts with examples
- Include visual aids and detailed explanations
- **Output Format: Comprehensive PowerPoint slides** with detailed slide content and speaker notes

### 4. PRACTICE EXERCISES SECTION
- Design hands-on learning activities
- Create assessment opportunities
- Reinforce key concepts through application
- **Output Format: Interactive quiz questions** with multiple choice, true/false, or short answer format

### 5. HOMEWORK ASSIGNMENTS SECTION
- Extend learning beyond the classroom  
- Create independent practice opportunities
- Assess understanding and application
- **Output Format: Quiz questions with detailed answer keys** included

## Content Source Material:
${filesList.length > 0 ? `**Files:**\n${filesList.join('\n')}\n` : ''}${foldersList.length > 0 ? `**Folders:**\n${foldersList.join('\n')}\n` : ''}${additionalContext ? `**Additional Context:**\n${additionalContext}` : ''}

## Instructions for Teacher Agent:
1. Analyze all provided content thoroughly
2. Identify key learning objectives from the material
3. Design age-appropriate and engaging activities
4. Ensure logical flow between all sections
5. Create comprehensive materials for each section
6. Maintain consistent educational standards throughout
7. Include clear assessment criteria where appropriate

## Response Format:
Structure your response with clear section headers and follow the specified output formats for each section. Each section should be complete and ready for classroom implementation.

When you generate content, make it practical, engaging, and directly connected to the source materials provided. Focus on creating a cohesive learning experience that builds knowledge progressively through the 5 sections.`;

      // Create the full prompt with actual content for execution
      const teacherPromptWithContent = teacherPrompt.replace(
        `## Content Source Material:\n${filesList.length > 0 ? `**Files:**\n${filesList.join('\n')}\n` : ''}${foldersList.length > 0 ? `**Folders:**\n${foldersList.join('\n')}\n` : ''}${additionalContext ? `**Additional Context:**\n${additionalContext}` : ''}`,
        `## Content Source Material:\n${combinedContent}`
      );

      res.json({ 
        teacherPrompt,
        teacherPromptWithContent, // Send both versions
        courseTitle: courseTitle || 'Educational Course',
        targetAudience: targetAudience || 'General learners',
        contentSourcesCount: contentSources.length
      });

    } catch (error) {
      console.error("Error generating teacher prompt:", error);
      res.status(500).json({ 
        error: "Failed to generate teacher prompt",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Execute teacher agent prompt
  app.post("/api/execute-teacher-prompt", async (req: any, res) => {
    try {
      const { teacherPrompt } = req.body;
      
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are a master teacher and curriculum designer with expertise in creating comprehensive educational experiences. Generate complete, structured educational content following the specified format requirements."
          },
          {
            role: "user",
            content: teacherPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      });

      const result = completion.choices[0].message.content;
      if (!result) {
        throw new Error("No response from OpenAI");
      }

      res.json({ content: result });

    } catch (error) {
      console.error("Error executing teacher prompt:", error);
      res.status(500).json({ 
        error: "Failed to execute teacher prompt",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Chat with teacher agent
  app.post("/api/chat-teacher-agent", async (req: any, res) => {
    try {
      const { message, chatHistory = [], teacherContext } = req.body;
      
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Build conversation history
      const messages = [
        {
          role: "system",
          content: `You are a master teacher agent with expertise in curriculum design and educational content creation. You specialize in creating comprehensive courses with 5 structured sections: Introduction, Warm-up Activities, Main Content, Practice Exercises, and Homework Assignments.

${teacherContext ? `Current Course Context:\n${teacherContext}` : ''}

Your role is to:
- Help refine and improve educational content
- Answer questions about course structure and design
- Provide teaching best practices and pedagogical insights
- Suggest improvements to lesson plans and activities
- Adapt content for different learning styles and audiences

Maintain a professional, knowledgeable, and supportive tone while providing practical educational guidance.`
        },
        ...chatHistory.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        })),
        {
          role: "user",
          content: message
        }
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages,
        temperature: 0.7,
        max_tokens: 2000
      });

      const result = completion.choices[0].message.content;
      if (!result) {
        throw new Error("No response from OpenAI");
      }

      res.json({ response: result });

    } catch (error) {
      console.error("Error chatting with teacher agent:", error);
      res.status(500).json({ 
        error: "Failed to chat with teacher agent",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Execute individual lesson prompt against database
  app.post("/api/execute-lesson-prompt", async (req: any, res) => {
    try {
      const { prompt, promptType, fileIds = [], folderIds = [] } = req.body;
      const userId = "demo-user";

      // Collect all content from database as context
      let allContent: string[] = [];
      
      // Get content from selected files and folders (same as before)
      if (fileIds.length > 0) {
        const files = await storage.getFiles(userId, 100);
        const selectedFiles = files.filter(file => fileIds.includes(file.id));
        
        for (const file of selectedFiles) {
          try {
            const metadata = await storage.getFileMetadata(file.id, userId);
            if (metadata?.extractedText) {
              allContent.push(`File: ${file.originalName}\n${metadata.extractedText}`);
            }
          } catch (error) {
            console.error(`Error getting metadata for file ${file.id}:`, error);
          }
        }
      }

      if (folderIds.length > 0) {
        const files = await storage.getFiles(userId, 100);
        const folderFiles = files.filter(file => file.folderId && folderIds.includes(file.folderId));
        
        for (const file of folderFiles) {
          try {
            const metadata = await storage.getFileMetadata(file.id, userId);
            if (metadata?.extractedText) {
              allContent.push(`File: ${file.originalName}\n${metadata.extractedText}`);
            }
          } catch (error) {
            console.error(`Error getting metadata for file ${file.id}:`, error);
          }
        }
      }

      // Also get broader context from all processed files for richer content generation
      const allFiles = await storage.getFiles(userId, 50);
      const processedFiles = allFiles.filter(f => f.processingStatus === 'completed');
      
      for (const file of processedFiles.slice(0, 10)) { // Limit to avoid token overflow
        try {
          const metadata = await storage.getFileMetadata(file.id, userId);
          if (metadata?.extractedText && !allContent.some(content => content.includes(file.originalName))) {
            allContent.push(`Reference File: ${file.originalName}\n${metadata.extractedText.substring(0, 2000)}`);
          }
        } catch (error) {
          // Silent fail for reference content
        }
      }

      const combinedContent = allContent.join("\n\n---\n\n");
      
      // Add format requirements to prompt if not already present
      const formatRequirements = {
        'introduction': 'Generate your response as PowerPoint slides with clear slide titles, bullet points, and speaker notes.',
        'content': 'Generate your response as PowerPoint slides with detailed slide content and speaker notes.',
        'practice': 'Generate your response as quiz questions with multiple choice, true/false, or short answer format.',
        'homework': 'Generate your response as quiz questions with answer keys included.',
        'warmup': 'Generate your response as flashcards with front and back content for each card.'
      };
      
      let enhancedPrompt = prompt;
      const requirement = formatRequirements[promptType as keyof typeof formatRequirements];
      
      if (requirement && !prompt.toLowerCase().includes('generate your response as') && !prompt.toLowerCase().includes('powerpoint') && !prompt.toLowerCase().includes('flashcard') && !prompt.toLowerCase().includes('quiz')) {
        enhancedPrompt = `${prompt}\n\n${requirement}`;
      }
      
      // Execute the prompt with OpenAI
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: `You are executing a specialized lesson creation prompt. Use the provided content from the user's database to create high-quality educational material. Be specific, practical, and engaging. Reference the actual content when relevant.

Your response should be well-formatted, detailed, and ready to use in an educational setting. Include specific examples, activities, or materials based on the content provided.`
          },
          {
            role: "user",
            content: `${enhancedPrompt}

Based on the following content from the database:

${combinedContent}

Please generate detailed, specific lesson content following the prompt above.`
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      const result = completion.choices[0].message.content;
      if (!result) {
        throw new Error("No response from OpenAI");
      }
      
      res.json({ content: result });
    } catch (error) {
      console.error("Error executing lesson prompt:", error);
      res.status(500).json({ 
        error: "Failed to execute lesson prompt",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Avatar chat endpoint with natural voice synthesis
  app.post("/api/avatar-chat", async (req: any, res) => {
    try {
      const { message, avatarId, personality, chatHistory = [], conversationContext, voiceEnabled = false, voiceModel = "alloy" } = req.body;
      const userId = "demo-user";

      if (!message || !avatarId || !personality) {
        return res.status(400).json({ error: "Message, avatarId, and personality are required" });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Process with oversight agent
      const { processWithOversight } = await import("./oversightAgent");
      const { oversightInstructions, updatedContext } = await processWithOversight(
        message,
        chatHistory,
        conversationContext
      );

      // Get user's file context for enhanced responses
      let fileContext = "";
      let userStats = null;
      let recentFiles = [];
      let categories = [];

      try {
        // Get user statistics
        userStats = await storage.getFileStats(userId);
        
        // Get recent files (last 10)
        recentFiles = await storage.getFiles(userId, 10, 0);
        
        // Get file categories
        const rawCategories = await storage.getCategories(userId);
        categories = rawCategories.slice(0, 5); // Top 5 categories

        // Check if user is asking about specific files or wants to search
        const isFileRelated = /(?:files?|documents?|search|find|uploaded|analyze|summary|content)/i.test(message);
        
        if (isFileRelated || userStats.totalFiles > 0) {
          fileContext = `
User's File Library Context:
- Total Files: ${userStats.totalFiles}
- Processed Files: ${userStats.processedFiles} 
- Processing Files: ${userStats.processingFiles}
- Error Files: ${userStats.errorFiles}
- Total Size: ${(userStats.totalSize / (1024 * 1024)).toFixed(1)}MB

Top Categories: ${categories.map(c => `${c.category} (${c.count})`).join(", ")}

Recent Files: ${recentFiles.slice(0, 5).map(f => `${f.originalName} (${f.mimeType})`).join(", ")}

Note: You can help users search, analyze, and manage their files. If they ask about specific content, suggest using the search feature or browsing their files.`;
        }

        // If the message seems like a search query, try to provide search results
        if (/(?:search|find|look for|where|what files)/i.test(message)) {
          const searchTerms = message.replace(/(?:search|find|look for|where|what files|do I have)/gi, '').trim();
          if (searchTerms.length > 2) {
            try {
              const searchResults = await storage.searchFiles(searchTerms, userId, 5);
              if (searchResults.length > 0) {
                fileContext += `\n\nSearch Results for "${searchTerms}":
${searchResults.map(f => `- ${f.originalName}: ${f.metadata?.summary || 'No summary available'}`).join('\n')}`;
              }
            } catch (searchError) {
              console.log("Search error in avatar chat:", searchError);
            }
          }
        }
      } catch (contextError) {
        console.log("Error getting file context for avatar:", contextError);
        fileContext = "User file context unavailable.";
      }

      // Build conversation context from chat history with oversight
      const conversationMessages = [
        {
          role: "system",
          content: `You are an AI avatar with the following personality: ${personality}

You are helping users with a smart file management and AI-powered document analysis system. You have access to information about their uploaded files and can help them:
- Search and find specific documents
- Get summaries and insights from their files  
- Understand what content they have uploaded
- Navigate their file organization
- Suggest ways to analyze or work with their documents

${fileContext}

${oversightInstructions}

IMPORTANT: Be natural and conversational. Avoid being robotic or overly formal. Use these guidelines:
- Speak naturally, as if you're having a real conversation with a friend
- Use contractions (I'm, you're, let's, etc.) to sound more natural
- Vary your sentence structure and length
- Show genuine personality and emotion appropriate to your character
- Use natural transitions and conversational phrases
- Don't be overly enthusiastic or use excessive exclamation marks
- Sound human, not like a customer service bot

When discussing files or documents, be helpful but conversational.
Keep responses appropriately sized - usually 1-3 paragraphs unless asked for more.`
        }
      ];

      // Add recent chat history for context (limit to last 5 exchanges)
      const recentHistory = chatHistory.slice(-10);
      for (const msg of recentHistory) {
        conversationMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }

      // Add the current user message
      conversationMessages.push({
        role: "user",
        content: message
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: conversationMessages as any,
        temperature: 0.9, // Slightly higher for more natural variation
        max_tokens: 1000,
        presence_penalty: 0.1, // Encourage variety
        frequency_penalty: 0.1 // Reduce repetition
      });

      const result = completion.choices[0].message.content;
      if (!result) {
        throw new Error("No response from OpenAI");
      }

      // Generate natural voice if enabled
      let audioBase64 = null;
      if (voiceEnabled) {
        try {
          // Available voices: alloy, echo, fable, onyx, nova, shimmer
          // alloy: neutral and fast
          // echo: male voice
          // fable: British accent
          // onyx: deep male voice  
          // nova: female voice
          // shimmer: soft female voice
          const voiceResponse = await openai.audio.speech.create({
            model: "tts-1", // or "tts-1-hd" for higher quality
            voice: voiceModel as any, // Use the selected voice model
            input: result,
            response_format: "mp3",
            speed: 1.0 // Natural speaking speed
          });

          // Convert to base64 for easy transmission
          const audioBuffer = Buffer.from(await voiceResponse.arrayBuffer());
          audioBase64 = audioBuffer.toString('base64');
        } catch (voiceError) {
          console.error("Error generating voice:", voiceError);
          // Continue without voice if it fails
        }
      }

      res.json({ 
        response: result,
        audioData: audioBase64,
        conversationContext: updatedContext 
      });
    } catch (error) {
      console.error("Error in avatar chat:", error);
      res.status(500).json({ 
        error: "Failed to get avatar response",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
