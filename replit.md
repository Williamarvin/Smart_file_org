# Overview

This is a full-stack document management and search application that allows users to upload, process, and search through documents and videos using AI-powered content analysis. The system extracts text from various file formats (PDF, DOCX, TXT) and transcribes video content using OpenAI's Whisper model, generates metadata and embeddings using OpenAI GPT-4o, and provides semantic search capabilities powered by PostgreSQL pgvector for optimized vector similarity search. Built with a React frontend and Express.js backend, the application features a modern multi-page navigation system with dedicated sections for dashboard overview, file browsing, uploading, and analytics.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes

## Database Performance Fix (Aug 12, 2025)
- **Issue**: Fixed critical database performance problem caused by storing large binary files (up to 65MB) in PostgreSQL bytea columns
- **Impact**: 351MB of bytea data was causing query timeouts and memory issues
- **Solution**: 
  - Increased bytea storage threshold to 100MB (per user request)
  - Fixed database queries to exclude bytea columns from SELECT statements
  - Modified getFile and getFilesWithoutBytea methods to avoid loading bytea data
  - Successfully backfilled all files under 100MB with dual storage
  - Updated storage strategy: files <100MB use dual storage, files ≥100MB use cloud-only
- **Result**: API response times improved from timeouts to ~375-619ms with full bytea functionality

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/UI components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing with multi-page navigation
- **Navigation**: Sidebar-based navigation with dedicated pages for Dashboard, Browse, Upload, and Analysis
- **File Upload**: Uppy.js with AWS S3 integration for direct-to-cloud uploads
- **Design System**: Modern, accessible component library with consistent styling using CSS variables

## Backend Architecture
- **Framework**: Express.js server with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL as the primary database
- **File Processing**: Async document and video processing pipeline that extracts text from PDFs, DOCX, text files, and transcribes video files using Whisper
- **AI Integration**: OpenAI GPT-4o for metadata extraction and content embeddings generation, plus Whisper for video transcription
- **Object Storage**: Google Cloud Storage with custom ACL (Access Control List) system for fine-grained permissions
- **Development**: Hot reload with Vite integration for seamless full-stack development

## Data Storage Architecture
- **Primary Database**: PostgreSQL via Neon serverless with connection pooling
- **Vector Store**: PostgreSQL pgvector extension for optimized vector similarity search
- **Schema Design**: 
  - `files` table for file metadata and processing status
  - `file_metadata` table for AI-extracted content analysis with optimized vector embeddings
  - `search_history` table for search analytics
  - `users` table for authentication (prepared for future use)
- **File Storage**: Google Cloud Storage buckets with object-level access control
- **Vector Search**: pgvector with HNSW indexing for fast semantic similarity search at scale

## Key Features
- **Multi-Page Navigation**: Separate dedicated pages for different functions
  - Dashboard: Overview with quick actions and recent activity
  - Browse: File exploration with advanced search capabilities  
  - Upload: Dedicated file upload interface with processing status
  - Analysis: Comprehensive statistics and insights dashboard
- **Document & Video Processing Pipeline**: Automated text extraction from documents, video transcription via Whisper, AI analysis, and embedding generation
- **Bulk File Operations**: Multi-file selection with bulk moving capabilities for efficient document organization
- **Semantic Search**: Vector similarity search combined with traditional text search
- **Real-time Updates**: Live processing status updates via polling
- **File Management**: Upload, preview, delete operations with progress tracking

# External Dependencies

## Cloud Services
- **Neon Database**: Serverless PostgreSQL hosting with automatic scaling
- **Google Cloud Storage**: Object storage with custom authentication via Replit sidecar
- **OpenAI API**: GPT-4o model for document analysis and text embeddings generation

## Core Libraries
- **Database**: Drizzle ORM with Neon serverless driver for type-safe database operations
- **Authentication**: Prepared for integration (schema exists, implementation pending)
- **File Processing**: 
  - `pdf-parse` for PDF text extraction
  - `mammoth` for DOCX document processing
  - `ffmpeg-static` for video audio extraction
  - OpenAI Whisper for video transcription
  - `multer` for multipart form handling
- **UI Components**: Comprehensive Shadcn/UI component library with Radix UI primitives
- **Development Tools**: 
  - Replit-specific plugins for development environment integration
  - ESBuild for server-side bundling
  - Vite for frontend development and hot reload

## Integration Points
- **Replit Sidecar**: Custom authentication flow for Google Cloud Storage access
- **Direct Upload Flow**: Client gets presigned URLs, uploads directly to cloud, then notifies server
- **Processing Queue**: Async document processing with status tracking and error handling