// Backend API Integration Tests
import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

// Mock the database and storage
jest.mock('../../server/db', () => ({
  db: {},
  pool: { end: jest.fn() }
}));

jest.mock('../../server/storage', () => ({
  storage: {
    getFiles: jest.fn().mockResolvedValue([
      { id: '1', originalName: 'test.pdf', mimeType: 'application/pdf', size: 1024 }
    ]),
    getFileStats: jest.fn().mockResolvedValue({
      totalFiles: 10,
      processedFiles: 8,
      processingFiles: 1,
      errorFiles: 1,
      totalSize: 10485760
    }),
    getCategories: jest.fn().mockResolvedValue([
      { category: 'Education', count: 5 },
      { category: 'Business', count: 3 }
    ]),
    searchFiles: jest.fn().mockResolvedValue([
      { id: '1', originalName: 'test.pdf', metadata: { summary: 'Test document' } }
    ]),
    getFile: jest.fn().mockResolvedValue({
      id: '1',
      originalName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      metadata: { summary: 'Test document' }
    }),
    deleteFile: jest.fn().mockResolvedValue(true),
    createFolder: jest.fn().mockResolvedValue({
      id: 'folder1',
      name: 'Test Folder',
      parentId: null
    }),
    getFolders: jest.fn().mockResolvedValue([
      { id: 'folder1', name: 'Test Folder', parentId: null }
    ])
  }
}));

// Mock OpenAI
jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: 'Test response' } }]
          })
        }
      },
      audio: {
        speech: {
          create: jest.fn().mockResolvedValue({
            arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('audio-data'))
          })
        }
      }
    }))
  };
});

describe('API Endpoints', () => {
  let app: express.Application;

  beforeAll(async () => {
    // Import after mocks are set up
    const { setupRoutes } = await import('../../server/routes');
    app = express();
    app.use(express.json());
    setupRoutes(app);
  });

  describe('GET /api/files', () => {
    it('should return list of files', async () => {
      const response = await request(app)
        .get('/api/files')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('originalName', 'test.pdf');
    });

    it('should handle pagination', async () => {
      const response = await request(app)
        .get('/api/files?limit=5&offset=0')
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/stats', () => {
    it('should return file statistics', async () => {
      const response = await request(app)
        .get('/api/stats')
        .expect(200);

      expect(response.body).toHaveProperty('totalFiles', 10);
      expect(response.body).toHaveProperty('processedFiles', 8);
      expect(response.body).toHaveProperty('totalSize');
    });
  });

  describe('GET /api/categories', () => {
    it('should return file categories', async () => {
      const response = await request(app)
        .get('/api/categories')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('category');
      expect(response.body[0]).toHaveProperty('count');
    });
  });

  describe('POST /api/search', () => {
    it('should search files', async () => {
      const response = await request(app)
        .post('/api/search')
        .send({ query: 'test' })
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('originalName', 'test.pdf');
    });

    it('should reject empty search query', async () => {
      await request(app)
        .post('/api/search')
        .send({ query: '' })
        .expect(400);
    });
  });

  describe('DELETE /api/files/:id', () => {
    it('should delete a file', async () => {
      const response = await request(app)
        .delete('/api/files/1')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('POST /api/folders', () => {
    it('should create a folder', async () => {
      const response = await request(app)
        .post('/api/folders')
        .send({ name: 'Test Folder' })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', 'Test Folder');
    });

    it('should reject empty folder name', async () => {
      await request(app)
        .post('/api/folders')
        .send({ name: '' })
        .expect(400);
    });
  });

  describe('GET /api/folders', () => {
    it('should return folders', async () => {
      const response = await request(app)
        .get('/api/folders')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('name', 'Test Folder');
    });
  });

  describe('POST /api/avatar-chat', () => {
    it('should handle avatar chat request', async () => {
      const response = await request(app)
        .post('/api/avatar-chat')
        .send({
          message: 'Hello',
          avatarId: 'sage',
          personality: 'Wise mentor',
          chatHistory: [],
          voiceEnabled: true,
          voiceModel: 'onyx'
        })
        .expect(200);

      expect(response.body).toHaveProperty('response');
      expect(response.body).toHaveProperty('audioData');
    });

    it('should reject invalid avatar chat request', async () => {
      await request(app)
        .post('/api/avatar-chat')
        .send({ message: 'Hello' })
        .expect(400);
    });
  });

  describe('POST /api/generate-lesson-prompts', () => {
    it('should generate lesson prompts', async () => {
      const response = await request(app)
        .post('/api/generate-lesson-prompts')
        .send({
          fileContent: 'Test content',
          lessonType: 'comprehensive'
        })
        .expect(200);

      expect(response.body).toHaveProperty('prompts');
    });
  });
});