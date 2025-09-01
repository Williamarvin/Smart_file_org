// Fast Storage Optimization Module
// Based on working Smart File Organizer performance strategies

import { performance } from "perf_hooks";

// Simple in-memory cache for frequently accessed data
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

// Performance-optimized file operations
export class FastStorage {
  private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Cache management
  static setCache(key: string, data: any, ttl: number = FastStorage.CACHE_TTL) {
    cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  static getCache(key: string): any | null {
    const item = cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > item.ttl) {
      cache.delete(key);
      return null;
    }

    return item.data;
  }

  static clearCache(pattern?: string) {
    if (!pattern) {
      cache.clear();
      return;
    }

    const keysToDelete: string[] = [];
    cache.forEach((_, key) => {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => cache.delete(key));
  }

  // Compatibility with existing cache system
  static invalidatePattern(pattern: string) {
    FastStorage.clearCache(pattern);
  }

  // Performance monitoring
  static measurePerformance<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const start = performance.now();
      try {
        const result = await fn();
        const end = performance.now();
        const duration = end - start;

        // Only log slow operations
        if (duration > 100) {
          console.log(`⚡ ${operation}: ${duration.toFixed(2)}ms`);
        }

        resolve(result);
      } catch (error) {
        const end = performance.now();
        console.error(
          `❌ ${operation} failed after ${(end - start).toFixed(2)}ms:`,
          error,
        );
        reject(error);
      }
    });
  }

  // Optimized file size formatter
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  // Efficient batch operations
  static async batchProcess<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number = 10,
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((item) => processor(item)),
      );
      results.push(...batchResults);

      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    return results;
  }

  // Memory usage monitoring
  static getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: FastStorage.formatFileSize(usage.rss),
      heapTotal: FastStorage.formatFileSize(usage.heapTotal),
      heapUsed: FastStorage.formatFileSize(usage.heapUsed),
      external: FastStorage.formatFileSize(usage.external),
      cacheSize: cache.size,
    };
  }
}

// Cache invalidation patterns
export const cachePatterns = {
  files: (userId: string) => `files:${userId}`,
  folders: (userId: string) => `folders:${userId}`,
  stats: (userId: string) => `stats:${userId}`,
  categories: (userId: string) => `categories:${userId}`,
};
