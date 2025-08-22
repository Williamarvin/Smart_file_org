import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
// Removed fastStorage imports - using existing cache system
// Using existing optimized storage layer
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { GoogleDriveService } from "./googleDriveService";
import { extractFileMetadata, generateContentEmbedding, generateSearchEmbedding, findSimilarContent, generateContentFromFiles, chatWithFiles, transcribeVideo } from "./openai";
import { db } from "./db";
import { files, folders } from "@shared/schema";
import { eq, sql, desc, and } from "drizzle-orm";
// Removed authentication
import multer from "multer";
import PDFParse from "pdf-parse";
import mammoth from "mammoth";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const upload = multer({ storage: multer.memoryStorage() });

// Disk storage for Excel files
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp')
  },
  filename: function (req, file, cb) {
    cb(null, `excel-${Date.now()}-${file.originalname}`)
  }
});

const uploadDisk = multer({ storage: diskStorage });

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

      // Start processing in the background
      // Files are uploaded directly to cloud storage, so we process from there
      processFileAsync(file.id, userId);

      res.json(file);
    } catch (error) {
      console.error("Error creating file record:", error);
      res.status(500).json({ error: "Failed to create file record" });
    }
  });

  // Get all files with optional filtering by processing status
  app.get("/api/files", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const processingStatus = req.query.processingStatus as string;
      
      let filesList;
      if (processingStatus && processingStatus !== 'all') {
        console.log(`Filtering files by processingStatus: ${processingStatus}`);
        // Query database directly with processing status filter
        const query = db
          .select()
          .from(files)
          .where(
            and(
              eq(files.userId, userId),
              eq(files.processingStatus, processingStatus)
            )
          )
          .limit(limit)
          .offset(offset);
        
        filesList = await query;
        console.log(`Found ${filesList.length} files with status ${processingStatus}`);
      } else {
        filesList = await storage.getFiles(userId, limit, offset);
      }
      
      res.json(filesList);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  // Get files with detailed processing status
  app.get("/api/files/processing-status", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const status = req.query.status as string || 'all';
      
      // Get ALL files directly from database (including failed, pending, etc)
      const allFiles = await db
        .select({
          id: files.id,
          filename: files.filename,
          originalName: files.originalName,
          mimeType: files.mimeType,
          size: files.size,
          objectPath: files.objectPath,
          folderId: files.folderId,
          uploadedAt: files.uploadedAt,
          processedAt: files.processedAt,
          processingStatus: files.processingStatus,
          processingError: files.processingError,
          userId: files.userId
        })
        .from(files)
        .where(eq(files.userId, userId));
      
      // Get folder names for mapping
      const folderList = await db
        .select({
          id: folders.id,
          name: folders.name
        })
        .from(folders)
        .where(eq(folders.userId, userId));
      
      const folderMap = new Map(folderList.map(f => [f.id, f.name]));
      
      // Format results with proper processing info
      const results = allFiles.map(file => ({
        id: file.id,
        filename: file.filename || file.originalName,
        processingStatus: file.processingStatus || 'pending',
        processingStartedAt: file.uploadedAt,
        processingError: file.processingError,
        processingDuration: file.processedAt && file.uploadedAt 
          ? new Date(file.processedAt).getTime() - new Date(file.uploadedAt).getTime()
          : 0,
        fileType: file.mimeType || 'unknown',
        fileSize: file.size || 0,
        folderId: file.folderId || null,
        folderName: file.folderId ? folderMap.get(file.folderId) : null
      }));
      
      // Filter based on status
      let filteredResults = results;
      if (status !== 'all') {
        if (status === 'stuck') {
          // Files that have been processing or pending for over 2 hours
          filteredResults = results.filter(f => {
            if (!f.processingStartedAt) return false;
            const startTime = new Date(f.processingStartedAt).getTime();
            const now = Date.now();
            const isStuck = (now - startTime) > 2 * 60 * 60 * 1000;
            return isStuck && (f.processingStatus === 'processing' || f.processingStatus === 'pending');
          });
        } else {
          filteredResults = results.filter(f => f.processingStatus === status);
        }
      }
      
      res.json(filteredResults);
    } catch (error) {
      console.error("Error fetching processing status:", error);
      res.status(500).json({ error: "Failed to fetch processing status" });
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

  // Delete file (works for any status including processing)
  app.delete("/api/files/:id", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const file = await storage.getFile(req.params.id, userId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // Log if deleting a file stuck in processing
      if (file.processingStatus === 'processing') {
        console.log(`Deleting file stuck in processing: ${file.originalName} (uploaded: ${file.uploadedAt})`);
      }

      // Delete from database (works for any status)
      await storage.deleteFile(req.params.id, userId);
      
      // TODO: Also delete from Google Cloud Storage
      // const objectStorageService = new ObjectStorageService();
      // await objectStorageService.deleteObject(file.objectPath);
      
      res.json({ success: true, deletedFile: file.originalName });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Retry processing for stuck files
  app.post("/api/files/:id/retry-processing", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const fileId = req.params.id;
      
      const file = await storage.getFile(fileId, userId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Only retry if file is in processing, error, or failed status (not completed or skipped)
      if (file.processingStatus !== 'processing' && 
          file.processingStatus !== 'error' && 
          file.processingStatus !== 'failed') {
        return res.status(400).json({ 
          error: "File is not eligible for retry", 
          currentStatus: file.processingStatus 
        });
      }
      
      console.log(`Retrying processing for file: ${file.originalName} (status: ${file.processingStatus})`);
      
      // Process file asynchronously
      processFileAsync(fileId, userId).catch(err => {
        console.error(`Failed to retry processing for ${fileId}:`, err);
      });
      
      res.json({ 
        message: "Processing retry initiated", 
        fileId, 
        filename: file.originalName 
      });
    } catch (error) {
      console.error("Error retrying file processing:", error);
      res.status(500).json({ error: "Failed to retry processing" });
    }
  });

  // Mark stuck files as failed
  app.post("/api/files/:id/mark-failed", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const fileId = req.params.id;
      const { reason = "Manual failure - stuck in processing" } = req.body;
      
      const file = await storage.getFile(fileId, userId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Only mark as failed if file is in processing status
      if (file.processingStatus !== 'processing') {
        return res.status(400).json({ 
          error: "File is not in processing status", 
          currentStatus: file.processingStatus 
        });
      }
      
      console.log(`Marking file as failed: ${file.originalName} - Reason: ${reason}`);
      
      // Update status to error
      await storage.updateFileProcessingStatus(fileId, userId, "error", reason);
      
      res.json({ 
        message: "File marked as failed", 
        fileId, 
        filename: file.originalName,
        reason 
      });
    } catch (error) {
      console.error("Error marking file as failed:", error);
      res.status(500).json({ error: "Failed to mark file as failed" });
    }
  });

  // Process Google Drive files - download actual content
  // Test Google Drive access for a single file
  app.post('/api/test-drive-access', async (req: any, res) => {
    const { fileUrl } = req.body;
    
    if (!fileUrl) {
      return res.status(400).json({ error: 'fileUrl is required' });
    }
    
    try {
      const driveService = new GoogleDriveService();
      await driveService.waitForInit();
      
      const fileId = driveService.extractFileId(fileUrl);
      
      if (!fileId) {
        return res.status(400).json({ error: 'Invalid Google Drive URL' });
      }
      
      console.log(`Testing access to file ID: ${fileId} from URL: ${fileUrl}`);
      
      // Try to get metadata first
      const metadata = await driveService.getFileMetadata(fileUrl);
      
      if (metadata) {
        console.log('Successfully retrieved metadata:', metadata);
        
        // Now try to download
        const content = await driveService.downloadFile(fileUrl);
        
        if (content) {
          return res.json({
            success: true,
            message: 'File is accessible',
            metadata,
            contentSize: content.length
          });
        } else {
          return res.json({
            success: false,
            message: 'Could not download file content',
            metadata
          });
        }
      } else {
        return res.json({
          success: false,
          message: 'Could not retrieve file metadata'
        });
      }
    } catch (error: any) {
      console.error('Test failed:', error);
      return res.status(500).json({
        error: 'Failed to test file access',
        details: error.message
      });
    }
  });
  
  // Delete orphaned files (files without folder IDs)
  app.delete('/api/files/orphaned', async (req: any, res) => {
    try {
      const userId = "demo-user";
      console.log('Deleting orphaned files for user:', userId);
      
      // Get count of orphaned files first
      const orphanedCount = await storage.getOrphanedFilesCount(userId);
      
      // Delete all orphaned files
      const deletedCount = await storage.deleteOrphanedFiles(userId);
      
      res.json({
        success: true,
        message: `Deleted ${deletedCount} orphaned files`,
        orphanedCount,
        deletedCount
      });
    } catch (error) {
      console.error('Error deleting orphaned files:', error);
      res.status(500).json({ 
        error: 'Failed to delete orphaned files',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/files/process-drive-files', async (req: any, res) => {
    try {
      const userId = "demo-user";
      console.log('Starting Google Drive file processing for user:', userId);
      
      // Import the processor (lazy loading to avoid circular dependencies)
      const { driveFileProcessor } = await import('./driveFileProcessor');
      
      // Process all Google Drive files for the user
      const result = await driveFileProcessor.processAllDriveFiles(userId);
      
      res.json({
        success: true,
        message: 'Google Drive file processing completed',
        ...result
      });
    } catch (error) {
      console.error('Error processing Google Drive files:', error);
      res.status(500).json({ 
        error: 'Failed to process Google Drive files',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Process a single Google Drive file
  app.post('/api/files/:id/process-drive', async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { id: fileId } = req.params;
      
      // Import the processor
      const { driveFileProcessor } = await import('./driveFileProcessor');
      
      // Process the specific file
      const success = await driveFileProcessor.processFileById(fileId);
      
      if (success) {
        res.json({
          success: true,
          message: 'File processed successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to process file'
        });
      }
    } catch (error) {
      console.error('Error processing Google Drive file:', error);
      res.status(500).json({ 
        error: 'Failed to process Google Drive file',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Process all pending files in batch
  app.post("/api/files/process-pending", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const limit = req.body.limit || 10; // Process in batches to avoid overload
      
      // Get all pending files
      const pendingFiles = await db
        .select()
        .from(files)
        .where(
          and(
            eq(files.userId, userId),
            eq(files.processingStatus, "pending")
          )
        )
        .limit(limit);
      
      console.log(`Starting batch processing for ${pendingFiles.length} pending files`);
      
      // Start processing each file asynchronously
      const processingPromises = pendingFiles.map(file => {
        console.log(`Triggering processing for: ${file.filename || file.originalName}`);
        return processFileAsync(file.id, userId).catch(err => {
          console.error(`Failed to process ${file.id}:`, err);
          return { error: err.message, fileId: file.id };
        });
      });
      
      // Don't wait for completion, just trigger them
      Promise.all(processingPromises).then(results => {
        const failed = results.filter(r => r && r.error);
        console.log(`Batch processing completed. Failed: ${failed.length}/${pendingFiles.length}`);
      });
      
      res.json({ 
        message: `Started processing ${pendingFiles.length} files`,
        filesQueued: pendingFiles.length,
        files: pendingFiles.map(f => ({
          id: f.id,
          filename: f.filename || f.originalName
        }))
      });
    } catch (error) {
      console.error("Error starting batch processing:", error);
      res.status(500).json({ error: "Failed to start batch processing" });
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
        console.log(`Selected files for prompt: ${filesList.length} files`, filesList);
      }
      
      if (folderIds.length > 0) {
        const allFolders = await storage.getFolders(userId);
        const selectedFolderNames = allFolders
          .filter(folder => folderIds.includes(folder.id))
          .map(folder => `• ${folder.name}`);
        foldersList = selectedFolderNames;
        console.log(`Selected folders for prompt: ${foldersList.length} folders`, foldersList);
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
${filesList.length > 0 ? `**Files:**\n${filesList.join('\n')}\n\n` : ''}${foldersList.length > 0 ? `**Folders:**\n${foldersList.join('\n')}\n\n` : ''}${additionalContext ? `**Additional Context:**\n${additionalContext}\n` : ''}
${filesList.length === 0 && foldersList.length === 0 && !additionalContext ? 'No specific files or folders selected.' : ''}

## Instructions for Teacher Agent:
1. Analyze all provided content thoroughly
2. Identify key learning objectives from the material
3. Design age-appropriate and engaging activities
4. Ensure logical flow between all sections
5. Create comprehensive materials for each section
6. Maintain consistent educational standards throughout
7. Include clear assessment criteria where appropriate
8. **Encourage Active Learning**: Throughout the course, include:
   - Questions that prompt student thinking and discussion
   - "Pause and reflect" moments for students to process information
   - "Try it yourself" activities and hands-on practice opportunities
   - Group discussion prompts and peer learning activities
   - Regular check-ins like "Does everyone understand?" or "Any questions?"
   - Encouragement for students to ask questions and explore concepts

## Response Format:
Structure your response with clear section headers and follow the specified output formats for each section. Each section should be complete and ready for classroom implementation.

When you generate content, make it practical, engaging, and directly connected to the source materials provided. Focus on creating a cohesive learning experience that builds knowledge progressively through the 5 sections.`;

      // Create the full prompt with actual content for execution
      const teacherPromptWithContent = teacherPrompt.replace(
        `## Content Source Material:\n${filesList.length > 0 ? `**Files:**\n${filesList.join('\n')}\n` : ''}${foldersList.length > 0 ? `**Folders:**\n${foldersList.join('\n')}\n` : ''}${additionalContext ? `**Additional Context:**\n${additionalContext}` : ''}`,
        `## Content Source Material:\n${combinedContent}`
      );

      // Generate pre-filled sections using OpenAI
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const sectionPrompt = `Based on the following content, create a structured course with 5 sections. Provide specific, detailed content for each section.

Course Title: ${courseTitle || 'Educational Course'}
Target Audience: ${targetAudience || 'General learners'}

Content to base the course on:
${combinedContent.substring(0, 3000)} // Limit content to avoid token limits

Please provide content for each section in the following format:

## Introduction
[Write 3-5 sentences introducing the topic, starting with a hook and stating learning objectives. Be specific and engaging.]

## Warm-up Activities
[Write 3-5 sentences describing vocabulary review or concept activation exercises. Include specific examples.]

## Main Content
[Write 5-7 sentences covering the core teaching content with key concepts and examples. Be detailed and comprehensive.]

## Practice Activities
[Write 3-5 sentences describing hands-on practice exercises and application tasks. Include specific activities.]

## Wrap-up and Homework
[Write 3-5 sentences summarizing key points and describing homework assignments. Be specific about tasks.]`;

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a master teacher creating structured lesson content. Provide specific, actionable content for each section based on the provided materials. Be detailed and practical."
            },
            {
              role: "user",
              content: sectionPrompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        });

        const generatedContent = completion.choices[0].message.content || "";
        
        // Parse the generated content into sections
        const sections = {
          introduction: "",
          warmup: "",
          mainContent: "",
          practice: "",
          wrapup: ""
        };
        
        // Extract content for each section
        const introMatch = generatedContent.match(/##\s*Introduction\s*\n([\s\S]*?)(?=##\s*Warm-up|$)/i);
        const warmupMatch = generatedContent.match(/##\s*Warm-up.*?\n([\s\S]*?)(?=##\s*Main\s*Content|$)/i);
        const mainMatch = generatedContent.match(/##\s*Main\s*Content\s*\n([\s\S]*?)(?=##\s*Practice|$)/i);
        const practiceMatch = generatedContent.match(/##\s*Practice.*?\n([\s\S]*?)(?=##\s*Wrap-up|$)/i);
        const wrapupMatch = generatedContent.match(/##\s*Wrap-up.*?\n([\s\S]*?)$/i);
        
        if (introMatch) sections.introduction = introMatch[1].trim();
        if (warmupMatch) sections.warmup = warmupMatch[1].trim();
        if (mainMatch) sections.mainContent = mainMatch[1].trim();
        if (practiceMatch) sections.practice = practiceMatch[1].trim();
        if (wrapupMatch) sections.wrapup = wrapupMatch[1].trim();
        
        // Update the teacher prompt with the generated sections content
        const updatedTeacherPrompt = generatedContent;
        
        res.json({ 
          teacherPrompt: updatedTeacherPrompt, // Now contains the generated sections
          teacherPromptWithContent: teacherPromptWithContent, // Full prompt for execution
          courseTitle: courseTitle || 'Educational Course',
          targetAudience: targetAudience || 'General learners',
          contentSourcesCount: contentSources.length,
          sections: sections // Send parsed sections for the UI
        });
      } catch (openaiError) {
        console.error("Error generating sections with OpenAI:", openaiError);
        // Fallback to original response if OpenAI fails
        res.json({ 
          teacherPrompt,
          teacherPromptWithContent,
          courseTitle: courseTitle || 'Educational Course',
          targetAudience: targetAudience || 'General learners',
          contentSourcesCount: contentSources.length
        });
      }

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
      const { message, chatHistory = [], teacherContext, fileIds = [], folderIds = [] } = req.body;
      
      // Get actual file and folder content if provided
      let fileContent = "";
      let folderContent = "";
      
      if (fileIds.length > 0 || folderIds.length > 0) {
        const userId = "demo-user"; // Use hardcoded user ID like other routes
        
        // Get files content
        if (fileIds.length > 0) {
          const selectedFiles = await storage.getFilesByIds(fileIds, userId);
          for (const file of selectedFiles) {
            const metadata = await storage.getFileMetadata(file.id, userId);
            if (metadata?.extractedText) {
              fileContent += `\n\nFile: ${file.originalName}\nContent:\n${metadata.extractedText.substring(0, 2000)}\n`;
            }
          }
        }
        
        // Get folder files content  
        if (folderIds.length > 0) {
          for (const folderId of folderIds) {
            const folderFiles = await storage.getFilesByFolder(folderId, userId);
            for (const file of folderFiles) {
              const metadata = await storage.getFileMetadata(file.id, userId);
              if (metadata?.extractedText) {
                folderContent += `\n\nFile in folder: ${file.originalName}\nContent:\n${metadata.extractedText.substring(0, 2000)}\n`;
              }
            }
          }
        }
      }
      
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Build conversation history
      const messages = [
        {
          role: "system",
          content: `You are a warm, engaging teacher in a classroom setting. You speak naturally and conversationally, as if you're standing in front of your students. 

Your teaching style:
- Start with a warm greeting like "Good morning class!" or "Hello everyone!"
- Use natural transitions like "Now, let me tell you about..." or "This is really interesting because..."
- Include personal touches: "I love this topic because..." or "In my experience..."
- Be enthusiastic and passionate about the subject matter
- Use relatable examples and stories from the uploaded materials

IMPORTANT - Ask Direct, Topic-Specific Questions:
- Based on the content, ask specific questions like: "Why do you think [specific concept] works this way?"
- "Can anyone tell me what happens when [specific scenario from the material]?"
- "Looking at this example, what would you predict if we changed [specific variable]?"
- "Who can explain how [concept A] relates to [concept B]?"
- Never ask generic questions like "Do you have any questions?" - always ask specific, thought-provoking questions about the material

Mention Supplementary Materials (but don't generate them):
- "I'll prepare flashcards to help you memorize these key terms"
- "I'm creating a PowerPoint presentation to visualize these concepts better"
- "We'll have a quiz later to check your understanding"
- "I'll generate practice problems for homework"
- But NEVER actually generate these materials - just mention you'll provide them

Check Understanding with Direct Questions:
- "Sarah, can you explain why [specific concept] is important?"
- "John, what would happen if we applied this principle to [real-world example]?"
- "Everyone, think about this: How does [topic] affect your daily life?"

When teaching or responding:
- Don't provide outlines or bullet points
- Speak as if you're actually teaching the lesson RIGHT NOW
- Start with an engaging introduction about the specific topic
- Ask DIRECT questions: "Based on what we learned, why does [specific concept] work this way?"
- Mention resources: "I'm preparing flashcards for these key terms" or "The PowerPoint will visualize this concept"
- Flow naturally through the material with specific questions to check understanding
- End with specific questions for students to ponder: "Think about how [concept] applies to [real scenario]"

${teacherContext ? `Current Course Context and Materials:
${teacherContext}

You have full access to all the content from the selected files and folders. You can:
- Reference specific examples and concepts from the course materials
- Quote directly from the source documents when relevant
- Explain concepts using the exact terminology from the files
- Draw connections between different parts of the materials
- Answer questions about any specific details in the documents` : ''}

${fileContent ? `\nActual File Content:\n${fileContent}` : ''}
${folderContent ? `\nActual Folder Content:\n${folderContent}` : ''}

Remember: 
- You're GIVING the lesson as a real teacher would, not explaining its structure
- Ask DIRECT, SPECIFIC questions about the topic throughout your teaching
- Mention supplementary materials you'll provide (flashcards, PowerPoint, quizzes) but don't actually create them
- Base all your questions and examples on the actual content from the uploaded files/folders
- Encourage active participation by asking students to answer your specific questions`
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

  // Save teacher chat session
  app.post("/api/teacher-chat-sessions", async (req: any, res) => {
    try {
      const userId = "demo-user"; // Use hardcoded user ID like other routes
      const { 
        title, 
        courseTitle, 
        targetAudience,
        teachingStyle,
        expertiseSubject, 
        teacherPrompt, 
        teacherContent,
        chatHistory,
        selectedFiles,
        selectedFolders 
      } = req.body;
      
      const session = await storage.saveTeacherChatSession({
        title,
        courseTitle,
        targetAudience,
        teachingStyle,
        expertiseSubject,
        teacherPrompt,
        teacherContent,
        chatHistory,
        selectedFiles,
        selectedFolders,
        isPublic: 0,
        userId
      });
      
      res.json(session);
    } catch (error) {
      console.error("Error saving chat session:", error);
      res.status(500).json({ error: "Failed to save chat session" });
    }
  });
  
  // Get user's teacher chat sessions
  app.get("/api/teacher-chat-sessions", async (req: any, res) => {
    try {
      const userId = "demo-user"; // Use hardcoded user ID like other routes
      const sessions = await storage.getUserTeacherChatSessions(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Error getting chat sessions:", error);
      res.status(500).json({ error: "Failed to get chat sessions" });
    }
  });
  
  // Get shared teacher chat session
  app.get("/api/teacher-chat-sessions/share/:shareId", async (req: any, res) => {
    try {
      const { shareId } = req.params;
      const session = await storage.getTeacherChatSessionByShareId(shareId);
      
      if (!session || session.isPublic !== 1) {
        return res.status(404).json({ error: "Session not found or not public" });
      }
      
      res.json(session);
    } catch (error) {
      console.error("Error getting shared session:", error);
      res.status(500).json({ error: "Failed to get shared session" });
    }
  });
  
  // Update session sharing status
  app.patch("/api/teacher-chat-sessions/:sessionId/share", async (req: any, res) => {
    try {
      const userId = "demo-user"; // Use hardcoded user ID like other routes
      const { sessionId } = req.params;
      const { isPublic } = req.body;
      
      const session = await storage.updateTeacherChatSessionSharing(
        sessionId, 
        userId, 
        isPublic ? 1 : 0
      );
      
      res.json(session);
    } catch (error) {
      console.error("Error updating session sharing:", error);
      res.status(500).json({ error: "Failed to update session sharing" });
    }
  });
  
  // Delete teacher chat session
  app.delete("/api/teacher-chat-sessions/:sessionId", async (req: any, res) => {
    try {
      const userId = "demo-user"; // Use hardcoded user ID like other routes
      const { sessionId } = req.params;
      
      await storage.deleteTeacherChatSession(sessionId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting session:", error);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // Text-to-speech for teacher agent
  app.post("/api/teacher-speak", async (req: any, res) => {
    try {
      const { text, voice = "alloy" } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }
      
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const mp3 = await openai.audio.speech.create({
        model: "tts-1", // Using tts-1 for faster generation (not tts-1-hd)
        voice: voice as any,
        input: text,
        speed: 1.0 // Normal speed on server, we'll speed up on client
      });
      
      const buffer = Buffer.from(await mp3.arrayBuffer());
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
      });
      
      res.send(buffer);
      
    } catch (error) {
      console.error("Error generating speech:", error);
      res.status(500).json({ 
        error: "Failed to generate speech",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Validation Reports API endpoints
  
  // Create validation report from chat session
  app.post("/api/validation-reports/validate", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { PDFGenerator } = await import("./pdfGenerator");
      const { ValidationService } = await import("./validationService");
      
      const {
        sessionId,
        originalParameters,
        chatHistory,
        reportTitle
      } = req.body;
      
      if (!originalParameters || !chatHistory) {
        return res.status(400).json({ error: "Missing required parameters" });
      }
      
      // Extract parameters from chat session
      const actualParameters = ValidationService.extractParametersFromChatSession(chatHistory);
      
      // If sessionId provided, also get session data
      if (sessionId) {
        const sessions = await storage.getUserTeacherChatSessions(userId);
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
          // Override with session data if available
          if (session.courseTitle) actualParameters.courseTitle = session.courseTitle;
          if (session.targetAudience) actualParameters.targetAudience = session.targetAudience;
          if (session.teachingStyle) actualParameters.teachingStyle = session.teachingStyle;
          if (session.expertiseSubject) actualParameters.expertiseSubject = session.expertiseSubject;
        }
      }
      
      // Compare parameters
      const { deviations, complianceScore } = ValidationService.compareParameters(
        originalParameters,
        actualParameters
      );
      
      // Create validation report
      const report = await storage.createValidationReport({
        userId,
        sessionId: sessionId || null,
        originalParameters,
        actualParameters,
        deviations,
        complianceScore,
        reportTitle: reportTitle || `Validation Report - ${new Date().toLocaleDateString()}`,
        reportData: {
          reportTitle: reportTitle || `Validation Report - ${new Date().toLocaleDateString()}`,
          sessionId,
          originalParameters,
          actualParameters,
          deviations,
          complianceScore,
          createdAt: new Date()
        },
        reportPdfPath: null // Will be generated on demand
      });
      
      res.json(report);
    } catch (error) {
      console.error("Error creating validation report:", error);
      res.status(500).json({ 
        error: "Failed to create validation report",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Get all validation reports for user
  app.get("/api/validation-reports", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const reports = await storage.getValidationReports(userId);
      res.json(reports);
    } catch (error) {
      console.error("Error getting validation reports:", error);
      res.status(500).json({ error: "Failed to get validation reports" });
    }
  });
  
  // Get single validation report
  app.get("/api/validation-reports/:reportId", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { reportId } = req.params;
      
      const report = await storage.getValidationReport(reportId, userId);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      res.json(report);
    } catch (error) {
      console.error("Error getting validation report:", error);
      res.status(500).json({ error: "Failed to get validation report" });
    }
  });
  
  // Download validation report as PDF
  app.get("/api/validation-reports/:reportId/pdf", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { reportId } = req.params;
      
      const report = await storage.getValidationReport(reportId, userId);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      const { PDFGenerator } = await import("./pdfGenerator");
      
      // Generate PDF from report data
      const pdfBuffer = await PDFGenerator.generateValidationReport(report.reportData as any);
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="validation-report-${reportId}.pdf"`,
        'Content-Length': pdfBuffer.length.toString()
      });
      
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating PDF report:", error);
      res.status(500).json({ error: "Failed to generate PDF report" });
    }
  });
  
  // Delete validation report
  app.delete("/api/validation-reports/:reportId", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { reportId } = req.params;
      
      await storage.deleteValidationReport(reportId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting validation report:", error);
      res.status(500).json({ error: "Failed to delete validation report" });
    }
  });
  
  // Test endpoint to validate a sample session
  app.post("/api/validation-reports/test", async (req: any, res) => {
    try {
      const { ValidationService } = await import("./validationService");
      
      // Sample original parameters
      const originalParameters = {
        courseTitle: "Introduction to Algebra",
        targetAudience: "High school students",
        teachingStyle: "visual",
        expertiseSubject: "mathematics",
        actionTypes: ["lecture", "discussion", "activity"],
        durations: [15, 20, 25],
        difficultyLevels: ["beginner", "intermediate"]
      };
      
      // Sample chat history (simulating actual usage)
      const chatHistory = [
        { role: "user", content: "Can you explain this concept?" },
        { role: "assistant", content: "Let me provide a visual explanation of algebra concepts. For beginners, we'll start with basic equations. This will involve some hands-on activities and discussion." },
        { role: "user", content: "Can we make it more advanced?" },
        { role: "assistant", content: "Sure! Let's move to intermediate level concepts. We'll include more analytical problems and advanced exercises." }
      ];
      
      // Extract and compare
      const actualParameters = ValidationService.extractParametersFromChatSession(chatHistory);
      const { deviations, complianceScore } = ValidationService.compareParameters(
        originalParameters,
        actualParameters
      );
      
      res.json({
        originalParameters,
        actualParameters,
        deviations,
        complianceScore,
        message: "Test validation completed successfully"
      });
    } catch (error) {
      console.error("Error in test validation:", error);
      res.status(500).json({ error: "Test validation failed" });
    }
  });

  // Excel file processing endpoints
  
  // Process uploaded Excel file
  app.post("/api/excel/process", uploadDisk.single('file'), async (req: any, res) => {
    try {
      const userId = "demo-user";
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Check if it's an Excel file
      const validExtensions = ['.xlsx', '.xls', '.csv'];
      const fileExtension = path.extname(req.file.originalname).toLowerCase();
      
      if (!validExtensions.includes(fileExtension)) {
        // Clean up uploaded file
        if (req.file.path) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ 
          error: "Invalid file type. Please upload an Excel file (.xlsx, .xls) or CSV file" 
        });
      }

      console.log('Processing Excel file:', req.file.originalname);
      
      // Import and use the Excel processor
      const { ExcelProcessor } = await import("./excelProcessor");
      const processor = new ExcelProcessor(userId);
      
      // Process the Excel file with original filename
      const result = await processor.processExcelFile(req.file.path, req.file.originalname);
      
      // Clean up the uploaded file
      if (req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      
      console.log('Excel processing complete:', result.summary);
      
      res.json({
        success: true,
        ...result
      });
      
    } catch (error) {
      console.error("Error processing Excel file:", error);
      
      // Clean up uploaded file on error
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error("Error cleaning up file:", cleanupError);
        }
      }
      
      res.status(500).json({ 
        error: "Failed to process Excel file",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get Excel upload URL for client-side upload
  app.post("/api/excel/upload-url", async (req: any, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting Excel upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Process Excel file from URL
  app.post("/api/excel/process-url", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const { fileUrl, fileName } = req.body;
      
      if (!fileUrl) {
        return res.status(400).json({ error: "No file URL provided" });
      }

      // Download the file first
      const tempPath = path.join('/tmp', `excel-${nanoid()}.xlsx`);
      
      // If it's an internal object storage URL, download it
      // Otherwise, fetch from external URL
      if (fileUrl.startsWith('/objects/')) {
        // Internal object storage - need to download
        const objectStorageService = new ObjectStorageService();
        // TODO: Implement download method
        return res.status(501).json({ error: "Internal object download not yet implemented" });
      } else {
        // External URL - fetch it
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.statusText}`);
        }
        
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(tempPath, Buffer.from(buffer));
      }

      // Process the Excel file
      const { ExcelProcessor } = await import("./excelProcessor");
      const processor = new ExcelProcessor(userId);
      const result = await processor.processExcelFile(tempPath);
      
      // Clean up
      fs.unlinkSync(tempPath);
      
      res.json({
        success: true,
        ...result
      });
      
    } catch (error) {
      console.error("Error processing Excel from URL:", error);
      res.status(500).json({ 
        error: "Failed to process Excel file from URL",
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
