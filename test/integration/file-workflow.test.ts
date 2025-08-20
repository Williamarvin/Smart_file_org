// End-to-End File Workflow Integration Tests
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';

// Mock dependencies
jest.mock('../../server/db');
jest.mock('../../server/storage');
jest.mock('openai');

describe('File Workflow Integration', () => {
  let app: express.Application;

  beforeAll(async () => {
    app = express();
    registerRoutes(app as any);
  });

  describe('Complete File Upload and Processing Workflow', () => {
    it('should handle file upload, processing, and search workflow', async () => {
      // Step 1: Request upload URL
      const uploadUrlResponse = await request(app)
        .post('/api/files/upload-url')
        .send({ 
          fileName: 'test-document.pdf',
          fileType: 'application/pdf'
        })
        .expect(200);

      expect(uploadUrlResponse.body).toHaveProperty('uploadURL');
      expect(uploadUrlResponse.body).toHaveProperty('fileId');

      const fileId = uploadUrlResponse.body.fileId;

      // Step 2: Confirm file upload
      const confirmResponse = await request(app)
        .post('/api/files')
        .send({
          id: fileId,
          fileName: 'test-document.pdf',
          fileType: 'application/pdf',
          fileSize: 1024000
        })
        .expect(200);

      expect(confirmResponse.body).toHaveProperty('id', fileId);

      // Step 3: Check file processing status
      const statsResponse = await request(app)
        .get('/api/stats')
        .expect(200);

      expect(statsResponse.body).toHaveProperty('totalFiles');
      expect(statsResponse.body.totalFiles).toBeGreaterThan(0);

      // Step 4: Search for the file
      const searchResponse = await request(app)
        .post('/api/search')
        .send({ query: 'test document' })
        .expect(200);

      expect(Array.isArray(searchResponse.body)).toBe(true);

      // Step 5: Get file details
      const fileResponse = await request(app)
        .get(`/api/files/${fileId}`)
        .expect(200);

      expect(fileResponse.body).toHaveProperty('id', fileId);
      expect(fileResponse.body).toHaveProperty('originalName');
    });
  });

  describe('Folder Management Workflow', () => {
    it('should create folder hierarchy and organize files', async () => {
      // Step 1: Create parent folder
      const parentFolder = await request(app)
        .post('/api/folders')
        .send({ name: 'Documents' })
        .expect(200);

      expect(parentFolder.body).toHaveProperty('id');
      const parentId = parentFolder.body.id;

      // Step 2: Create child folder
      const childFolder = await request(app)
        .post('/api/folders')
        .send({ 
          name: 'Work Documents',
          parentId: parentId
        })
        .expect(200);

      expect(childFolder.body).toHaveProperty('parentId', parentId);

      // Step 3: Get folder hierarchy
      const foldersResponse = await request(app)
        .get('/api/folders')
        .expect(200);

      expect(Array.isArray(foldersResponse.body)).toBe(true);

      // Step 4: Get files in folder
      const filesInFolder = await request(app)
        .get(`/api/folders/${parentId}/files`)
        .expect(200);

      expect(Array.isArray(filesInFolder.body)).toBe(true);
    });
  });

  describe('Avatar Chat Workflow', () => {
    it('should handle multi-turn conversation with context', async () => {
      // First message
      const firstResponse = await request(app)
        .post('/api/avatar-chat')
        .send({
          message: 'Hello, can you help me with my files?',
          avatarId: 'sage',
          personality: 'Wise mentor',
          chatHistory: [],
          voiceEnabled: false
        })
        .expect(200);

      expect(firstResponse.body).toHaveProperty('response');
      expect(firstResponse.body).toHaveProperty('conversationContext');

      // Second message with context
      const secondResponse = await request(app)
        .post('/api/avatar-chat')
        .send({
          message: 'What types of files can I upload?',
          avatarId: 'sage',
          personality: 'Wise mentor',
          chatHistory: [
            { role: 'user', content: 'Hello, can you help me with my files?' },
            { role: 'assistant', content: firstResponse.body.response }
          ],
          conversationContext: firstResponse.body.conversationContext,
          voiceEnabled: true,
          voiceModel: 'onyx'
        })
        .expect(200);

      expect(secondResponse.body).toHaveProperty('response');
      // With voice enabled, should have audio data
      expect(secondResponse.body).toHaveProperty('audioData');
    });
  });

  describe('Lesson Generation Workflow', () => {
    it('should generate lesson content from file', async () => {
      // Step 1: Generate lesson prompts
      const promptsResponse = await request(app)
        .post('/api/generate-lesson-prompts')
        .send({
          fileContent: 'Sample educational content about programming',
          lessonType: 'comprehensive'
        })
        .expect(200);

      expect(promptsResponse.body).toHaveProperty('prompts');

      // Step 2: Execute lesson prompt
      const lessonResponse = await request(app)
        .post('/api/execute-lesson-prompt')
        .send({
          promptType: 'powerpoint',
          prompt: promptsResponse.body.prompts.powerpoint || 'Create a presentation',
          fileContent: 'Sample content'
        })
        .expect(200);

      expect(lessonResponse.body).toHaveProperty('content');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid requests gracefully', async () => {
      // Invalid search query
      await request(app)
        .post('/api/search')
        .send({})
        .expect(400);

      // Non-existent file
      await request(app)
        .get('/api/files/non-existent-id')
        .expect(404);

      // Invalid folder creation
      await request(app)
        .post('/api/folders')
        .send({ name: '' })
        .expect(400);
    });
  });
});