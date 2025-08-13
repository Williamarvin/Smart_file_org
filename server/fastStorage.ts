import { db } from "./db";
import { files, fileMetadata } from "@shared/schema";
import { eq, desc, ne, and } from "drizzle-orm";
import { cache } from "./cache";

// Ultra-fast file listing without complex JOINs
export async function getFastFiles(userId: string = "demo-user", limit = 50, offset = 0) {
  const cacheKey = `fast-files:${userId}:${limit}:${offset}`;
  
  // Check cache first
  if (offset === 0 && limit <= 50) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  // Simple query without JOIN - just get files
  const fileResults = await db
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
    .where(
      and(
        eq(files.userId, userId),
        ne(files.processingStatus, "error")
      )
    )
    .orderBy(desc(files.uploadedAt))
    .limit(limit)
    .offset(offset);

  // Get metadata for these files in a separate query (if any files exist)
  let metadataMap = new Map();
  if (fileResults.length > 0) {
    const fileIds = fileResults.map(f => f.id);
    const metadataResults = await db
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
      .from(fileMetadata);
    
    // Convert to map for O(1) lookup
    metadataResults.forEach(meta => {
      metadataMap.set(meta.fileId, {
        id: meta.id,
        fileId: meta.fileId,
        extractedText: null, // Never load in list view
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

  // Combine results
  const result = fileResults.map(file => ({
    ...file,
    fileContent: null,
    metadata: metadataMap.get(file.id) || undefined,
  }));

  // Cache the result
  if (offset === 0 && limit <= 50) {
    cache.set(cacheKey, result, 15000); // 15 second cache
  }

  return result;
}

export function invalidateFastFilesCache(userId: string) {
  cache.invalidatePattern(`fast-files:${userId}:`);
}