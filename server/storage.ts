import { 
  users,
  files, 
  fileMetadata, 
  searchHistory,
  folders,
  teacherChatSessions,
  validationReports,
  type User,
  type UpsertUser,
  type File, 
  type InsertFile, 
  type FileMetadata,
  type InsertFileMetadata,
  type FileWithMetadata,
  type InsertSearchHistory,
  type SearchHistory,
  type Folder,
  type InsertFolder,
  type FolderWithChildren,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, sql, and, inArray, ne, isNull, asc, lt } from "drizzle-orm";
import { cache } from "./cache";

// Storage interface for cloud-only file management

import type { InsertTeacherChatSession, TeacherChatSession, InsertValidationReport, ValidationReport } from "@shared/schema";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // File operations
  createFile(file: InsertFile, userId: string, rawFileData?: Buffer): Promise<File>;
  getFile(id: string, userId: string): Promise<File | undefined>;
  getFiles(userId: string, limit?: number, offset?: number): Promise<FileWithMetadata[]>;
  updateFileProcessingStatus(id: string, userId: string, status: string, error?: string): Promise<void>;
  updateFileProcessedAt(id: string, userId: string): Promise<void>;
  deleteFile(id: string, userId: string): Promise<void>;
  
  // File metadata operations
  createFileMetadata(metadata: InsertFileMetadata, userId: string): Promise<FileMetadata>;
  getFileMetadata(fileId: string, userId: string): Promise<FileMetadata | undefined>;
  updateFileMetadata(fileId: string, userId: string, metadata: Partial<InsertFileMetadata>): Promise<void>;
  
  // Search operations
  searchFiles(query: string, userId: string, limit?: number): Promise<FileWithMetadata[]>;
  searchFilesBySimilarity(embedding: number[], userId: string, limit?: number): Promise<FileWithMetadata[]>;
  createSearchHistory(search: InsertSearchHistory, userId: string): Promise<SearchHistory>;
  
  // Statistics
  getFileStats(userId: string): Promise<{
    totalFiles: number;
    processedFiles: number;
    processingFiles: number;
    errorFiles: number;
    totalSize: number;
    byteaSize: number;
    cloudSize: number;
  }>;
  
  // Batch operations
  getFilesByIds(ids: string[], userId: string): Promise<FileWithMetadata[]>;
  getFilesByCategory(category: string, userId: string, limit?: number): Promise<FileWithMetadata[]>;
  getCategories(userId: string): Promise<{ category: string; count: number }[]>;
  
  // Folder operations
  createFolder(folder: InsertFolder, userId: string): Promise<Folder>;
  getFolder(id: string, userId: string): Promise<Folder | undefined>;
  getFolders(userId: string, parentId?: string | null): Promise<FolderWithChildren[]>;
  getAllFolders(userId: string): Promise<Folder[]>;
  updateFolder(id: string, userId: string, updates: Partial<InsertFolder>): Promise<void>;
  deleteFolder(id: string, userId: string): Promise<void>;
  moveFolderContents(fromFolderId: string, toFolderId: string | null, userId: string): Promise<void>;
  getFolderPath(folderId: string, userId: string): Promise<string>;
  
  // File-folder operations
  moveFileToFolder(fileId: string, folderId: string | null, userId: string): Promise<void>;
  getFilesInFolder(folderId: string | null, userId: string): Promise<FileWithMetadata[]>;
  getFilesByFolder(folderId: string, userId: string): Promise<FileWithMetadata[]>;
  
  // Teacher chat sessions
  saveTeacherChatSession(session: InsertTeacherChatSession): Promise<TeacherChatSession>;
  getUserTeacherChatSessions(userId: string): Promise<TeacherChatSession[]>;
  getTeacherChatSessionByShareId(shareId: string): Promise<TeacherChatSession | null>;
  updateTeacherChatSessionSharing(sessionId: string, userId: string, isPublic: number): Promise<TeacherChatSession>;
  deleteTeacherChatSession(sessionId: string, userId: string): Promise<void>;
  
  // Validation reports
  createValidationReport(report: InsertValidationReport): Promise<ValidationReport>;
  getValidationReports(userId: string): Promise<ValidationReport[]>;
  getValidationReport(reportId: string, userId: string): Promise<ValidationReport | undefined>;
  deleteValidationReport(reportId: string, userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async createFile(insertFile: InsertFile, userId: string, rawFileData?: Buffer): Promise<File> {
    // Invalidate cache when new files are created
    cache.invalidatePattern(`files:${userId}:`);
    
    const maxBytea = 10 * 1024 * 1024; // 10MB limit for BYTEA storage
    const shouldStoreBytea = rawFileData && rawFileData.length <= maxBytea;
    
    console.log(`Creating file: ${insertFile.filename}, size: ${insertFile.size} bytes, BYTEA: ${shouldStoreBytea ? 'yes' : 'no (>10MB)'}`);
    
    // Insert into files table with hybrid storage
    const fileValues = {
      ...insertFile,
      userId,
      storageType: 'hybrid' as const,
      processingStatus: 'pending' as const,
    };
    
    // Add BYTEA data if file is ≤50MB
    if (shouldStoreBytea) {
      const result = await db.execute(sql`
        INSERT INTO files (id, filename, original_name, mime_type, size, object_path, file_content, user_id, storage_type, processing_status)
        VALUES (gen_random_uuid(), ${insertFile.filename}, ${insertFile.originalName}, ${insertFile.mimeType}, 
                ${insertFile.size}, ${insertFile.objectPath}, ${rawFileData}, ${userId}, 'hybrid', 'pending')
        RETURNING *
      `);
      return result.rows[0] as File;
    } else {
      // Large files: cloud storage only (no BYTEA)
      const [file] = await db
        .insert(files)
        .values(fileValues)
        .returning();
      return file;
    }
  }

  async getFile(id: string, userId: string): Promise<File | undefined> {
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.userId, userId)));
    return file || undefined;
  }

  // Get file data from BYTEA (for files ≤50MB) with cloud fallback
  async getFileData(id: string, userId: string): Promise<Buffer | undefined> {
    const result = await db.execute(sql`
      SELECT file_content, size 
      FROM files 
      WHERE id = ${id} AND user_id = ${userId}
    `);
    
    const row = result.rows[0] as any;
    if (row?.file_content) {
      const buffer = Buffer.from(row.file_content);
      console.log(`Retrieved file data from BYTEA (${buffer.length} bytes)`);
      return buffer;
    }
    return undefined;
  }

  // Check if file has BYTEA data in database
  async hasFileData(id: string, userId: string): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT file_content IS NOT NULL as has_bytea_data
      FROM files 
      WHERE id = ${id} AND user_id = ${userId}
    `);
    
    return !!(result.rows[0]?.has_bytea_data);
  }

  // Store file data in BYTEA (for files ≤10MB)
  async updateFileData(id: string, userId: string, fileData: Buffer): Promise<void> {
    const maxBytea = 10 * 1024 * 1024; // 10MB limit
    
    if (fileData.length > maxBytea) {
      console.log(`File too large for BYTEA storage: ${fileData.length} bytes > ${maxBytea} bytes`);
      return; // Skip if file is too large
    }
    
    await db.execute(sql`
      UPDATE files 
      SET file_content = ${fileData}
      WHERE id = ${id} AND user_id = ${userId}
    `);
    
    console.log(`Updated BYTEA data for file ${id}: ${fileData.length} bytes`);
  }

  async getFiles(userId: string = "demo-user", limit = 50, offset = 0): Promise<FileWithMetadata[]> {
    // Use cache for first page requests (most common)
    const cacheKey = `files:${userId}:${limit}:${offset}`;
    if (offset === 0 && limit <= 50) {
      const cached = cache.get<FileWithMetadata[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Exclude file_content BYTEA column AND large text fields from regular queries for performance
    const result = await db
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
        storageType: files.storageType,
        processingStatus: files.processingStatus,
        processingError: files.processingError,
        userId: files.userId,
        // Only fetch essential metadata fields (not extracted_text which can be huge)
        metadataId: fileMetadata.id,
        metadataSummary: fileMetadata.summary,
        metadataCategories: fileMetadata.categories,
        metadataKeywords: fileMetadata.keywords,
        metadataTopics: fileMetadata.topics,
        metadataConfidence: fileMetadata.confidence,
        metadataCreatedAt: fileMetadata.createdAt,
      })
      .from(files)
      .leftJoin(fileMetadata, eq(files.id, fileMetadata.fileId))
      .where(
        and(
          eq(files.userId, userId),
          ne(files.processingStatus, "error") // Exclude failed files
        )
      )
      .orderBy(desc(files.uploadedAt))
      .limit(limit)
      .offset(offset);

    const mappedResult = result.map(row => ({
      id: row.id,
      filename: row.filename,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      objectPath: row.objectPath,
      fileContent: null, // Not included in list queries for performance
      folderId: row.folderId,
      uploadedAt: row.uploadedAt,
      processedAt: row.processedAt,
      storageType: row.storageType,
      processingStatus: row.processingStatus,
      processingError: row.processingError,
      userId: row.userId,
      // Build lightweight metadata object (without heavy extracted_text field)
      metadata: row.metadataId ? {
        id: row.metadataId,
        fileId: row.id,
        extractedText: null, // Excluded for performance - load separately when needed
        summary: row.metadataSummary,
        categories: row.metadataCategories,
        keywords: row.metadataKeywords,
        topics: row.metadataTopics,
        confidence: row.metadataConfidence,
        createdAt: row.metadataCreatedAt || new Date(),
        embedding: null, // Excluded for performance
        embeddingVector: null, // Excluded for performance
      } : undefined,
    }));

    // Cache first page results
    if (offset === 0 && limit <= 50) {
      cache.set(cacheKey, mappedResult, 15000); // 15 second cache
    }

    return mappedResult;
  }

  async updateFileProcessingStatus(id: string, userId: string, status: string, error?: string): Promise<void> {
    await db
      .update(files)
      .set({ 
        processingStatus: status,
        processingError: error 
      })
      .where(and(eq(files.id, id), eq(files.userId, userId)));
  }

  async updateFileProcessedAt(id: string, userId: string): Promise<void> {
    await db
      .update(files)
      .set({ 
        processedAt: new Date(),
        processingStatus: "completed"
      })
      .where(and(eq(files.id, id), eq(files.userId, userId)));
  }

  async deleteFile(id: string, userId: string): Promise<void> {
    // Get file info before deletion for cloud storage cleanup
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.userId, userId)));
    
    if (file) {
      // Delete from cloud storage if objectPath exists
      try {
        if (file.objectPath) {
          const objectStorageService = new (await import('./objectStorage')).ObjectStorageService();
          await objectStorageService.deleteObject(file.objectPath);
        }
      } catch (error) {
        console.error(`Failed to delete file ${id} from cloud storage:`, error);
        // Continue with database deletion even if cloud storage fails
      }
      
      // Delete file metadata first
      await db
        .delete(fileMetadata)
        .where(eq(fileMetadata.fileId, id));
      
      // Delete file record
      await db.delete(files).where(and(eq(files.id, id), eq(files.userId, userId)));
      
      // Invalidate file caches
      cache.invalidatePattern(`files:${userId}:`);
      cache.invalidatePattern(`folders:${userId}:`);
    }
  }

  async createFileMetadata(metadata: InsertFileMetadata, userId: string): Promise<FileMetadata> {
    // If embedding is provided, also set the vector column
    const insertData: any = { ...metadata };
    if (metadata.embedding && Array.isArray(metadata.embedding)) {
      insertData.embeddingVector = metadata.embedding;
    }
    
    const [result] = await db
      .insert(fileMetadata)
      .values(insertData)
      .returning();
    return result;
  }

  async getFileMetadata(fileId: string, userId: string): Promise<FileMetadata | undefined> {
    const [metadata] = await db
      .select()
      .from(fileMetadata)
      .where(and(eq(fileMetadata.fileId, fileId)));
    return metadata || undefined;
  }

  async updateFileMetadata(fileId: string, userId: string, metadata: Partial<InsertFileMetadata>): Promise<void> {
    // If embedding is provided, also update the vector column
    const updateData: any = { ...metadata };
    if (metadata.embedding && Array.isArray(metadata.embedding)) {
      updateData.embeddingVector = metadata.embedding;
    }
    
    await db
      .update(fileMetadata)
      .set(updateData)
      .where(and(eq(fileMetadata.fileId, fileId)));
  }

  async searchFiles(query: string, userId: string, limit = 20): Promise<FileWithMetadata[]> {
    console.log(`Storage: searching for "${query}" for user ${userId}`);
    
    const result = await db
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
        storageType: files.storageType,
        processingStatus: files.processingStatus,
        processingError: files.processingError,
        userId: files.userId,
        metadata: fileMetadata,
      })
      .from(files)
      .leftJoin(fileMetadata, and(eq(files.id, fileMetadata.fileId)))
      .where(
        and(
          eq(files.userId, userId),
          eq(files.processingStatus, "completed"),
          sql`(
            ${files.originalName} ILIKE ${`%${query}%`} OR
            ${files.filename} ILIKE ${`%${query}%`} OR
            ${fileMetadata.summary} ILIKE ${`%${query}%`} OR
            ${fileMetadata.extractedText} ILIKE ${`%${query}%`} OR
            EXISTS (
              SELECT 1 FROM unnest(${fileMetadata.keywords}) AS keyword 
              WHERE keyword ILIKE ${`%${query}%`}
            ) OR
            EXISTS (
              SELECT 1 FROM unnest(${fileMetadata.topics}) AS topic 
              WHERE topic ILIKE ${`%${query}%`}
            ) OR
            EXISTS (
              SELECT 1 FROM unnest(${fileMetadata.categories}) AS category 
              WHERE category ILIKE ${`%${query}%`}
            )
          )`
        )
      )
      .orderBy(desc(files.uploadedAt))
      .limit(limit);

    console.log(`Storage: found ${result.length} raw results`);
    
    const mappedResults = result.map(row => ({
      id: row.id,
      filename: row.filename,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      objectPath: row.objectPath,
      fileContent: null, // Exclude bytea data for performance
      folderId: row.folderId,
      uploadedAt: row.uploadedAt,
      processedAt: row.processedAt,
      storageType: row.storageType,
      processingStatus: row.processingStatus,
      processingError: row.processingError,
      userId: row.userId,
      metadata: row.metadata || undefined,
    }));
    
    console.log(`Storage: returning ${mappedResults.length} mapped results`);
    return mappedResults;
  }

  async searchFilesBySimilarity(embedding: number[], userId: string = "demo-user", limit = 20): Promise<FileWithMetadata[]> {
    console.log(`Storage: pgvector semantic search for user ${userId}`);
    
    // Use pgvector for optimized similarity search with proper parameterized queries
    const embeddingVector = JSON.stringify(embedding);
    const result = await db.execute(
      sql`
        SELECT 
          f.id, f.filename, f.original_name, f.mime_type, f.size, f.object_path,
          f.folder_id, f.uploaded_at, f.processed_at, f.storage_type, f.processing_status,
          f.processing_error, f.user_id,
          fm.*,
          (fm.embedding_vector <=> ${embeddingVector}::vector) AS distance
        FROM files f
        INNER JOIN file_metadata fm ON f.id = fm.file_id
        WHERE f.user_id = ${userId}
          AND f.processing_status = 'completed'
          AND fm.embedding_vector IS NOT NULL
        ORDER BY fm.embedding_vector <=> ${embeddingVector}::vector
        LIMIT ${limit}
      `
    );

    console.log(`Storage: pgvector found ${result.rows.length} files with similarity search`);

    const mappedResults = result.rows.map((row: any) => ({
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      objectPath: row.object_path,
      fileContent: null, // Not included in API responses
      folderId: row.folder_id,
      storageType: row.storage_type,
      processingStatus: row.processing_status,
      processedAt: row.processed_at,
      processingError: row.processing_error,
      uploadedAt: row.uploaded_at,
      userId: row.user_id,
      similarity: 1 - row.distance, // Convert distance to similarity score
      metadata: {
        id: row.id,
        fileId: row.file_id,
        extractedText: row.extracted_text,
        summary: row.summary,
        keywords: row.keywords,
        topics: row.topics,
        categories: row.categories,
        embedding: row.embedding,
        embeddingVector: row.embedding_vector,
        confidence: row.confidence,
        createdAt: row.created_at,
      },
    }));

    console.log(`Storage: similarity scores:`, mappedResults.map(f => ({ 
      filename: f.filename, 
      similarity: f.similarity.toFixed(3) 
    })));

    // Filter out results with low similarity (threshold: 0.15 for relevance)
    const relevantResults = mappedResults.filter(file => file.similarity > 0.15);
    
    console.log(`Storage: filtered ${mappedResults.length} results to ${relevantResults.length} relevant files (similarity > 0.15)`);
    return relevantResults;
  }

  async createSearchHistory(search: InsertSearchHistory, userId: string): Promise<SearchHistory> {
    const [result] = await db
      .insert(searchHistory)
      .values({ ...search, userId })
      .returning();
    return result;
  }

  async getFilesByCategory(category: string, userId: string, limit = 20): Promise<FileWithMetadata[]> {
    const result = await db.execute(
      sql`
        SELECT f.*, fm.*
        FROM files f
        LEFT JOIN file_metadata fm ON f.id = fm.file_id
        WHERE f.user_id = ${userId}
        AND f.processing_status = 'completed'
        AND EXISTS (
          SELECT 1 FROM unnest(fm.categories) AS category_item 
          WHERE category_item ILIKE ${`%${category}%`}
        )
        ORDER BY f.uploaded_at DESC
        LIMIT ${limit}
      `
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      objectPath: row.object_path,
      fileContent: null, // Not included in API responses
      folderId: row.folder_id,
      storageType: row.storage_type,
      processingStatus: row.processing_status,
      processedAt: row.processed_at,
      processingError: row.processing_error,
      uploadedAt: row.uploaded_at,
      userId: row.user_id,
      metadata: row.file_id ? {
        id: row.file_id,
        fileId: row.file_id,
        extractedText: row.extracted_text,
        summary: row.summary,
        keywords: row.keywords,
        topics: row.topics,
        categories: row.categories,
        embedding: row.embedding,
        embeddingVector: row.embedding_vector,
        confidence: row.confidence,
        createdAt: row.created_at,
      } : undefined,
    }));
  }

  async getCategories(userId: string): Promise<{ category: string; count: number }[]> {
    const result = await db.execute(
      sql`
        SELECT unnest(categories) as category, COUNT(*)::int as count
        FROM file_metadata fm
        INNER JOIN files f ON f.id = fm.file_id
        WHERE f.processing_status = 'completed'
        AND f.user_id = ${userId}
        GROUP BY unnest(categories)
        ORDER BY COUNT(*) DESC
      `
    );

    return result.rows.map((row: any) => ({
      category: row.category,
      count: row.count,
    }));
  }

  async getFileStats(userId: string): Promise<{
    totalFiles: number;
    processedFiles: number;
    processingFiles: number;
    errorFiles: number;
    totalSize: number;
    byteaSize: number;
    cloudSize: number;
  }> {
    // Fixed to count ALL files including skipped and failed statuses
    const [stats] = await db
      .select({
        totalFiles: sql<number>`COUNT(*)::int`,
        processedFiles: sql<number>`COUNT(CASE WHEN processing_status = 'completed' THEN 1 END)::int`,
        processingFiles: sql<number>`COUNT(CASE WHEN processing_status IN ('pending', 'processing') THEN 1 END)::int`,
        errorFiles: sql<number>`COUNT(CASE WHEN processing_status IN ('error', 'failed') THEN 1 END)::int`,
        totalSize: sql<bigint>`COALESCE(SUM(size), 0)::bigint`,
        byteaSize: sql<bigint>`COALESCE(SUM(CASE WHEN file_content IS NOT NULL THEN length(file_content) ELSE 0 END), 0)::bigint`,
        cloudSize: sql<bigint>`COALESCE(SUM(size), 0)::bigint`,
      })
      .from(files)
      .where(eq(files.userId, userId));

    return {
      totalFiles: stats.totalFiles,
      processedFiles: stats.processedFiles,
      processingFiles: stats.processingFiles,
      errorFiles: stats.errorFiles,
      totalSize: Number(stats.totalSize),
      byteaSize: Number(stats.byteaSize),
      cloudSize: Number(stats.cloudSize),
    };
  }

  async getFilesByIds(ids: string[], userId: string): Promise<FileWithMetadata[]> {
    if (ids.length === 0) return [];
    
    const result = await db
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
        storageType: files.storageType,
        processingStatus: files.processingStatus,
        processingError: files.processingError,
        userId: files.userId,
        metadata: fileMetadata,
      })
      .from(files)
      .leftJoin(fileMetadata, and(eq(files.id, fileMetadata.fileId)))
      .where(and(inArray(files.id, ids), eq(files.userId, userId)));

    return result.map(row => ({
      id: row.id,
      filename: row.filename,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      objectPath: row.objectPath,
      fileContent: null, // Exclude bytea data for performance
      folderId: row.folderId,
      uploadedAt: row.uploadedAt,
      processedAt: row.processedAt,
      storageType: row.storageType,
      processingStatus: row.processingStatus,
      processingError: row.processingError,
      userId: row.userId,
      metadata: row.metadata || undefined,
    }));
  }

  // Folder operations
  async createFolder(folderData: InsertFolder, userId: string): Promise<Folder> {
    console.log(`Storage: creating folder for user ${userId}`, folderData);
    
    // Build the full path
    let fullPath = `/${folderData.name}`;
    if (folderData.parentId) {
      const parentPath = await this.getFolderPath(folderData.parentId, userId);
      fullPath = `${parentPath}/${folderData.name}`;
    }
    
    const [folder] = await db
      .insert(folders)
      .values({
        ...folderData,
        path: fullPath,
        userId,
      })
      .returning();
    
    return folder;
  }

  async getFolder(id: string, userId: string): Promise<Folder | undefined> {
    const [folder] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, userId)));
    
    return folder;
  }

  async getFolders(userId: string, parentId?: string | null): Promise<FolderWithChildren[]> {
    console.log(`Storage: getting folders for user ${userId}, parent: ${parentId}`);
    
    // Get all folders for this user in one query
    const allFolders = await db
      .select()
      .from(folders)
      .where(eq(folders.userId, userId))
      .orderBy(folders.name);
    
    // Get all files for this user in one query (excluding BYTEA content)
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
        storageType: files.storageType,
        processingStatus: files.processingStatus,
        processingError: files.processingError,
        userId: files.userId,
      })
      .from(files)
      .where(eq(files.userId, userId))
      .orderBy(files.filename);

    // Create maps for efficient lookup
    const foldersByParent = new Map<string | null, typeof allFolders>();
    const filesByFolder = new Map<string, typeof allFiles>();
    
    allFolders.forEach(folder => {
      const key = folder.parentId;
      if (!foldersByParent.has(key)) {
        foldersByParent.set(key, []);
      }
      foldersByParent.get(key)!.push(folder);
    });
    
    allFiles.forEach(file => {
      const key = file.folderId;
      if (key) {
        if (!filesByFolder.has(key)) {
          filesByFolder.set(key, []);
        }
        filesByFolder.get(key)!.push(file);
      }
    });

    // Get folders for the requested parent
    const requestedFolders = foldersByParent.get(parentId ?? null) || [];
    
    // Build results with children and files
    const foldersWithChildren: FolderWithChildren[] = requestedFolders.map(folder => ({
      ...folder,
      children: foldersByParent.get(folder.id) || [],
      files: (filesByFolder.get(folder.id) || []).map(file => ({
        ...file,
        fileContent: null, // Exclude bytea data for performance
      })),
    }));
    
    return foldersWithChildren;
  }

  async getAllFolders(userId: string): Promise<Folder[]> {
    console.log(`Storage: getting all folders for user ${userId}`);
    
    const result = await db
      .select()
      .from(folders)
      .where(eq(folders.userId, userId))
      .orderBy(folders.path);
    
    return result;
  }

  async updateFolder(id: string, userId: string, updates: Partial<InsertFolder>): Promise<void> {
    console.log(`Storage: updating folder ${id} for user ${userId}`, updates);
    
    // If name is being updated, update the path
    if (updates.name) {
      const folder = await this.getFolder(id, userId);
      if (folder) {
        let newPath = `/${updates.name}`;
        if (folder.parentId) {
          const parentPath = await this.getFolderPath(folder.parentId, userId);
          newPath = `${parentPath}/${updates.name}`;
        }
        updates.path = newPath;
      }
    }
    
    await db
      .update(folders)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(folders.id, id), eq(folders.userId, userId)));
  }

  async deleteFolder(id: string, userId: string): Promise<void> {
    console.log(`Storage: deleting folder ${id} and all its contents for user ${userId}`);
    
    // Recursively delete all subfolders first
    const subfolders = await db
      .select()
      .from(folders)
      .where(and(eq(folders.parentId, id), eq(folders.userId, userId)));
    
    for (const subfolder of subfolders) {
      await this.deleteFolder(subfolder.id, userId);
    }
    
    // Get all files in this folder and delete them from cloud storage and database
    const folderFiles = await db
      .select()
      .from(files)
      .where(and(eq(files.folderId, id), eq(files.userId, userId)));
    
    // Delete files from cloud storage and database
    for (const file of folderFiles) {
      try {
        // Delete from cloud storage if objectPath exists
        if (file.objectPath) {
          const objectStorageService = new (await import('./objectStorage')).ObjectStorageService();
          await objectStorageService.deleteObject(file.objectPath);
        }
      } catch (error) {
        console.error(`Failed to delete file ${file.id} from cloud storage:`, error);
        // Continue with database deletion even if cloud storage fails
      }
    }
    
    // Delete all file metadata for files in this folder first
    const fileIds = folderFiles.map(file => file.id);
    if (fileIds.length > 0) {
      await db
        .delete(fileMetadata)
        .where(inArray(fileMetadata.fileId, fileIds));
    }
    
    // Delete all files in this folder from database
    await db
      .delete(files)
      .where(and(eq(files.folderId, id), eq(files.userId, userId)));
    
    // Delete the folder itself
    await db
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, userId)));
    
    // Invalidate all relevant caches after deletion
    if (folderFiles.length > 0) {
      cache.invalidatePattern(`files:${userId}:`);
      cache.invalidatePattern(`folders:${userId}:`);
      console.log(`Invalidated file caches for user ${userId} after folder deletion`);
    }
  }

  async moveFolderContents(fromFolderId: string, toFolderId: string | null, userId: string): Promise<void> {
    console.log(`Storage: moving contents from folder ${fromFolderId} to ${toFolderId} for user ${userId}`);
    
    // Move all files
    await db
      .update(files)
      .set({ folderId: toFolderId })
      .where(and(eq(files.folderId, fromFolderId), eq(files.userId, userId)));
    
    // Move all subfolders
    await db
      .update(folders)
      .set({ parentId: toFolderId })
      .where(and(eq(folders.parentId, fromFolderId), eq(folders.userId, userId)));
  }

  async getFolderPath(folderId: string, userId: string): Promise<string> {
    const folder = await this.getFolder(folderId, userId);
    if (!folder) return "";
    return folder.path;
  }

  // File-folder operations
  async moveFileToFolder(fileId: string, folderId: string | null, userId: string): Promise<void> {
    console.log(`Storage: moving file ${fileId} to folder ${folderId} for user ${userId}`);
    
    await db
      .update(files)
      .set({ folderId })
      .where(and(eq(files.id, fileId), eq(files.userId, userId)));
  }

  async getFilesInFolder(folderId: string | null, userId: string): Promise<FileWithMetadata[]> {
    console.log(`Storage: getting files in folder ${folderId} for user ${userId}`);
    
    const query = db
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
        storageType: files.storageType,
        processingStatus: files.processingStatus,
        processingError: files.processingError,
        userId: files.userId,
        metadata: fileMetadata,
      })
      .from(files)
      .leftJoin(fileMetadata, eq(files.id, fileMetadata.fileId))
      .where(and(
        eq(files.userId, userId),
        folderId === null ? isNull(files.folderId) : eq(files.folderId, folderId)
      ))
      .orderBy(desc(files.uploadedAt));

    const result = await query;
    return result.map(row => ({
      ...row,
      fileContent: null, // Not included in API responses
      storageType: row.storageType || null, // Use actual value or default
      metadata: row.metadata || undefined,
    }));
  }
  
  async getFilesByFolder(folderId: string, userId: string): Promise<FileWithMetadata[]> {
    return this.getFilesInFolder(folderId, userId);
  }
  
  // Teacher chat sessions
  async saveTeacherChatSession(session: InsertTeacherChatSession): Promise<TeacherChatSession> {
    const [savedSession] = await db
      .insert(teacherChatSessions)
      .values(session)
      .returning();
    return savedSession;
  }
  
  async getUserTeacherChatSessions(userId: string): Promise<TeacherChatSession[]> {
    return await db
      .select()
      .from(teacherChatSessions)
      .where(eq(teacherChatSessions.userId, userId))
      .orderBy(desc(teacherChatSessions.createdAt));
  }
  
  async getTeacherChatSessionByShareId(shareId: string): Promise<TeacherChatSession | null> {
    const [session] = await db
      .select()
      .from(teacherChatSessions)
      .where(eq(teacherChatSessions.shareId, shareId));
    return session || null;
  }
  
  async updateTeacherChatSessionSharing(sessionId: string, userId: string, isPublic: number): Promise<TeacherChatSession> {
    const [updated] = await db
      .update(teacherChatSessions)
      .set({ isPublic, updatedAt: new Date() })
      .where(and(
        eq(teacherChatSessions.id, sessionId),
        eq(teacherChatSessions.userId, userId)
      ))
      .returning();
    return updated;
  }
  
  async deleteTeacherChatSession(sessionId: string, userId: string): Promise<void> {
    await db
      .delete(teacherChatSessions)
      .where(and(
        eq(teacherChatSessions.id, sessionId),
        eq(teacherChatSessions.userId, userId)
      ));
  }
  
  // Validation report methods
  async createValidationReport(report: InsertValidationReport): Promise<ValidationReport> {
    const [created] = await db
      .insert(validationReports)
      .values(report)
      .returning();
    return created;
  }
  
  async getValidationReports(userId: string): Promise<ValidationReport[]> {
    return await db
      .select()
      .from(validationReports)
      .where(eq(validationReports.userId, userId))
      .orderBy(desc(validationReports.createdAt));
  }
  
  async getValidationReport(reportId: string, userId: string): Promise<ValidationReport | undefined> {
    const [report] = await db
      .select()
      .from(validationReports)
      .where(and(
        eq(validationReports.id, reportId),
        eq(validationReports.userId, userId)
      ));
    return report;
  }
  
  async deleteValidationReport(reportId: string, userId: string): Promise<void> {
    await db
      .delete(validationReports)
      .where(and(
        eq(validationReports.id, reportId),
        eq(validationReports.userId, userId)
      ));
  }
}

export const storage = new DatabaseStorage();
