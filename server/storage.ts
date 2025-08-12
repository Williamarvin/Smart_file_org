import { 
  users,
  files, 
  fileMetadata, 
  searchHistory,
  folders,
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
import { eq, desc, ilike, sql, and, inArray, ne, isNull, asc } from "drizzle-orm";

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
    // Prepare file data with dual storage capability
    const insertData = {
      ...insertFile,
      userId,
      fileData: rawFileData, // Store in database if provided
      storageType: rawFileData ? 'dual' : 'cloud' // Set storage type based on whether we have raw data
    };
    
    const [file] = await db
      .insert(files)
      .values(insertData)
      .returning();
    return file;
  }

  async getFile(id: string, userId: string): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(and(eq(files.id, id), eq(files.userId, userId)));
    return file || undefined;
  }

  // Get file data from database (BYTEA)
  async getFileData(id: string, userId: string): Promise<Buffer | undefined> {
    const [file] = await db
      .select({ fileData: files.fileData })
      .from(files)
      .where(and(eq(files.id, id), eq(files.userId, userId)));
    
    return file?.fileData as Buffer || undefined;
  }

  // Check if file has database storage
  async hasFileData(id: string, userId: string): Promise<boolean> {
    const [file] = await db
      .select({ fileData: files.fileData, storageType: files.storageType })
      .from(files)
      .where(and(eq(files.id, id), eq(files.userId, userId)));
    
    return !!(file?.fileData || file?.storageType === 'dual' || file?.storageType === 'database');
  }

  // Get files that don't have BYTEA data for backfill
  async getFilesWithoutBytea(userId: string): Promise<File[]> {
    const result = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.userId, userId),
          isNull(files.fileData) // Files without BYTEA data
        )
      )
      .orderBy(asc(files.size)); // Start with smaller files first
    
    return result;
  }

  // Update file data for backfill
  async updateFileData(id: string, userId: string, fileData: Buffer): Promise<void> {
    await db
      .update(files)
      .set({ fileData })
      .where(and(eq(files.id, id), eq(files.userId, userId)));
  }

  // Update storage type
  async updateStorageType(id: string, userId: string, storageType: string): Promise<void> {
    await db
      .update(files)
      .set({ storageType })
      .where(and(eq(files.id, id), eq(files.userId, userId)));
  }

  async getFiles(userId: string = "demo-user", limit = 50, offset = 0): Promise<FileWithMetadata[]> {
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

    return result.map(row => {
      // Return file data without the fileData bytea column to avoid serialization issues
      return {
        id: row.id,
        filename: row.filename,
        originalName: row.originalName,
        mimeType: row.mimeType,
        size: row.size,
        objectPath: row.objectPath,
        fileData: null, // Set to null for API responses - bytea excluded from query
        folderId: row.folderId,
        uploadedAt: row.uploadedAt,
        processedAt: row.processedAt,
        storageType: row.storageType,
        processingStatus: row.processingStatus,
        processingError: row.processingError,
        userId: row.userId,
        metadata: row.metadata || undefined,
      };
    });
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
    await db.delete(files).where(and(eq(files.id, id), eq(files.userId, userId)));
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
        file: files,
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
      ...row.file,
      metadata: row.metadata || undefined,
    }));
    
    console.log(`Storage: returning ${mappedResults.length} mapped results`);
    return mappedResults;
  }

  async searchFilesBySimilarity(embedding: number[], userId: string = "demo-user", limit = 20): Promise<FileWithMetadata[]> {
    console.log(`Storage: pgvector semantic search for user ${userId}`);
    
    // Use pgvector for optimized similarity search
    const result = await db.execute(
      sql`
        SELECT 
          f.*,
          fm.*,
          (fm.embedding_vector <=> ${JSON.stringify(embedding)}::vector) AS distance
        FROM files f
        INNER JOIN file_metadata fm ON f.id = fm.file_id
        WHERE f.user_id = ${userId}
          AND f.processing_status = 'completed'
          AND fm.embedding_vector IS NOT NULL
        ORDER BY fm.embedding_vector <=> ${JSON.stringify(embedding)}::vector
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
      fileData: null, // Not included in API responses
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
      fileData: null, // Not included in API responses
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
  }> {
    const [stats] = await db
      .select({
        totalFiles: sql<number>`COUNT(CASE WHEN processing_status != 'error' THEN 1 END)::int`,
        processedFiles: sql<number>`COUNT(CASE WHEN processing_status = 'completed' THEN 1 END)::int`,
        processingFiles: sql<number>`COUNT(CASE WHEN processing_status IN ('pending', 'processing') THEN 1 END)::int`,
        errorFiles: sql<number>`COUNT(CASE WHEN processing_status = 'error' THEN 1 END)::int`,
        totalSize: sql<number>`COALESCE(SUM(CASE WHEN processing_status != 'error' THEN size ELSE 0 END), 0)::int`,
      })
      .from(files)
      .where(eq(files.userId, userId));

    return stats;
  }

  async getFilesByIds(ids: string[], userId: string): Promise<FileWithMetadata[]> {
    if (ids.length === 0) return [];
    
    const result = await db
      .select({
        file: files,
        metadata: fileMetadata,
      })
      .from(files)
      .leftJoin(fileMetadata, and(eq(files.id, fileMetadata.fileId)))
      .where(and(inArray(files.id, ids), eq(files.userId, userId)));

    return result.map(row => ({
      ...row.file,
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
    
    const folderQuery = db
      .select()
      .from(folders)
      .where(and(
        eq(folders.userId, userId),
        parentId === null || parentId === undefined 
          ? isNull(folders.parentId)
          : eq(folders.parentId, parentId)
      ))
      .orderBy(folders.name);

    const folderResults = await folderQuery;
    
    // Get file counts for each folder
    const foldersWithChildren: FolderWithChildren[] = [];
    
    for (const folder of folderResults) {
      // Get children folders
      const children = await db
        .select()
        .from(folders)
        .where(and(eq(folders.parentId, folder.id), eq(folders.userId, userId)))
        .orderBy(folders.name);
      
      // Get files in folder
      const folderFiles = await db
        .select()
        .from(files)
        .where(and(eq(files.folderId, folder.id), eq(files.userId, userId)))
        .orderBy(files.filename);

      foldersWithChildren.push({
        ...folder,
        children,
        files: folderFiles,
      });
    }
    
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
    console.log(`Storage: deleting folder ${id} for user ${userId}`);
    
    // Move all files in this folder to root (null folderId)
    await db
      .update(files)
      .set({ folderId: null })
      .where(and(eq(files.folderId, id), eq(files.userId, userId)));
    
    // Move all child folders to root
    await db
      .update(folders)
      .set({ parentId: null })
      .where(and(eq(folders.parentId, id), eq(folders.userId, userId)));
    
    // Delete the folder
    await db
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, userId)));
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
      fileData: null, // Not included in API responses
      storageType: row.storageType || null, // Use actual value or default
      metadata: row.metadata || undefined,
    }));
  }
}

export const storage = new DatabaseStorage();
