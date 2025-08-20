# Smart File Organizer

An advanced AI-powered document management and lesson generation platform with semantic search, intelligent chat, and multi-agent content creation.

## 🚀 Features

### Core Capabilities
- **📁 Smart File Management**: Upload, organize, and manage documents and videos with folder hierarchy
- **🔍 AI-Powered Search**: Semantic similarity search using OpenAI embeddings and pgvector
- **💬 Document Chat**: Conversational AI interface with oversight agent for context management
- **🤖 Avatar System**: AI personas with distinct personalities and database access
- **📚 Lesson Generation**: Multi-agent system creating PowerPoints, flashcards, and quizzes
- **⚡ Hybrid Storage**: Optimized performance with PostgreSQL BYTEA (≤10MB) + Google Cloud Storage
- **🎥 Media Processing**: Automatic text extraction from PDFs, documents, and video transcription

### Technical Highlights
- **Vector Search**: PostgreSQL pgvector with HNSW indexing for fast similarity search
- **Oversight Agent**: Intelligent conversation management that keeps discussions on-topic
- **Real-time Processing**: Background job processing with status updates
- **Caching Layer**: Multi-level caching for optimized query performance
- **Type Safety**: Full TypeScript implementation with Drizzle ORM

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and optimized builds
- **Shadcn/UI** components (Radix UI + Tailwind CSS)
- **TanStack Query** for server state management
- **Wouter** for client-side routing
- **Uppy.js** for advanced file uploads

### Backend
- **Express.js** with TypeScript
- **PostgreSQL** with Neon serverless
- **Drizzle ORM** for type-safe database operations
- **OpenAI GPT-4o** for AI features
- **Google Cloud Storage** for file storage
- **pgvector** for vector similarity search

### AI Integration
- **OpenAI GPT-4o**: Content analysis, chat, and generation
- **Whisper**: Video/audio transcription
- **Custom Agents**: Specialized lesson creation agents

## 📦 Installation

### Prerequisites
- Node.js 20+ 
- PostgreSQL database (Neon recommended)
- OpenAI API key
- Google Cloud Storage bucket (optional)

### Environment Variables
Create a `.env` file:
```env
# Database
DATABASE_URL=postgresql://user:pass@host/dbname
PGHOST=host
PGUSER=user
PGPASSWORD=password
PGDATABASE=dbname
PGPORT=5432

# OpenAI
OPENAI_API_KEY=sk-...

# Optional: Google Cloud Storage
GCS_BUCKET_NAME=your-bucket
GCS_PROJECT_ID=your-project
```

### Setup Steps

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/smart-file-organizer.git
cd smart-file-organizer
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up the database**
```bash
npm run db:push
```

4. **Start development server**
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

## 🔌 API Documentation

### OpenAPI Specification
- **JSON**: `openapi.json` - Complete API specification
- **YAML**: `openapi.yaml` - Alternative format
- **Guide**: `REST_API_GUIDE.md` - Usage examples with curl

### Key Endpoints
- `POST /api/files` - Upload and process files
- `GET /api/search/{query}` - Semantic search
- `POST /api/chat` - Chat with documents
- `POST /api/avatar-chat` - Avatar interactions
- `POST /api/generate-lesson-prompts` - Generate lesson content
- `GET /api/stats` - Usage statistics

### Example Usage
```bash
# Search files
curl "https://your-domain.com/api/search/machine%20learning"

# Chat with files
curl -X POST https://your-domain.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Summarize these documents", "fileIds": ["id1", "id2"]}'
```

## 🚀 Deployment

### Replit Deployment
1. Import the repository to Replit
2. Set environment variables in Secrets
3. Click "Run" to start the application
4. Use Replit Deployments for production

### Manual Deployment
1. Build the application:
```bash
npm run build
```

2. Start production server:
```bash
npm start
```

### Docker Deployment
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 5000
CMD ["npm", "start"]
```

## 📁 Project Structure

```
smart-file-organizer/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable UI components
│   │   └── lib/           # Utilities and helpers
├── server/                 # Backend Express application
│   ├── routes.ts          # API endpoints
│   ├── storage.ts         # Database operations
│   ├── openai.ts          # AI integrations
│   └── oversightAgent.ts  # Conversation management
├── shared/                 # Shared types and schemas
│   └── schema.ts          # Database schema
├── openapi.json           # API specification
├── REST_API_GUIDE.md      # API usage guide
└── README.md              # This file
```

## 🧪 Testing

### API Testing
```bash
# Run API tests
npm run test:api

# Test with curl
./test-api.sh
```

### Manual Testing
1. Upload test files through the UI
2. Verify processing status updates
3. Test search functionality
4. Interact with chat features
5. Generate lesson content

## 🔧 Development

### Code Quality
- **TypeScript**: Strict mode enabled
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Drizzle Kit**: Database migrations

### Best Practices
- Use Drizzle ORM for all database operations
- Implement proper error handling
- Add TypeScript types for all data structures
- Follow React hooks best practices
- Use TanStack Query for data fetching

### Common Commands
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run db:push      # Push schema changes
npm run db:studio    # Open Drizzle Studio
npm run lint         # Run linter
npm run type-check   # Check TypeScript
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Contribution Guidelines
- Follow existing code style
- Update documentation
- Test thoroughly
- Keep commits atomic
- Write descriptive commit messages

## 📊 Performance

### Optimizations
- **Hybrid Storage**: BYTEA for files ≤10MB, cloud for larger
- **Caching**: Multi-level caching with cache invalidation
- **Indexed Search**: pgvector HNSW indexing
- **Lazy Loading**: Component and route code splitting
- **Query Optimization**: Batch operations and connection pooling

### Benchmarks
- File upload: <2s for 10MB files
- Search latency: <100ms for vector similarity
- Chat response: <3s with context
- Lesson generation: <15s for complete set

## 🔒 Security

### Implemented Measures
- Input validation with Zod
- SQL injection prevention via Drizzle ORM
- XSS protection
- Rate limiting ready (implement in production)
- Secure file upload with signed URLs

### Production Recommendations
- Implement proper authentication (JWT/OAuth)
- Add rate limiting
- Enable CORS restrictions
- Use environment-specific configs
- Regular security audits

## 📝 License

MIT License - see LICENSE file for details

## 🆘 Support

### Documentation
- [REST API Guide](./REST_API_GUIDE.md)
- [OpenAPI Specification](./openapi.json)
- [Architecture Overview](./replit.md)

### Getting Help
- Check the documentation first
- Review closed issues
- Open a new issue with details
- Contact maintainers

## 🎯 Roadmap

### Planned Features
- [ ] Real-time collaboration
- [ ] Advanced permission system
- [ ] Mobile application
- [ ] Webhook integrations
- [ ] Batch processing API
- [ ] Export to various formats
- [ ] Advanced analytics dashboard
- [ ] Multi-language support

### In Progress
- WebSocket support for real-time updates
- Enhanced caching strategies
- Performance monitoring
- Automated testing suite

## 👥 Team

Built with ❤️ by the Smart File Organizer team

---

**Note**: This is a demo application with a mock authentication system. For production use, implement proper authentication and authorization.