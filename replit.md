# Overview

This is a full-stack file management and search application designed for uploading, processing, and searching documents and videos using AI-powered content analysis. The system extracts text from various file formats and transcribes video content, generates metadata and embeddings, and provides semantic search capabilities. It features a React frontend and Express.js backend, with a modern multi-page navigation system for dashboard overview, file browsing, uploading, and analytics. The project aims to provide a robust, AI-enhanced platform for efficient content organization and retrieval.

## Recent Updates (August 20, 2025)
- **Complete API Documentation**: Full OpenAPI 3.0 specification with all 25+ endpoints documented
- **REST API Guide**: Comprehensive guide with curl examples for all endpoints
- **Code Quality Review**: Senior engineer quality check completed, TypeScript errors resolved
- **Documentation Cleanup**: Removed redundant files, kept only essential documentation
- **Lesson Generation API**: Full documentation for multi-agent lesson creation system
- **Avatar Chat API**: Complete endpoint documentation with oversight agent integration
- **Folder Management**: Full CRUD operations for folder hierarchy documented
- **Production Ready**: Clean build (863KB bundle), all systems verified and documented

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript, using Vite.
- **UI Library**: Shadcn/UI (built on Radix UI) with Tailwind CSS.
- **State Management**: TanStack Query for server state and caching.
- **Routing**: Wouter for client-side routing.
- **Navigation**: Sidebar-based, with pages for Dashboard, Browse, Upload, and Analysis.
- **File Upload**: Uppy.js for direct-to-cloud uploads.

## Backend Architecture
- **Framework**: Express.js with TypeScript.
- **Database ORM**: Drizzle ORM with PostgreSQL.
- **File Processing**: Asynchronous pipeline for document and video content extraction and transcription.
- **AI Integration**: OpenAI GPT-4o for metadata and embeddings, Whisper for video transcription.
- **Object Storage**: Google Cloud Storage with custom ACL.

## Data Storage Architecture
- **Primary Database**: PostgreSQL via Neon serverless.
- **Vector Store**: PostgreSQL pgvector for vector similarity search.
- **Schema Design**: Tables for `files`, `file_metadata`, `search_history`, and `users`.
- **File Storage**: Hybrid system utilizing Google Cloud Storage for all files and PostgreSQL BYTEA caching for files ≤10MB for performance.
- **Vector Search**: pgvector with HNSW indexing.

## Key Features
- **Multi-Page Navigation**: Dedicated sections for Dashboard, Browse, Upload, and Analysis.
- **Document & Video Processing Pipeline**: Automated text extraction, video transcription, AI analysis, and embedding generation.
- **Bulk File Operations**: Multi-file selection with bulk moving and comprehensive folder upload capabilities.
- **Semantic Search**: Vector similarity search combined with traditional text search.
- **Real-time Updates**: Live processing status updates.
- **File Management**: Upload, preview, and delete operations with progress tracking.
- **Enhanced Selection**: Global and current view file selection options.
- **Optimized Performance**: Non-blocking storage implementation with optimized queries, caching, and fixed N+1 query problems for fast response times.
- **Improved UX**: Chat input positioned at the top for immediate access, with manual scroll control to prevent unwanted auto-scrolling during conversations.

# External Dependencies

## Cloud Services
- **Neon Database**: Serverless PostgreSQL.
- **Google Cloud Storage**: Object storage.
- **OpenAI API**: GPT-4o and Whisper models.

## Core Libraries
- **Database**: Drizzle ORM.
- **File Processing**: `pdf-parse`, `mammoth`, `ffmpeg-static`, `multer`.
- **UI Components**: Shadcn/UI.

## Integration Points
- **Replit Sidecar**: Custom authentication for Google Cloud Storage.
- **Direct Upload Flow**: Client-side direct uploads to cloud storage.
- **Processing Queue**: Asynchronous document processing.