# Master Teacher Agent - Complete API Workflow Example

This guide demonstrates the complete process of using the Master Teacher Agent system with real API endpoints and curl commands.

## Complete Workflow Overview

1. Select files/folders
2. Configure teacher agent settings
3. Generate teacher prompt with sections
4. Review and edit sections
5. Consolidate into final prompt
6. Execute teacher agent
7. Chat with teacher
8. Create validation report

## Step 1: Get Available Files and Folders

### List all files
```bash
curl -X GET http://localhost:5000/api/files \
  -H "Accept: application/json"
```

Response example:
```json
[
  {
    "id": "4d0f1605-e103-4eca-8ecf-6415ef4a6f8b",
    "filename": "algebra-basics.pdf",
    "originalName": "Algebra Basics Guide.pdf",
    "processingStatus": "completed",
    "category": "Education"
  },
  {
    "id": "5e1f2716-f214-5fdb-9fde-7526fg5b7c9c",
    "filename": "math-exercises.pdf",
    "originalName": "Math Practice Exercises.pdf",
    "processingStatus": "completed",
    "category": "Education"
  }
]
```

### List all folders
```bash
curl -X GET http://localhost:5000/api/folders \
  -H "Accept: application/json"
```

Response example:
```json
[
  {
    "id": "4c0044f3-bbba-45d9-85fe-a2f9ea8510c6",
    "name": "Mathematics",
    "path": "/Mathematics",
    "parentId": null
  }
]
```

## Step 2: Generate Teacher Prompt with Configuration

This is the main endpoint that generates the structured 5-section teacher prompt based on your configuration.

```bash
curl -X POST http://localhost:5000/api/generate-teacher-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "fileIds": ["4d0f1605-e103-4eca-8ecf-6415ef4a6f8b", "5e1f2716-f214-5fdb-9fde-7526fg5b7c9c"],
    "folderIds": ["4c0044f3-bbba-45d9-85fe-a2f9ea8510c6"],
    "courseTitle": "Introduction to Algebra",
    "targetAudience": "High school students (ages 14-16)",
    "additionalContext": "Focus on practical applications and real-world examples"
  }'
```

Response - Generated Teacher Prompt with 5 Sections:
```json
{
  "teacherPrompt": "## Introduction (5 minutes)\n**Action Type:** PPT\n**Difficulty:** Beginner\n**Teaching Style:** Visual\n\nWelcome to our algebra journey! Today we'll explore the fundamental concepts of algebra that form the foundation of advanced mathematics.\n\n### Key Points:\n- What is algebra and why it matters\n- Variables as unknown quantities\n- Real-world applications in everyday life\n\nUse visual slides showing:\n- Shopping scenarios with unknown prices\n- Sports statistics with variables\n- Simple balance scales to represent equations\n\n---\n\n## Warm-up Activities (10 minutes)\n**Action Type:** Flashcards\n**Difficulty:** Beginner\n**Teaching Style:** Hands-on\n\nLet's activate our mathematical thinking with interactive flashcards!\n\n### Activities:\n1. **Variable Recognition Cards:** Match everyday scenarios to algebraic expressions\n   - \"The cost of x apples at $2 each\" → 2x\n   - \"Your age in 5 years\" → a + 5\n\n2. **Quick Mental Math:** Solve when x = 3\n   - 2x + 1 = ?\n   - x² - 4 = ?\n   - 5x - x = ?\n\n3. **Pattern Recognition:** Find the next term\n   - 2, 4, 6, __ (arithmetic)\n   - 1, 4, 9, __ (quadratic)\n\n---\n\n## Main Content (20 minutes)\n**Action Type:** PPT\n**Difficulty:** Intermediate\n**Teaching Style:** Analytical\n\nNow let's dive deep into core algebraic concepts with structured analysis.\n\n### Section 1: Understanding Variables (7 minutes)\n- Variables as placeholders for unknown values\n- Different types of variables (constants vs. changing)\n- Writing algebraic expressions from word problems\n\n### Section 2: Basic Operations (7 minutes)\n- Adding and subtracting like terms\n- Distributive property: a(b + c) = ab + ac\n- Combining like terms: 3x + 2x = 5x\n\n### Section 3: Solving Simple Equations (6 minutes)\n- One-step equations: x + 5 = 12\n- Two-step equations: 2x - 3 = 7\n- Checking solutions by substitution\n\n**Interactive Examples:**\n- Solve together: \"If 3 notebooks cost $15, how much does one cost?\"\n- Model the thinking process step-by-step\n\n---\n\n## Practice Activities (15 minutes)\n**Action Type:** Quiz\n**Difficulty:** Intermediate\n**Teaching Style:** Hands-on\n\nTime to apply what we've learned through interactive practice!\n\n### Quiz Questions (Progressive Difficulty):\n\n1. **Basic Understanding (3 questions)**\n   - If x = 4, what is 3x + 2?\n   - Simplify: 5a + 3a - 2a\n   - Which expression represents \"twice a number plus 5\"?\n\n2. **Application Problems (4 questions)**\n   - A rectangle has length (x + 3) and width 5. Express its area.\n   - Solve: 2x + 8 = 20\n   - If tickets cost $x each and you buy 4, plus a $3 fee, write the total cost.\n\n3. **Challenge Questions (3 questions)**\n   - Solve: 3(x - 2) = 15\n   - Find x when 2x + 3 = x + 9\n   - A number increased by 7 equals twice the number decreased by 4. Find it.\n\n**Immediate Feedback:** Provide explanations for each answer\n\n---\n\n## Wrap-up & Homework (10 minutes)\n**Action Type:** Discussion\n**Difficulty:** Intermediate\n**Teaching Style:** Discussion\n\nLet's consolidate our learning through reflection and discussion.\n\n### Class Discussion Points:\n1. **Key Takeaways:** What was the most important concept you learned today?\n2. **Real-World Connections:** Share one way you might use algebra this week\n3. **Questions & Clarifications:** What aspects need more explanation?\n\n### Homework Assignment:\n1. **Practice Problems (10 problems)**\n   - 5 basic variable evaluation problems\n   - 3 equation-solving problems\n   - 2 word problems requiring algebraic translation\n\n2. **Reflection Journal:**\n   - Write a paragraph about how algebra relates to your favorite hobby or interest\n   - Identify three situations where variables appear in daily life\n\n3. **Extension Activity (Optional):**\n   - Research a famous mathematician who contributed to algebra\n   - Create your own word problem and swap with a classmate\n\n### Next Lesson Preview:\n- We'll explore graphing linear equations\n- Bring graph paper and colored pencils\n- Think about how x and y can work together\n\n---\n\n**Total Duration:** 60 minutes\n**Teaching Approach:** Progressive difficulty with mixed teaching styles\n**Materials Needed:** Slides, flashcards, quiz platform, notebooks"
}
```

## Step 3: Execute the Teacher Prompt (Consolidated Version)

After reviewing and potentially editing the sections, execute the consolidated prompt:

```bash
curl -X POST http://localhost:5000/api/execute-teacher-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "[THE COMPLETE CONSOLIDATED PROMPT FROM STEP 2]",
    "selectedFiles": ["4d0f1605-e103-4eca-8ecf-6415ef4a6f8b", "5e1f2716-f214-5fdb-9fde-7526fg5b7c9c"],
    "selectedFolders": ["4c0044f3-bbba-45d9-85fe-a2f9ea8510c6"]
  }'
```

Response:
```json
{
  "content": "Welcome to our algebra class! I'm excited to guide you through this fascinating journey into the world of algebraic thinking. Let me start by sharing why algebra is such a powerful tool...\n\n[Full teacher agent response with natural, conversational teaching style]",
  "usage": {
    "prompt_tokens": 2500,
    "completion_tokens": 1800,
    "total_tokens": 4300
  }
}
```

## Step 4: Chat with the Teacher Agent

Continue the conversation with context:

```bash
curl -X POST http://localhost:5000/api/chat-teacher-agent \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Can you explain the distributive property again with more examples?",
    "courseTitle": "Introduction to Algebra",
    "targetAudience": "High school students (ages 14-16)",
    "teachingStyle": "visual",
    "expertiseSubject": "mathematics",
    "conversationHistory": [
      {
        "role": "assistant",
        "content": "Welcome to our algebra class! I am excited to guide you..."
      },
      {
        "role": "user",
        "content": "Can you explain the distributive property again with more examples?"
      }
    ]
  }'
```

Response:
```json
{
  "response": "Of course! Let me break down the distributive property with visual examples that will make it crystal clear.\n\nImagine you're at a pizza party. The distributive property is like this: if 3 friends each want 2 slices of pepperoni AND 1 slice of cheese, you can calculate the total in two ways:\n\nMethod 1: 3 × (2 + 1) = 3 × 3 = 9 slices\nMethod 2: (3 × 2) + (3 × 1) = 6 + 3 = 9 slices\n\nBoth give the same answer! That's the distributive property: a(b + c) = ab + ac\n\n[More examples with visual descriptions...]"
}
```

## Step 5: Save the Teacher Chat Session

Save the entire session for later use:

```bash
curl -X POST http://localhost:5000/api/teacher-chat-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Algebra Basics - First Lesson",
    "courseTitle": "Introduction to Algebra",
    "targetAudience": "High school students (ages 14-16)",
    "teachingStyle": "visual",
    "expertiseSubject": "mathematics",
    "teacherPrompt": "[FULL PROMPT FROM STEP 2]",
    "teacherContent": "[GENERATED CONTENT FROM STEP 3]",
    "chatHistory": [
      {"role": "assistant", "content": "Welcome to our algebra class..."},
      {"role": "user", "content": "Can you explain the distributive property again?"},
      {"role": "assistant", "content": "Of course! Let me break down..."}
    ],
    "selectedFiles": ["4d0f1605-e103-4eca-8ecf-6415ef4a6f8b"],
    "selectedFolders": ["4c0044f3-bbba-45d9-85fe-a2f9ea8510c6"]
  }'
```

Response:
```json
{
  "id": "session-123-abc",
  "title": "Algebra Basics - First Lesson",
  "createdAt": "2025-08-21T10:30:00Z",
  "shareId": "share-xyz-789",
  "isPublic": 0
}
```

## Step 6: Create a Validation Report

Compare the actual chat session with the original parameters:

```bash
curl -X POST http://localhost:5000/api/validation-reports/validate \
  -H "Content-Type: application/json" \
  -d '{
    "reportTitle": "Algebra Lesson Validation - Aug 21",
    "sessionId": "session-123-abc",
    "originalParameters": {
      "courseTitle": "Introduction to Algebra",
      "targetAudience": "High school students (ages 14-16)",
      "teachingStyle": "visual",
      "expertiseSubject": "mathematics",
      "actionTypes": ["ppt", "flashcards", "ppt", "quiz", "discussion"],
      "durations": [5, 10, 20, 15, 10],
      "difficultyLevels": ["beginner", "beginner", "intermediate", "intermediate", "intermediate"]
    },
    "chatHistory": [
      {"role": "assistant", "content": "Welcome to our algebra class..."},
      {"role": "user", "content": "Can you explain the distributive property again?"},
      {"role": "assistant", "content": "Of course! Let me break down..."}
    ]
  }'
```

Response:
```json
{
  "id": "report-456-def",
  "reportTitle": "Algebra Lesson Validation - Aug 21",
  "complianceScore": 92.5,
  "deviations": [
    {
      "parameter": "teaching_style",
      "expected": "visual",
      "actual": "visual",
      "severity": "none",
      "impact": "Fully compliant"
    },
    {
      "parameter": "difficulty_progression",
      "expected": "beginner to intermediate",
      "actual": "maintained appropriately",
      "severity": "low",
      "impact": "Minor variation in complexity"
    }
  ],
  "createdAt": "2025-08-21T10:35:00Z"
}
```

## Step 7: Download Validation Report as PDF

```bash
curl -X GET http://localhost:5000/api/validation-reports/report-456-def/pdf \
  -o "algebra-validation-report.pdf"
```

This downloads a PDF report with:
- Compliance score visualization
- Detailed parameter comparison
- Deviation analysis
- Recommendations for improvement

## Complete Process Summary

1. **File Selection**: Choose relevant educational materials
2. **Configuration**: Set course title, audience, teaching style, expertise
3. **Generation**: AI creates structured 5-section lesson plan with:
   - Specific action types (PPT, flashcards, quiz, discussion)
   - Progressive difficulty levels (beginner → intermediate)
   - Varied teaching styles per section
   - Defined durations for time management
4. **Execution**: Transform plan into natural teacher dialogue
5. **Interaction**: Chat naturally with the teacher agent
6. **Validation**: Measure compliance between plan and execution
7. **Documentation**: Save sessions and generate PDF reports

## Key Configuration Parameters

### Teaching Styles
- `visual`: Use diagrams, charts, visual representations
- `storytelling`: Narrative approach with examples
- `hands-on`: Interactive activities and practice
- `discussion`: Socratic method, Q&A format
- `analytical`: Step-by-step logical breakdown

### Action Types
- `ppt`: PowerPoint presentation slides
- `audio`: Audio explanations
- `video`: Video content
- `flashcards`: Interactive memory cards
- `quiz`: Assessment questions
- `discussion`: Open dialogue

### Difficulty Levels
- `beginner`: Foundation concepts
- `intermediate`: Application and practice
- `advanced`: Complex problem-solving

### Expertise Subjects
- `mathematics`
- `science`
- `language-arts`
- `social-studies`
- `computer-science`
- `arts`
- `physical-education`
- `general`

## Testing the Complete Flow

You can test the entire workflow with this script:

```bash
#!/bin/bash

# 1. Get files
echo "Getting available files..."
FILES=$(curl -s http://localhost:5000/api/files)
echo "Files retrieved"

# 2. Generate teacher prompt
echo "Generating teacher prompt..."
PROMPT_RESPONSE=$(curl -s -X POST http://localhost:5000/api/generate-teacher-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "fileIds": [],
    "folderIds": [],
    "courseTitle": "Test Algebra Course",
    "targetAudience": "High school students",
    "additionalContext": "Focus on basics"
  }')
echo "Prompt generated"

# 3. Execute teacher
echo "Executing teacher agent..."
TEACHER_RESPONSE=$(curl -s -X POST http://localhost:5000/api/execute-teacher-prompt \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Test prompt\",
    \"selectedFiles\": [],
    \"selectedFolders\": []
  }")
echo "Teacher executed"

# 4. Create validation report
echo "Creating validation report..."
VALIDATION=$(curl -s -X POST http://localhost:5000/api/validation-reports/validate \
  -H "Content-Type: application/json" \
  -d '{
    "reportTitle": "Test Validation",
    "originalParameters": {
      "courseTitle": "Test Course",
      "teachingStyle": "visual",
      "difficultyLevels": ["beginner"]
    },
    "chatHistory": [
      {"role": "user", "content": "test"},
      {"role": "assistant", "content": "test response"}
    ]
  }')
echo "Validation complete"

echo "Full workflow test completed!"
```

This comprehensive example shows every step of the Master Teacher Agent system from file selection through validation report generation.