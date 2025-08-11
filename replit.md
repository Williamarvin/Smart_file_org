# Overview

This is a full-stack document management and search application that allows users to upload, process, and search through documents using AI-powered content analysis. The system extracts text from various file formats (PDF, DOCX, TXT), generates metadata and embeddings using OpenAI, and provides semantic search capabilities. Built with a React frontend and Express.js backend, the application offers a modern file management interface with real-time processing status updates and intelligent content discovery features.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/UI components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **File Upload**: Uppy.js with AWS S3 integration for direct-to-cloud uploads
- **Design System**: Modern, accessible component library with consistent styling using CSS variables

## Backend Architecture
- **Framework**: Express.js server with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL as the primary database
- **File Processing**: Async document processing pipeline that extracts text from PDFs, DOCX, and text files
- **AI Integration**: OpenAI GPT-4o for metadata extraction and content embeddings generation
- **Object Storage**: Google Cloud Storage with custom ACL (Access Control List) system for fine-grained permissions
- **Development**: Hot reload with Vite integration for seamless full-stack development

## Data Storage Architecture
- **Primary Database**: PostgreSQL via Neon serverless with connection pooling
- **Schema Design**: 
  - `files` table for file metadata and processing status
  - `file_metadata` table for AI-extracted content analysis with vector embeddings
  - `search_history` table for search analytics
  - `users` table for authentication (prepared for future use)
- **File Storage**: Google Cloud Storage buckets with object-level access control
- **Vector Search**: PostgreSQL arrays storing OpenAI embeddings for semantic similarity search

## Key Features
- **Document Processing Pipeline**: Automated text extraction, AI analysis, and embedding generation
- **Semantic Search**: Vector similarity search combined with traditional text search
- **Real-time Updates**: Live processing status updates via polling
- **File Management**: Upload, preview, delete operations with progress tracking
- **Analytics**: Search history and file statistics dashboard

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