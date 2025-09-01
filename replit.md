# Overview

This is a full-stack file management and search application designed for uploading, processing, and searching documents and videos using AI-powered content analysis. The system extracts text from various file formats, transcribes video content, generates metadata and embeddings, and provides semantic search capabilities. It features a React frontend and Express.js backend, with a modern multi-page navigation system for dashboard overview, file browsing, uploading, and analytics. The project aims to provide a robust, AI-enhanced platform for efficient content organization and retrieval, enabling automatic content extraction from various sources including Google Drive and Excel imports, and offering advanced features like AI-powered video generation and hierarchical file organization.

# User Preferences

Preferred communication style: Simple, everyday language.
Default AI Provider: Dify MCP (for access to 7000+ external tools).
Deployment preference: Multiple options (Replit, Docker, local deployment).

# System Architecture

## Frontend Architecture

- **Framework**: React with TypeScript, using Vite.
- **UI Library**: Shadcn/UI (built on Radix UI) with Tailwind CSS.
- **State Management**: TanStack Query for server state and caching.
- **Routing**: Wouter for client-side routing.
- **Navigation**: Sidebar-based, with pages for Dashboard, Browse, Upload, Processing Status, and Analysis.
- **File Upload**: Uppy.js for direct-to-cloud uploads.
- **UX Decisions**: Chat input positioned at the top, manual scroll control in chat.

## Backend Architecture

- **Framework**: Express.js with TypeScript.
- **Database ORM**: Drizzle ORM with PostgreSQL.
- **File Processing**: Asynchronous pipeline for document and video content extraction and transcription, including automatic OCR for scanned PDFs and Whisper AI for video transcription.
- **AI Integration**: Flexible provider system with **Dify MCP as default**, supporting both Dify (Model Context Protocol) and OpenAI GPT-4o with seamless switching across all AI features including teacher agents.
- **MCP Support**: Full integration with Dify's Model Context Protocol enabling access to 7000+ external tools through standardized interfaces (Zapier, Linear, Gmail, etc) with conversation memory support.
- **Object Storage**: Google Cloud Storage with custom ACL.

## Data Storage Architecture

- **Primary Database**: PostgreSQL via Neon serverless.
- **Vector Store**: PostgreSQL pgvector for vector similarity search with HNSW indexing.
- **Schema Design**: Tables for `files`, `file_metadata`, `search_history`, and `users`.
- **File Storage**: Hybrid system utilizing Google Cloud Storage for all files and PostgreSQL BYTEA caching for files ≤10MB.

## Key Features

- **Multi-Page Navigation**: Dedicated sections for Dashboard, Browse, Upload, Processing Status, and Analysis.
- **Slideshow Video Generation**: Create MP4 videos with AI-generated slides and OpenAI TTS narration (multiple voice options).
- **Document & Video Processing Pipeline**: Automated text extraction, video transcription, AI analysis, OCR, and embedding generation.
- **Excel Import System**: Automatic hierarchical folder/file structure creation from curriculum spreadsheets, integrated with Google Drive.
- **Bulk File Operations**: Multi-file selection with bulk moving and comprehensive folder upload capabilities.
- **Semantic Search**: Vector similarity search with title priority.
- **Real-time Updates**: Live processing status updates with detailed error tracking and auto-processing.
- **File Management**: Upload, preview, delete, and view detailed metadata with progress tracking.
- **Content Generation**: Support for selecting entire folders and up to 1000 files for content creation, with automatic deduplication.
- **Automatic OCR**: Background OCR processing for scanned PDFs using Tesseract.js with Google Vision fallback, integrated directly into the file processing pipeline.
- **Intelligent Duplicate Folder Handling**: When uploading Excel files or creating folders with the same name, automatically creates incrementally named folders (folder_1, folder_2, etc.) to prevent conflicts and maintain organized file structure.
- **Optimized Performance**: Non-blocking storage implementation, optimized queries, caching, and fixed N+1 query problems.
- **Teacher Agent Features**: Global configuration for teaching style and expertise, AI pre-filled sections, structured course editor with customizable sections (content, action type, duration, difficulty), chat session management, natural teacher voice, text-to-speech integration, and full dual-provider support (OpenAI/Dify) for all teacher agent functionalities.
- **Validation Report System**: Generates PDF reports comparing teacher chat session parameters with original request parameters, including compliance scoring.
- **Flexible AI Provider System**: User-selectable AI providers (Dify as default or OpenAI) with seamless switching and per-request provider selection.
- **Dify MCP Integration**: Default provider with full Model Context Protocol support enabling access to 7000+ external tools (Zapier, Linear, Gmail) through standardized interfaces with conversation memory.
- **CI/CD Pipeline**: GitHub Actions workflow for automated testing, linting, and Docker image building.
- **Docker Support**: Production-ready Docker configuration with multi-stage builds and Docker Compose for easy deployment.
- **Multiple Deployment Options**: Support for Replit, Docker, local deployment, and major cloud platforms.

# External Dependencies

## Cloud Services

- **Neon Database**: Serverless PostgreSQL.
- **Google Cloud Storage**: Object storage.
- **OpenAI API**: GPT-4o and Whisper models.

## Core Libraries

- **Database**: Drizzle ORM.
- **File Processing**: `pdf-parse`, `mammoth`, `ffmpeg-static`, `multer`, `tesseract.js`.
- **UI Components**: Shadcn/UI.
- **PDF Generation**: `pdfkit`.

## Integration Points

- **Replit Sidecar**: Custom authentication for Google Cloud Storage.
- **Direct Upload Flow**: Client-side direct uploads to cloud storage.
- **Processing Queue**: Asynchronous document processing.
- **Google Drive API**: For downloading files from Google Drive.
