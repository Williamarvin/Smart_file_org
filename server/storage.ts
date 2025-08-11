import { 
  files, 
  fileMetadata, 
  searchHistory,
  type File, 
  type InsertFile, 
  type FileMetadata,
  type InsertFileMetadata,
  type FileWithMetadata,
  type InsertSearchHistory,
  type SearchHistory
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, sql, and } from "drizzle-orm";

export interface IStorage {
  // File operations
  createFile(file: InsertFile): Promise<File>;
  getFile(id: string): Promise<File | undefined>;
  getFiles(limit?: number, offset?: number): Promise<FileWithMetadata[]>;
  updateFileProcessingStatus(id: string, status: string, error?: string): Promise<void>;
  updateFileProcessedAt(id: string): Promise<void>;
  deleteFile(id: string): Promise<void>;
  
  // File metadata operations
  createFileMetadata(metadata: InsertFileMetadata): Promise<FileMetadata>;
  getFileMetadata(fileId: string): Promise<FileMetadata | undefined>;
  updateFileMetadata(fileId: string, metadata: Partial<InsertFileMetadata>): Promise<void>;
  
  // Search operations
  searchFiles(query: string, limit?: number): Promise<FileWithMetadata[]>;
  searchFilesBySimilarity(embedding: number[], limit?: number): Promise<FileWithMetadata[]>;
  createSearchHistory(search: InsertSearchHistory): Promise<SearchHistory>;
  
  // Statistics
  getFileStats(): Promise<{
    totalFiles: number;
    processedFiles: number;
    processingFiles: number;
    errorFiles: number;
    totalSize: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async createFile(insertFile: InsertFile): Promise<File> {
    const [file] = await db
      .insert(files)
      .values(insertFile)
      .returning();
    return file;
  }

  async getFile(id: string): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file || undefined;
  }

  async getFiles(limit = 50, offset = 0): Promise<FileWithMetadata[]> {
    const result = await db
      .select({
        file: files,
        metadata: fileMetadata,
      })
      .from(files)
      .leftJoin(fileMetadata, eq(files.id, fileMetadata.fileId))
      .orderBy(desc(files.uploadedAt))
      .limit(limit)
      .offset(offset);

    return result.map(row => ({
      ...row.file,
      metadata: row.metadata || undefined,
    }));
  }

  async updateFileProcessingStatus(id: string, status: string, error?: string): Promise<void> {
    await db
      .update(files)
      .set({ 
        processingStatus: status,
        processingError: error 
      })
      .where(eq(files.id, id));
  }

  async updateFileProcessedAt(id: string): Promise<void> {
    await db
      .update(files)
      .set({ 
        processedAt: new Date(),
        processingStatus: "completed"
      })
      .where(eq(files.id, id));
  }

  async deleteFile(id: string): Promise<void> {
    await db.delete(files).where(eq(files.id, id));
  }

  async createFileMetadata(metadata: InsertFileMetadata): Promise<FileMetadata> {
    const [result] = await db
      .insert(fileMetadata)
      .values(metadata)
      .returning();
    return result;
  }

  async getFileMetadata(fileId: string): Promise<FileMetadata | undefined> {
    const [metadata] = await db
      .select()
      .from(fileMetadata)
      .where(eq(fileMetadata.fileId, fileId));
    return metadata || undefined;
  }

  async updateFileMetadata(fileId: string, metadata: Partial<InsertFileMetadata>): Promise<void> {
    await db
      .update(fileMetadata)
      .set(metadata)
      .where(eq(fileMetadata.fileId, fileId));
  }

  async searchFiles(query: string, limit = 20): Promise<FileWithMetadata[]> {
    console.log(`Storage: searching for "${query}"`);
    
    const result = await db
      .select({
        file: files,
        metadata: fileMetadata,
      })
      .from(files)
      .leftJoin(fileMetadata, eq(files.id, fileMetadata.fileId))
      .where(
        and(
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

  async searchFilesBySimilarity(embedding: number[], limit = 20): Promise<FileWithMetadata[]> {
    // Note: This is a simplified similarity search
    // In production, you'd want to use a proper vector database like pgvector
    const result = await db
      .select({
        file: files,
        metadata: fileMetadata,
      })
      .from(files)
      .leftJoin(fileMetadata, eq(files.id, fileMetadata.fileId))
      .where(
        and(
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

  async createSearchHistory(search: InsertSearchHistory): Promise<SearchHistory> {
    const [result] = await db
      .insert(searchHistory)
      .values(search)
      .returning();
    return result;
  }

  async getFilesByCategory(category: string, limit = 20): Promise<FileWithMetadata[]> {
    const result = await db.execute(
      sql`
        SELECT f.*, fm.*
        FROM files f
        LEFT JOIN file_metadata fm ON f.id = fm.file_id
        WHERE f.processing_status = 'completed'
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
        extractedText: row.extracted_text,
        summary: row.summary,
        keywords: row.keywords,
        topics: row.topics,
        categories: row.categories,
        processedAt: row.processed_at,
      } : undefined,
    }));
  }

  async getCategories(): Promise<{ category: string; count: number }[]> {
    const result = await db.execute(
      sql`
        SELECT unnest(categories) as category, COUNT(*)::int as count
        FROM file_metadata fm
        INNER JOIN files f ON f.id = fm.file_id
        WHERE f.processing_status = 'completed'
        GROUP BY unnest(categories)
        ORDER BY COUNT(*) DESC
      `
    );

    return result.rows.map((row: any) => ({
      category: row.category,
      count: row.count,
    }));
  }

  async getFileStats(): Promise<{
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
      .from(files);

    return stats;
  }
}

export const storage = new DatabaseStorage();
