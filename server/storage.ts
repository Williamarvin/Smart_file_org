import { 
  users,
  files, 
  fileMetadata, 
  searchHistory,
  type User,
  type UpsertUser,
  type File, 
  type InsertFile, 
  type FileMetadata,
  type InsertFileMetadata,
  type FileWithMetadata,
  type InsertSearchHistory,
  type SearchHistory
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, sql, and, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // File operations
  createFile(file: InsertFile, userId: string): Promise<File>;
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

  async createFile(insertFile: InsertFile, userId: string): Promise<File> {
    const [file] = await db
      .insert(files)
      .values({ ...insertFile, userId })
      .returning();
    return file;
  }

  async getFile(id: string, userId: string): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(and(eq(files.id, id), eq(files.userId, userId)));
    return file || undefined;
  }

  async getFiles(userId: string, limit = 50, offset = 0): Promise<FileWithMetadata[]> {
    const result = await db
      .select({
        file: files,
        metadata: fileMetadata,
      })
      .from(files)
      .leftJoin(fileMetadata, and(eq(files.id, fileMetadata.fileId), eq(fileMetadata.userId, userId)))
      .where(eq(files.userId, userId))
      .orderBy(desc(files.uploadedAt))
      .limit(limit)
      .offset(offset);

    return result.map(row => ({
      ...row.file,
      metadata: row.metadata || undefined,
    }));
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
    const [result] = await db
      .insert(fileMetadata)
      .values({ ...metadata, userId })
      .returning();
    return result;
  }

  async getFileMetadata(fileId: string, userId: string): Promise<FileMetadata | undefined> {
    const [metadata] = await db
      .select()
      .from(fileMetadata)
      .where(and(eq(fileMetadata.fileId, fileId), eq(fileMetadata.userId, userId)));
    return metadata || undefined;
  }

  async updateFileMetadata(fileId: string, userId: string, metadata: Partial<InsertFileMetadata>): Promise<void> {
    await db
      .update(fileMetadata)
      .set(metadata)
      .where(and(eq(fileMetadata.fileId, fileId), eq(fileMetadata.userId, userId)));
  }

  async searchFiles(query: string, userId: string, limit = 20): Promise<FileWithMetadata[]> {
    console.log(`Storage: searching for "${query}" for user ${userId}`);
    
    const result = await db
      .select({
        file: files,
        metadata: fileMetadata,
      })
      .from(files)
      .leftJoin(fileMetadata, and(eq(files.id, fileMetadata.fileId), eq(fileMetadata.userId, userId)))
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

  async searchFilesBySimilarity(embedding: number[], userId: string, limit = 20): Promise<FileWithMetadata[]> {
    // Note: This is a simplified similarity search
    // In production, you'd want to use a proper vector database like pgvector
    const result = await db
      .select({
        file: files,
        metadata: fileMetadata,
      })
      .from(files)
      .leftJoin(fileMetadata, and(eq(files.id, fileMetadata.fileId), eq(fileMetadata.userId, userId)))
      .where(
        and(
          eq(files.userId, userId),
          eq(files.processingStatus, "completed"),
          sql`${fileMetadata.embedding} IS NOT NULL`
        )
      )
      .orderBy(desc(files.uploadedAt))
      .limit(limit);

    return result.map(row => ({
      ...row.file,
      metadata: row.metadata || undefined,
    }));
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
        AND fm.user_id = ${userId}
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
      processingStatus: row.processing_status,
      uploadedAt: row.uploaded_at,
      userId: row.user_id,
      metadata: row.file_id ? {
        id: row.file_id,
        fileId: row.file_id,
        userId: row.user_id,
        extractedText: row.extracted_text,
        summary: row.summary,
        keywords: row.keywords,
        topics: row.topics,
        categories: row.categories,
        processedAt: row.processed_at,
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
        AND fm.user_id = ${userId}
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
        totalFiles: sql<number>`COUNT(*)::int`,
        processedFiles: sql<number>`COUNT(CASE WHEN processing_status = 'completed' THEN 1 END)::int`,
        processingFiles: sql<number>`COUNT(CASE WHEN processing_status IN ('pending', 'processing') THEN 1 END)::int`,
        errorFiles: sql<number>`COUNT(CASE WHEN processing_status = 'error' THEN 1 END)::int`,
        totalSize: sql<number>`COALESCE(SUM(size), 0)::int`,
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
      .leftJoin(fileMetadata, and(eq(files.id, fileMetadata.fileId), eq(fileMetadata.userId, userId)))
      .where(and(inArray(files.id, ids), eq(files.userId, userId)));

    return result.map(row => ({
      ...row.file,
      metadata: row.metadata || undefined,
    }));
  }
}

export const storage = new DatabaseStorage();
