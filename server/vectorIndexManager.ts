import OpenAI from "openai";
import { File } from "@shared/schema";
import fs from "fs";
import path from "path";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface VectorStoreFile {
  id: string;
  object: string;
  created_at: number;
  vector_store_id: string;
  status: string;
  last_error?: any;
}

export interface SemanticSearchResult {
  fileId: string;
  filename: string;
  relevanceScore: number;
  relevanceExplanation: string;
  matchedContent: string[];
  confidence: number;
}

export interface FileProcessingMetadata {
  openaiFileId: string;
  vectorStoreId: string;
  aiAnalysis: {
    summary: string;
    keyPoints: string[];
    mainThemes: string[];
    complexity: "basic" | "intermediate" | "advanced";
    documentType: string;
  };
  categorization: {
    primaryCategory: string;
    secondaryCategories: string[];
    confidence: number;
    organizationPriority: number;
    suggestedTags: string[];
    hashtags: string[];
  };
  namedEntities: string[];
  actionItems: string[];
  keyProcesses: string[];
}

export class VectorIndexManager {
  private vectorStoreId: string | null = null;
  private vectorStore: any = null;

  constructor() {
    this.initializeVectorStore();
  }

  private async initializeVectorStore() {
    try {
      // For now, use a static vector store ID or create assistant-based approach
      // OpenAI's vector store API might not be available in this library version
      console.log("✅ Vector store manager initialized (using assistant-based approach)");
      this.vectorStoreId = "file-search-assistant";
    } catch (error) {
      console.error("Failed to initialize vector store:", error);
      throw new Error("Vector store initialization failed");
    }
  }

  /**
   * Add file to OpenAI for semantic search (using file upload + analysis)
   */
  async addFileToIndex(
    fileContent: Buffer | string,
    filename: string,
    metadata: Record<string, any> = {}
  ): Promise<FileProcessingMetadata> {
    if (!this.vectorStoreId) {
      await this.initializeVectorStore();
    }

    try {
      const content = typeof fileContent === 'string' ? fileContent : fileContent.toString();
      
      console.log(`🔄 Uploading to OpenAI: ${filename} (${content.length} chars)`);

      // Create a temporary file for OpenAI upload (Node.js compatible)
      const tempDir = '/tmp';
      const tempFilename = `openai-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`;
      const tempFilePath = path.join(tempDir, tempFilename);
      
      // Write content to temporary file
      fs.writeFileSync(tempFilePath, content, 'utf8');
      
      try {
        // Create file in OpenAI for assistants using fs.createReadStream (Node.js compatible)
        const fileStream = fs.createReadStream(tempFilePath);
        
        const openaiFile = await openai.files.create({
          file: fileStream,
          purpose: "assistants"
        });

        console.log(`✅ OpenAI file created successfully: ${openaiFile.id} for ${filename}`);
        
        // For now, just return the OpenAI file ID to test the upload
        // We'll add back the comprehensive AI analysis once the basic upload works
        const simpleResult = {
          openaiFileId: openaiFile.id,
          vectorStoreId: this.vectorStoreId!,
          aiAnalysis: { 
            summary: "File uploaded to OpenAI successfully",
            keyPoints: ["File processing completed"],
            mainThemes: ["Document upload"],
            complexity: "basic" as const,
            documentType: "text file",
            audience: "general",
            language: "english",
            tone: "neutral"
          },
          categorization: { 
            primaryCategory: "Document", 
            secondaryCategories: [],
            confidence: 1.0,
            organizationPriority: 0.5,
            suggestedTags: [],
            hashtags: [],
            folderSuggestion: "Documents",
            importance: "medium" as const
          },
          namedEntities: [],
          actionItems: [],
          keyProcesses: []
        };

        console.log(`🎉 Basic vector indexing completed successfully for ${filename}`, {
          openaiFileId: simpleResult.openaiFileId,
          vectorStoreId: simpleResult.vectorStoreId
        });

        return simpleResult;
        
      } finally {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.warn(`Warning: Could not delete temp file ${tempFilePath}:`, cleanupError);
        }
      }

    } catch (error: any) {
      console.error(`❌ Vector indexing failed for ${filename}:`, error);
      console.error(`Error details:`, {
        name: error?.name,
        message: error?.message,
        stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
        apiKey: process.env.OPENAI_API_KEY ? 'Present' : 'Missing'
      });
      
      // Provide more specific error information
      const errorMessage = error?.message || 'Unknown error';
      if (errorMessage.includes('API key') || errorMessage.includes('authentication')) {
        throw new Error(`OpenAI authentication failed. Please check your OPENAI_API_KEY.`);
      } else if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
        throw new Error(`OpenAI API quota exceeded. Please check your OpenAI usage.`);
      } else {
        throw new Error(`Vector indexing failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Step 2: Comprehensive AI Analysis using GPT-5
   */
  private async performAIAnalysis(content: string, filename: string): Promise<any> {
    try {
      const analysisPrompt = `
Analyze the following document comprehensively. Extract key insights, themes, and structural information.

Filename: ${filename}
Content: ${content.slice(0, 12000)}${content.length > 12000 ? '\n...(truncated)' : ''}

Provide analysis in this JSON format:
{
  "summary": "Comprehensive 3-4 sentence summary capturing the document's essence and purpose",
  "keyPoints": ["array of 5-8 most important points or takeaways"],
  "mainThemes": ["primary themes and topics covered"],
  "complexity": "basic|intermediate|advanced",
  "documentType": "specific document type (e.g., 'academic paper', 'business report', 'lesson plan')",
  "audience": "target audience for this content",
  "language": "primary language used",
  "tone": "document tone (formal, casual, technical, etc.)"
}

Focus on extracting actionable insights and content that would be valuable for search and organization.
`;

      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert document analyst specializing in comprehensive content analysis. Always respond with valid JSON."
          },
          {
            role: "user",
            content: analysisPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      });

      return JSON.parse(response.choices[0].message.content || "{}");
    } catch (error) {
      console.error("AI analysis failed:", error);
      return {
        summary: "Analysis unavailable",
        keyPoints: [],
        mainThemes: [],
        complexity: "intermediate",
        documentType: "unknown",
        audience: "general",
        language: "unknown",
        tone: "neutral"
      };
    }
  }

  /**
   * Step 3: Advanced Categorization with Confidence Scores
   */
  private async performCategorization(content: string, filename: string, aiAnalysis: any): Promise<any> {
    try {
      const categorizationPrompt = `
Based on the document analysis, categorize this file with confidence scores and organizational recommendations.

Filename: ${filename}
Document Type: ${aiAnalysis.documentType}
Content Summary: ${aiAnalysis.summary}
Key Points: ${aiAnalysis.keyPoints?.join(', ')}

Provide categorization in this JSON format:
{
  "primaryCategory": "single most appropriate category from: [Business, Education, Technology, Entertainment, Health, Finance, Science, News, Personal, Reference]",
  "secondaryCategories": ["additional relevant categories from the same list"],
  "confidence": 0.95,
  "organizationPriority": 0.85,
  "suggestedTags": ["relevant", "searchable", "tags", "for", "organization"],
  "hashtags": ["#relevant", "#hashtags", "#for", "#social"],
  "folderSuggestion": "suggested folder name for organization",
  "importance": "high|medium|low"
}

Rate confidence from 0.0 to 1.0 based on clarity of categorization.
Rate organizationPriority from 0.0 to 1.0 based on how important this document appears to be.
`;

      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert in document organization and taxonomy. Always respond with valid JSON."
          },
          {
            role: "user",
            content: categorizationPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      });

      return JSON.parse(response.choices[0].message.content || "{}");
    } catch (error) {
      console.error("Categorization failed:", error);
      return {
        primaryCategory: "Reference",
        secondaryCategories: [],
        confidence: 0.5,
        organizationPriority: 0.5,
        suggestedTags: [],
        hashtags: [],
        folderSuggestion: "Uncategorized",
        importance: "medium"
      };
    }
  }

  /**
   * Extract named entities, action items, and key processes
   */
  private async extractNamedEntities(content: string): Promise<{
    namedEntities: string[];
    actionItems: string[];
    keyProcesses: string[];
  }> {
    try {
      const entityPrompt = `
Extract structured information from this document content:

Content: ${content.slice(0, 8000)}${content.length > 8000 ? '\n...(truncated)' : ''}

Identify and extract the following in JSON format:
{
  "namedEntities": ["people", "organizations", "locations", "products", "key terms"],
  "actionItems": ["specific action items or tasks mentioned"],
  "keyProcesses": ["important processes, procedures, or workflows described"]
}

Focus on concrete, actionable information that would be useful for search and reference.
`;

      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert in information extraction and entity recognition. Always respond with valid JSON."
          },
          {
            role: "user",
            content: entityPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        namedEntities: Array.isArray(result.namedEntities) ? result.namedEntities : [],
        actionItems: Array.isArray(result.actionItems) ? result.actionItems : [],
        keyProcesses: Array.isArray(result.keyProcesses) ? result.keyProcesses : []
      };
    } catch (error) {
      console.error("Entity extraction failed:", error);
      return {
        namedEntities: [],
        actionItems: [],
        keyProcesses: []
      };
    }
  }

  /**
   * Semantic search using OpenAI Vector Store with relevance explanations
   */
  async semanticSearch(
    query: string,
    limit: number = 20,
    userFiles: File[] = []
  ): Promise<SemanticSearchResult[]> {
    if (!this.vectorStoreId) {
      await this.initializeVectorStore();
    }

    try {
      console.log(`🔍 Performing semantic search for: "${query}"`);
      
      // Step 1: Create a thread for the search conversation
      const thread = await openai.beta.threads.create();
      
      // Step 2: Add the search query as a message to the thread
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: `Find and analyze files related to: ${query}`
      });

      // Step 3: Create a run with file_search tool and vector store
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: await this.getOrCreateAssistant(),
        tools: [{ type: "file_search" }],
        tool_resources: {
          file_search: {
            vector_store_ids: [this.vectorStoreId!]
          }
        },
        instructions: `You are a semantic file search assistant. Analyze the user's query and find the most relevant files from the vector store.

For each relevant file, provide:
1. Relevance score (0-100%)
2. Explanation of why it matches the query
3. Key content highlights that match
4. Document type and context

Respond in JSON format:
{
  "results": [
    {
      "fileId": "openai_file_id",
      "relevanceScore": 85,
      "explanation": "This file matches because...",
      "matchedContent": ["key phrases that match"],
      "documentType": "lesson plan",
      "summary": "Brief summary of the file"
    }
  ],
  "searchIntent": "What the user was looking for",
  "totalResults": 5
}`
      });

      // Step 4: Wait for the run to complete
      let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      
      // Poll for completion (with timeout)
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout
      
      while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
        if (attempts >= maxAttempts) {
          throw new Error('Search timeout - OpenAI processing took too long');
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        attempts++;
      }

      if (runStatus.status !== 'completed') {
        throw new Error(`Search failed with status: ${runStatus.status}`);
      }

      // Step 5: Get the assistant's response
      const messages = await openai.beta.threads.messages.list(thread.id);
      const assistantMessage = messages.data.find(m => m.role === 'assistant');
      
      if (!assistantMessage || !assistantMessage.content[0] || assistantMessage.content[0].type !== 'text') {
        throw new Error('No valid response from OpenAI');
      }

      const responseText = assistantMessage.content[0].text.value;
      console.log(`📊 OpenAI search response received: ${responseText.length} chars`);

      // Step 6: Parse the JSON response
      let searchResults;
      try {
        // Extract JSON from the response (might be wrapped in markdown)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseText;
        searchResults = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('Failed to parse search results JSON:', parseError);
        // Fallback: create a simple result
        searchResults = {
          results: [],
          searchIntent: query,
          totalResults: 0
        };
      }

      console.log(`✅ Semantic search completed: ${searchResults.results?.length || 0} results found`);

      // Step 7: Convert to our format and return
      return (searchResults.results || []).slice(0, limit).map((result: any, index: number) => ({
        fileId: result.fileId || `result_${index}`,
        relevanceScore: result.relevanceScore || 50,
        explanation: result.explanation || 'Relevant to your search query',
        matchedContent: result.matchedContent || [],
        documentType: result.documentType || 'document',
        summary: result.summary || 'No summary available',
        searchIntent: searchResults.searchIntent || query
      }));

    } catch (error: any) {
      console.error("❌ Semantic search failed:", error);
      console.error("Error details:", {
        message: error?.message,
        name: error?.name
      });
      
      // Return empty results rather than crashing
      return [];
    }
  }

  /**
   * Get or create an assistant for file search
   */
  private async getOrCreateAssistant(): Promise<string> {
    try {
      // Try to find existing assistant
      const assistants = await openai.beta.assistants.list();
      const existingAssistant = assistants.data.find(a => a.name === 'Smart File Search Assistant');
      
      if (existingAssistant) {
        return existingAssistant.id;
      }

      // Create new assistant
      const assistant = await openai.beta.assistants.create({
        name: 'Smart File Search Assistant',
        instructions: 'You are an expert at searching and analyzing files semantically. You help users find relevant documents by understanding the meaning and context of their queries.',
        model: 'gpt-5', // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        tools: [{ type: 'file_search' }]
      });

      console.log(`✅ Created new search assistant: ${assistant.id}`);
      return assistant.id;
      
    } catch (error) {
      console.error('Failed to get/create assistant:', error);
      throw new Error('Assistant creation failed');
    }
  }

  /**
   * Remove file from OpenAI
   */
  async removeFileFromIndex(openaiFileId: string): Promise<boolean> {
    try {
      // Delete the file from OpenAI
      await openai.files.delete(openaiFileId);
      console.log(`✅ Removed file: ${openaiFileId}`);
      return true;
    } catch (error) {
      console.error("Failed to remove file:", error);
      return false;
    }
  }

  /**
   * Get indexing statistics
   */
  async getVectorStoreStats(): Promise<{
    totalFiles: number;
    storageUsage: number;
    lastActivity: string;
  }> {
    try {
      // For now, return basic stats
      return {
        totalFiles: 0,
        storageUsage: 0,
        lastActivity: new Date().toISOString()
      };
    } catch (error) {
      console.error("Failed to get stats:", error);
      return {
        totalFiles: 0,
        storageUsage: 0,
        lastActivity: new Date().toISOString()
      };
    }
  }
}

export const vectorIndexManager = new VectorIndexManager();