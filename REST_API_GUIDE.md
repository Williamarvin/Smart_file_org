# Smart File Organizer REST API Guide

## Table of Contents
- [Introduction](#introduction)
- [Authentication](#authentication)
- [Base URLs](#base-urls)
- [API Endpoints](#api-endpoints)
  - [File Management](#file-management)
  - [Folder Management](#folder-management)
  - [Search](#search)
  - [AI Features](#ai-features)
  - [Lesson Generation](#lesson-generation)
  - [Analytics](#analytics)
- [Usage Examples](#usage-examples)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

## Introduction

The Smart File Organizer API provides comprehensive file management capabilities with AI-powered features including semantic search, document chat, avatar interactions, and automated lesson generation.

## Authentication

Currently using a demo user system. All requests authenticate as `demo-user` automatically.

For production deployment, implement proper authentication headers:
```bash
Authorization: Bearer YOUR_API_TOKEN
```

## Base URLs

- **Production**: `https://smart-file-organiser.replit.app/api`
- **Development**: `http://localhost:5000/api`

## API Endpoints

### File Management

#### Upload File (Two-Step Process)

**Step 1: Get Upload URL**
```bash
curl -X POST https://smart-file-organiser.replit.app/api/files/upload-url \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "uploadURL": "https://storage.googleapis.com/bucket/signed-url"
}
```

**Step 2: Upload File to URL**
```bash
curl -X PUT "UPLOAD_URL_FROM_STEP_1" \
  -H "Content-Type: image/jpeg" \
  --data-binary @yourfile.jpg
```

**Step 3: Create File Record**
```bash
curl -X POST https://smart-file-organiser.replit.app/api/files \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "file-123.jpg",
    "originalName": "vacation.jpg",
    "mimeType": "image/jpeg",
    "size": 2048576,
    "uploadURL": "UPLOAD_URL_FROM_STEP_1",
    "folderId": null
  }'
```

#### List Files
```bash
curl https://smart-file-organiser.replit.app/api/files?limit=50&offset=0
```

#### Get File Details
```bash
curl https://smart-file-organiser.replit.app/api/files/FILE_ID
```

#### Download File
```bash
curl -O -J https://smart-file-organiser.replit.app/api/files/FILE_ID/data
```

#### Delete File
```bash
curl -X DELETE https://smart-file-organiser.replit.app/api/files/FILE_ID
```

#### Move File to Folder
```bash
curl -X PUT https://smart-file-organiser.replit.app/api/files/FILE_ID/move \
  -H "Content-Type: application/json" \
  -d '{"folderId": "FOLDER_ID"}'
```

#### Retry File Processing
```bash
curl -X POST https://smart-file-organiser.replit.app/api/files/FILE_ID/retry-processing
```

Use this endpoint to retry processing for files that failed or got stuck during processing.

#### Mark File as Failed
```bash
curl -X POST https://smart-file-organiser.replit.app/api/files/FILE_ID/mark-failed \
  -H "Content-Type: application/json" \
  -d '{"reason": "Processing timeout - file too large"}'
```

Manually mark a file as failed when processing cannot be completed.

#### Get Files by Category
```bash
curl https://smart-file-organiser.replit.app/api/files/category/Education?limit=20
```

### Folder Management

#### Create Folder
```bash
curl -X POST https://smart-file-organiser.replit.app/api/folders \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Documents",
    "parentId": null,
    "color": "#3B82F6",
    "description": "Important documents"
  }'
```

#### List All Folders
```bash
curl https://smart-file-organiser.replit.app/api/folders/all
```

#### List Folders by Parent
```bash
curl https://smart-file-organiser.replit.app/api/folders?parentId=null
```

#### Update Folder
```bash
curl -X PUT https://smart-file-organiser.replit.app/api/folders/FOLDER_ID \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "color": "#10B981"
  }'
```

#### Delete Folder
```bash
curl -X DELETE https://smart-file-organiser.replit.app/api/folders/FOLDER_ID
```

#### Get Files in Folder
```bash
curl https://smart-file-organiser.replit.app/api/folders/FOLDER_ID/files
# Use 'root' for root folder files
curl https://smart-file-organiser.replit.app/api/folders/root/files
```

### Search

#### Semantic Search
```bash
# URL-encode your search query
curl "https://smart-file-organiser.replit.app/api/search/machine%20learning"
```

#### Browse All Files (Empty Search)
```bash
curl https://smart-file-organiser.replit.app/api/search/
```

### AI Features

#### Generate Content from Files
```bash
curl -X POST https://smart-file-organiser.replit.app/api/generate-content \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a summary of these documents",
    "fileIds": ["file1", "file2"],
    "type": "summary"
  }'
```

#### Chat with Files
```bash
curl -X POST https://smart-file-organiser.replit.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the key points in these documents?",
    "fileIds": ["file1", "file2"],
    "chatHistory": [
      {"role": "user", "content": "Previous message"},
      {"role": "assistant", "content": "Previous response"}
    ]
  }'
```

#### Avatar Chat
```bash
curl -X POST https://smart-file-organiser.replit.app/api/avatar-chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Help me organize my files",
    "avatarId": "organizer",
    "personality": "Professional and helpful file organization expert",
    "chatHistory": []
  }'
```

### Lesson Generation

#### Generate Lesson Prompts
```bash
curl -X POST https://smart-file-organiser.replit.app/api/generate-lesson-prompts \
  -H "Content-Type: application/json" \
  -d '{
    "fileIds": ["file1", "file2"],
    "folderIds": ["folder1"],
    "additionalContext": "Focus on beginner level with practical examples"
  }'
```

Response includes prompts for 5 agents:
- `introduction`: PowerPoint slides for introduction
- `warmup`: Flashcards for warm-up activities
- `content`: PowerPoint slides for main content
- `practice`: Quiz questions for practice
- `homework`: Quiz questions for homework

#### Execute Lesson Prompt
```bash
curl -X POST https://smart-file-organiser.replit.app/api/execute-lesson-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "PROMPT_FROM_GENERATION",
    "promptType": "introduction",
    "fileIds": ["file1", "file2"],
    "folderIds": ["folder1"]
  }'
```

### Teacher Chat Sessions

#### Save Teacher Chat Session
```bash
curl -X POST https://smart-file-organiser.replit.app/api/teacher-chat-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Mathematics Course - Session 1",
    "courseTitle": "Introduction to Algebra",
    "targetAudience": "High school students",
    "teachingStyle": "analytical",
    "expertiseSubject": "mathematics",
    "teacherPrompt": "Course prompt content",
    "teacherContent": "Generated course content",
    "chatHistory": [],
    "selectedFiles": ["file-123"],
    "selectedFolders": ["folder-456"]
  }'
```

#### Get Teacher Chat Sessions
```bash
curl https://smart-file-organiser.replit.app/api/teacher-chat-sessions
```

#### Share Teacher Chat Session
```bash
curl -X PATCH https://smart-file-organiser.replit.app/api/teacher-chat-sessions/SESSION_ID/share \
  -H "Content-Type: application/json" \
  -d '{
    "isPublic": 1
  }'
```

### Teacher Agent Endpoints

#### Generate Teacher Prompt
```bash
curl -X POST https://smart-file-organiser.replit.app/api/generate-teacher-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "fileIds": ["file-123"],
    "folderIds": ["folder-456"],
    "courseTitle": "Introduction to Machine Learning",
    "targetAudience": "College students",
    "additionalContext": "Focus on practical applications"
  }'
```

#### Execute Teacher Prompt
```bash
curl -X POST https://smart-file-organiser.replit.app/api/execute-teacher-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Complete teacher prompt content",
    "selectedFiles": ["file-123"],
    "selectedFolders": ["folder-456"]
  }'
```

#### Chat with Teacher Agent
```bash
curl -X POST https://smart-file-organiser.replit.app/api/chat-teacher-agent \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Can you explain this concept in more detail?",
    "courseTitle": "Introduction to Algebra",
    "targetAudience": "High school students",
    "conversationHistory": []
  }'
```

### Analytics

#### Get File Statistics
```bash
curl https://smart-file-organiser.replit.app/api/stats
```

Response:
```json
{
  "totalFiles": 63,
  "processedFiles": 61,
  "processingFiles": 1,
  "errorFiles": 1,
  "totalSize": 104857600
}
```

#### Get Categories
```bash
curl https://smart-file-organiser.replit.app/api/categories
```

Response:
```json
[
  {"category": "Education", "count": 54},
  {"category": "Technology", "count": 9}
]
```

## Usage Examples

### Complete File Upload Flow
```bash
# 1. Get upload URL
UPLOAD_URL=$(curl -X POST https://smart-file-organiser.replit.app/api/files/upload-url \
  -H "Content-Type: application/json" | jq -r '.uploadURL')

# 2. Upload file to cloud storage
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary @document.pdf

# 3. Create file record
curl -X POST https://smart-file-organiser.replit.app/api/files \
  -H "Content-Type: application/json" \
  -d "{
    \"filename\": \"doc-$(date +%s).pdf\",
    \"originalName\": \"document.pdf\",
    \"mimeType\": \"application/pdf\",
    \"size\": $(stat -f%z document.pdf),
    \"uploadURL\": \"$UPLOAD_URL\"
  }"
```

### Search and Chat Flow
```bash
# 1. Search for files
RESULTS=$(curl "https://smart-file-organiser.replit.app/api/search/machine%20learning")

# 2. Extract file IDs (using jq)
FILE_IDS=$(echo $RESULTS | jq -r '.[].id' | jq -R -s -c 'split("\n")[:-1]')

# 3. Chat with found files
curl -X POST https://smart-file-organiser.replit.app/api/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"Summarize the key concepts\",
    \"fileIds\": $FILE_IDS
  }"
```

### Generate Complete Lesson
```bash
# 1. Generate prompts
PROMPTS=$(curl -X POST https://smart-file-organiser.replit.app/api/generate-lesson-prompts \
  -H "Content-Type: application/json" \
  -d '{
    "fileIds": ["file1"],
    "additionalContext": "High school level"
  }')

# 2. Execute each prompt
for TYPE in introduction warmup content practice homework; do
  PROMPT=$(echo $PROMPTS | jq -r ".prompts.$TYPE")
  
  curl -X POST https://smart-file-organiser.replit.app/api/execute-lesson-prompt \
    -H "Content-Type: application/json" \
    -d "{
      \"prompt\": \"$PROMPT\",
      \"promptType\": \"$TYPE\",
      \"fileIds\": [\"file1\"]
    }" > "$TYPE.json"
done
```

## Error Handling

All errors return consistent JSON format:
```json
{
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `204`: No Content (successful deletion)
- `400`: Bad Request
- `404`: Not Found
- `500`: Internal Server Error

## Rate Limiting

Currently no rate limiting is implemented. For production:
- Implement rate limiting (e.g., 100 requests/minute)
- Add API key authentication
- Monitor usage per user

## Testing the API

### Health Check
```bash
curl https://smart-file-organiser.replit.app/api/auth/user
```

### Using Postman
Import the `openapi.json` file into Postman for automatic collection generation with all endpoints.

### Using Python
```python
import requests

# Base URL
BASE_URL = "https://smart-file-organiser.replit.app/api"

# Get files
response = requests.get(f"{BASE_URL}/files")
files = response.json()

# Chat with files
chat_response = requests.post(
    f"{BASE_URL}/chat",
    json={
        "message": "Summarize these files",
        "fileIds": [f["id"] for f in files[:2]]
    }
)
print(chat_response.json()["response"])
```

### Using JavaScript
```javascript
// Fetch files
const response = await fetch('https://smart-file-organiser.replit.app/api/files');
const files = await response.json();

// Avatar chat
const chatResponse = await fetch('https://smart-file-organiser.replit.app/api/avatar-chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Help me organize my files',
    avatarId: 'assistant',
    personality: 'Helpful AI assistant'
  })
});
const chat = await chatResponse.json();
console.log(chat.response);
```

## WebSocket Support (Future)

Currently not implemented. Future versions may include:
- Real-time file processing updates
- Live collaboration features
- Streaming chat responses

## Support

For issues or questions:
1. Check the OpenAPI specification: `openapi.json`
2. Review error messages in responses
3. Contact support at the repository issues page