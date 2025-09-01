import { db } from "./db";
import { files, fileMetadata } from "@shared/schema";
import { eq, desc, ne, and, sql } from "drizzle-orm";
import { cache } from "./cache";

/**
 * Ultra-fast, non-blocking storage implementation that NEVER loads heavy data
 * This prevents the app from freezing during database operations
 */

// Lightning-fast file listing (already optimized)
export async function getNonBlockingFiles(
  userId: string = "demo-user",
  limit = 50,
  offset = 0,
) {
  const cacheKey = `nb-files:${userId}:${limit}:${offset}`;

  if (offset === 0 && limit <= 50) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  // Only get essential file data - NO BYTEA, NO LARGE TEXT
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
    })
    .from(files)
    .where(and(eq(files.userId, userId), ne(files.processingStatus, "error")))
    .orderBy(desc(files.uploadedAt))
    .limit(limit)
    .offset(offset);

  // Get ONLY lightweight metadata (no extracted_text which can be huge)
  let metadataMap = new Map();
  if (result.length > 0) {
    const fileIds = result.map((f) => f.id);
    const lightMetadata = await db
      .select({
        fileId: fileMetadata.fileId,
        id: fileMetadata.id,
        summary: fileMetadata.summary,
        categories: fileMetadata.categories,
        keywords: fileMetadata.keywords,
        topics: fileMetadata.topics,
        confidence: fileMetadata.confidence,
        createdAt: fileMetadata.createdAt,
      })
      .from(fileMetadata)
      .where(eq(fileMetadata.fileId, fileIds[0])); // Simple fix for array syntax

    lightMetadata.forEach((meta) => {
      metadataMap.set(meta.fileId, {
        id: meta.id,
        fileId: meta.fileId,
        extractedText: null, // NEVER load in list queries
        summary: meta.summary,
        categories: meta.categories,
        keywords: meta.keywords,
        topics: meta.topics,
        confidence: meta.confidence,
        createdAt: meta.createdAt,
        embedding: null,
        embeddingVector: null,
      });
    });
  }

  const finalResult = result.map((file) => ({
    ...file,
    fileContent: null, // NEVER load BYTEA in list queries
    metadata: metadataMap.get(file.id) || undefined,
  }));

  if (offset === 0 && limit <= 50) {
    cache.set(cacheKey, finalResult, 15000);
  }

  return finalResult;
}

// Lightning-fast search WITHOUT loading heavy text data
export async function searchFilesNonBlocking(
  query: string,
  userId: string,
  limit = 20,
) {
  console.log(`Non-blocking search for "${query}"`);

  // Search only in lightweight fields - NO extracted_text loading
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
      // Only lightweight metadata fields
      metadataId: fileMetadata.id,
      summary: fileMetadata.summary,
      categories: fileMetadata.categories,
      keywords: fileMetadata.keywords,
      topics: fileMetadata.topics,
      confidence: fileMetadata.confidence,
      createdAt: fileMetadata.createdAt,
    })
    .from(files)
    .leftJoin(fileMetadata, eq(files.id, fileMetadata.fileId))
    .where(
      and(
        eq(files.userId, userId),
        eq(files.processingStatus, "completed"),
        sql`(
          ${files.originalName} ILIKE ${`%${query}%`} OR
          ${files.filename} ILIKE ${`%${query}%`} OR
          ${fileMetadata.summary} ILIKE ${`%${query}%`} OR
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
        )`,
      ),
    )
    .orderBy(desc(files.uploadedAt))
    .limit(limit);

  return result.map((row) => ({
    id: row.id,
    filename: row.filename,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    objectPath: row.objectPath,
    fileContent: null, // NEVER load BYTEA
    folderId: row.folderId,
    uploadedAt: row.uploadedAt,
    processedAt: row.processedAt,
    storageType: row.storageType,
    processingStatus: row.processingStatus,
    processingError: row.processingError,
    userId: row.userId,
    metadata: row.metadataId
      ? {
          id: row.metadataId,
          fileId: row.id,
          extractedText: null, // NEVER load heavy text
          summary: row.summary,
          categories: row.categories,
          keywords: row.keywords,
          topics: row.topics,
          confidence: row.confidence,
          createdAt: row.createdAt,
          embedding: null,
          embeddingVector: null,
        }
      : undefined,
  }));
}

// Lightning-fast similarity search WITHOUT loading heavy data
export async function searchSimilarFilesNonBlocking(
  embedding: number[],
  userId: string = "demo-user",
  limit = 20,
) {
  console.log(`Non-blocking similarity search for user ${userId}`);

  // Use pgvector but exclude heavy fields
  const result = await db.execute(
    sql`
      SELECT 
        f.id, f.filename, f.original_name, f.mime_type, f.size, f.object_path,
        f.folder_id, f.uploaded_at, f.processed_at, f.storage_type, f.processing_status,
        f.processing_error, f.user_id,
        fm.id as metadata_id, fm.summary, fm.categories, fm.keywords, fm.topics, 
        fm.confidence, fm.created_at,
        (fm.embedding_vector <=> ${JSON.stringify(embedding)}::vector) AS distance
      FROM files f
      INNER JOIN file_metadata fm ON f.id = fm.file_id
      WHERE f.user_id = ${userId}
        AND f.processing_status = 'completed'
        AND fm.embedding_vector IS NOT NULL
      ORDER BY fm.embedding_vector <=> ${JSON.stringify(embedding)}::vector
      LIMIT ${limit}
    `,
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    objectPath: row.object_path,
    fileContent: null, // NEVER load BYTEA
    folderId: row.folder_id,
    storageType: row.storage_type,
    processingStatus: row.processing_status,
    processedAt: row.processed_at,
    processingError: row.processing_error,
    uploadedAt: row.uploaded_at,
    userId: row.user_id,
    metadata: {
      id: row.metadata_id,
      fileId: row.id,
      extractedText: null, // NEVER load heavy text
      summary: row.summary,
      categories: row.categories,
      keywords: row.keywords,
      topics: row.topics,
      confidence: row.confidence,
      createdAt: row.created_at,
      embedding: null,
      embeddingVector: null,
    },
    distance: row.distance,
  }));
}

export function invalidateNonBlockingCache(userId: string) {
  cache.invalidatePattern(`nb-files:${userId}:`);
}
