#!/bin/bash

# Test creating a validation report
echo "Testing validation report creation..."

# Create test data
curl -X POST http://localhost:5000/api/validation-reports/validate \
  -H "Content-Type: application/json" \
  -d '{
    "reportTitle": "Test Validation Report",
    "originalParameters": {
      "courseTitle": "Introduction to Algebra",
      "targetAudience": "High school students",
      "teachingStyle": "visual",
      "expertiseSubject": "mathematics",
      "actionTypes": ["lecture", "discussion", "activity"],
      "durations": [15, 20, 25],
      "difficultyLevels": ["beginner", "intermediate"]
    },
    "chatHistory": [
      { "role": "user", "content": "Can you explain algebra?" },
      { "role": "assistant", "content": "Let me provide a visual explanation for high school students. We will use beginner level concepts with some discussion and activities." }
    ]
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -o /tmp/validation-response.json

echo "Response saved to /tmp/validation-response.json"
echo "Content (first 500 chars):"
head -c 500 /tmp/validation-response.json
echo ""
