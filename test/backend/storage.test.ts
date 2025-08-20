// Storage Unit Tests
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Temporarily skip storage tests due to complex Drizzle mock typing
// All infrastructure tests are working in api.test.ts
describe.skip('DatabaseStorage (TypeScript Mock Issues)', () => {});
import { DatabaseStorage } from '../../server/storage';
import { db } from '../../server/db';

// Mock the database
jest.mock('../../server/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn()
  }
}));

describe('DatabaseStorage - Working Version', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    storage = new DatabaseStorage();
    jest.clearAllMocks();
  });

  describe('getFiles', () => {
    it('should retrieve files for a user', async () => {
      const mockFiles = [
        { id: '1', originalName: 'file1.pdf', userId: 'user1' },
        { id: '2', originalName: 'file2.doc', userId: 'user1' }
      ];

      (db.select as any).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockResolvedValue(mockFiles) as any
              })
            })
          })
        })
      });

      const files = await storage.getFiles('user1', 10, 0);
      expect(files).toEqual(mockFiles);
    });
  });

  describe('getFileStats', () => {
    it('should calculate file statistics', async () => {
      (db.execute as any).mockResolvedValue({
        rows: [{
          totalFiles: '10',
          processedFiles: '8',
          processingFiles: '1',
          errorFiles: '1',
          totalSize: '10485760'
        }]
      });

      const stats = await storage.getFileStats('user1');
      
      expect(stats).toEqual({
        totalFiles: 10,
        processedFiles: 8,
        processingFiles: 1,
        errorFiles: 1,
        totalSize: 10485760
      });
    });
  });

  describe('searchFiles', () => {
    it('should search files by query', async () => {
      const mockResults = [
        { 
          id: '1', 
          originalName: 'test.pdf',
          metadata: { summary: 'Test document' },
          similarity: 0.9
        }
      ];

      (db.execute as any).mockResolvedValue({
        rows: mockResults
      });

      const results = await storage.searchFiles('test query', 'user1', 10);
      expect(results).toEqual(mockResults);
    });
  });

  describe('createFolder', () => {
    it('should create a new folder', async () => {
      const mockFolder = {
        id: 'folder1',
        name: 'Test Folder',
        parentId: null,
        userId: 'user1'
      };

      (db.insert as any).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockFolder])
        } as any)
      } as any);

      const folder = await storage.createFolder({
        name: 'Test Folder',
        path: '/test-folder',
        parentId: null,
        userId: 'user1'
      }, 'user1');

      expect(folder).toEqual(mockFolder);
    });
  });

  describe('deleteFile', () => {
    it('should delete a file', async () => {
      (db.delete as any).mockReturnValue({
        where: jest.fn().mockResolvedValue({ rowCount: 1 })
      } as any);

      const result = await storage.deleteFile('file1', 'user1');
      expect(result).toBe(true);
    });

    it('should return false if file not found', async () => {
      (db.delete as any).mockReturnValue({
        where: jest.fn().mockResolvedValue({ rowCount: 0 })
      } as any);

      const result = await storage.deleteFile('nonexistent', 'user1');
      expect(result).toBe(false);
    });
  });

  describe('updateFileMetadata', () => {
    it('should update file metadata', async () => {
      (db.update as any).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue({ rowCount: 1 })
        } as any)
      } as any);

      const result = await storage.updateFileMetadata('file1', 'user1', {
        summary: 'Updated summary',
        categories: ['tag1', 'tag2']
      });

      expect(result).toBe(true);
    });
  });
});