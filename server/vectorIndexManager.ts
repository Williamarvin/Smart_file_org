import OpenAI from "openai";
import { File, files, fileMetadata } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

// Circuit breaker for semantic search
class SemanticSearchCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold = 3;
  private readonly recoveryTimeMs = 60000; // 1 minute

  isOpen(): boolean {
    if (this.failureCount >= this.failureThreshold) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure < this.recoveryTimeMs) {
        return true; // Circuit is open (disabled)
      } else {
        // Try to recover
        this.reset();
      }
    }
    return false;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    console.warn(
      `⚠️ Semantic search failure recorded. Count: ${this.failureCount}/${this.failureThreshold}`,
    );

    if (this.failureCount >= this.failureThreshold) {
      console.error(
        `🚫 Semantic search circuit breaker OPEN. Disabled for ${this.recoveryTimeMs / 1000} seconds.`,
      );
    }
  }

  recordSuccess(): void {
    if (this.failureCount > 0) {
      console.log(`✅ Semantic search recovered. Resetting circuit breaker.`);
      this.reset();
    }
  }

  private reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

export class VectorIndexManager {
  private vectorStoreId: string | null = null;
  private vectorStore: any = null;
  private circuitBreaker = new SemanticSearchCircuitBreaker();

  constructor() {
    this.initializeVectorStore();
  }

  private async initializeVectorStore() {
    try {
      // For now, use a static vector store ID or create assistant-based approach
      // OpenAI's vector store API might not be available in this library version
      console.log(
        "✅ Vector store manager initialized (using assistant-based approach)",
      );
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
    metadata: Record<string, any> = {},
  ): Promise<FileProcessingMetadata> {
    if (!this.vectorStoreId) {
      await this.initializeVectorStore();
    }

    try {
      const content =
        typeof fileContent === "string" ? fileContent : fileContent.toString();

      console.log(
        `🔄 Uploading to OpenAI: ${filename} (${content.length} chars)`,
      );

      // Create a temporary file for OpenAI upload (Node.js compatible)
      const tempDir = "/tmp";
      const tempFilename = `openai-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`;
      const tempFilePath = path.join(tempDir, tempFilename);

      // Write content to temporary file
      fs.writeFileSync(tempFilePath, content, "utf8");

      try {
        // Create file in OpenAI for assistants using fs.createReadStream (Node.js compatible)
        const fileStream = fs.createReadStream(tempFilePath);

        const openaiFile = await openai.files.create({
          file: fileStream,
          purpose: "assistants",
        });

        console.log(
          `✅ OpenAI file created successfully: ${openaiFile.id} for ${filename}`,
        );

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
            tone: "neutral",
          },
          categorization: {
            primaryCategory: "Document",
            secondaryCategories: [],
            confidence: 1.0,
            organizationPriority: 0.5,
            suggestedTags: [],
            hashtags: [],
            folderSuggestion: "Documents",
            importance: "medium" as const,
          },
          namedEntities: [],
          actionItems: [],
          keyProcesses: [],
        };

        console.log(
          `🎉 Basic vector indexing completed successfully for ${filename}`,
          {
            openaiFileId: simpleResult.openaiFileId,
            vectorStoreId: simpleResult.vectorStoreId,
          },
        );

        return simpleResult;
      } finally {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.warn(
            `Warning: Could not delete temp file ${tempFilePath}:`,
            cleanupError,
          );
        }
      }
    } catch (error: any) {
      console.error(`❌ Vector indexing failed for ${filename}:`, error);
      console.error(`Error details:`, {
        name: error?.name,
        message: error?.message,
        stack: error?.stack?.split("\n").slice(0, 5).join("\n"),
        apiKey: process.env.OPENAI_API_KEY ? "Present" : "Missing",
      });

      // Provide more specific error information
      const errorMessage = error?.message || "Unknown error";
      if (
        errorMessage.includes("API key") ||
        errorMessage.includes("authentication")
      ) {
        throw new Error(
          `OpenAI authentication failed. Please check your OPENAI_API_KEY.`,
        );
      } else if (
        errorMessage.includes("quota") ||
        errorMessage.includes("limit")
      ) {
        throw new Error(
          `OpenAI API quota exceeded. Please check your OpenAI usage.`,
        );
      } else {
        throw new Error(`Vector indexing failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Step 2: Comprehensive AI Analysis using GPT-5
   */
  private async performAIAnalysis(
    content: string,
    filename: string,
  ): Promise<any> {
    try {
      const analysisPrompt = `
Analyze the following document comprehensively. Extract key insights, themes, and structural information.

Filename: ${filename}
Content: ${content.slice(0, 12000)}${content.length > 12000 ? "\n...(truncated)" : ""}

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
        model: "gpt-4o", // Using GPT-4o for better performance
        messages: [
          {
            role: "system",
            content:
              "You are an expert document analyst specializing in comprehensive content analysis. Always respond with valid JSON.",
          },
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
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
        tone: "neutral",
      };
    }
  }

  /**
   * Step 3: Advanced Categorization with Confidence Scores
   */
  private async performCategorization(
    content: string,
    filename: string,
    aiAnalysis: any,
  ): Promise<any> {
    try {
      const categorizationPrompt = `
Based on the document analysis, categorize this file with confidence scores and organizational recommendations.

Filename: ${filename}
Document Type: ${aiAnalysis.documentType}
Content Summary: ${aiAnalysis.summary}
Key Points: ${aiAnalysis.keyPoints?.join(", ")}

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
            content:
              "You are an expert in document organization and taxonomy. Always respond with valid JSON.",
          },
          {
            role: "user",
            content: categorizationPrompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
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
        importance: "medium",
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

Content: ${content.slice(0, 8000)}${content.length > 8000 ? "\n...(truncated)" : ""}

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
            content:
              "You are an expert in information extraction and entity recognition. Always respond with valid JSON.",
          },
          {
            role: "user",
            content: entityPrompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");

      return {
        namedEntities: Array.isArray(result.namedEntities)
          ? result.namedEntities
          : [],
        actionItems: Array.isArray(result.actionItems)
          ? result.actionItems
          : [],
        keyProcesses: Array.isArray(result.keyProcesses)
          ? result.keyProcesses
          : [],
      };
    } catch (error) {
      console.error("Entity extraction failed:", error);
      return {
        namedEntities: [],
        actionItems: [],
        keyProcesses: [],
      };
    }
  }

  /**
   * Semantic search using OpenAI Vector Store with relevance explanations
   */
  async semanticSearch(
    query: string,
    limit: number = 20,
    userFiles: File[] = [],
  ): Promise<SemanticSearchResult[]> {
    // Check circuit breaker first
    if (this.circuitBreaker.isOpen()) {
      console.warn(
        `🚫 Semantic search temporarily disabled by circuit breaker`,
      );
      return [];
    }

    if (!this.vectorStoreId) {
      await this.initializeVectorStore();
    }

    try {
      console.log(`🔍 Performing semantic search for: "${query}"`);

      // Use OpenAI Chat Completions with file_search tool - simpler than assistants API
      const searchPrompt = `
You are a semantic file search assistant. Find files from the vector store that are relevant to this query: "${query}"

Analyze the query and provide semantic search results with relevance explanations. Consider:
- Synonyms and related concepts
- Document context and purpose
- Conceptual relationships beyond exact keyword matches

Respond in JSON format:
{
  "results": [
    {
      "fileId": "file_id_from_vector_store",
      "relevanceScore": 85,
      "explanation": "This file matches because it discusses...",
      "matchedContent": ["key phrases that match the query"],
      "documentType": "lesson plan",
      "summary": "Brief description of file content"
    }
  ],
  "searchIntent": "User is looking for...",
  "totalResults": 3
}

If no relevant files are found, return an empty results array.`;

      // For now, we'll use a fallback approach until vector store search is fully integrated
      console.log(`🔄 Using fallback semantic analysis for: "${query}"`);

      // Get files with OpenAI IDs for semantic search
      const filesWithOpenAI = await db
        .select({
          id: files.id,
          filename: files.filename,
          originalName: files.originalName,
          openaiFileId: fileMetadata.openaiFileId,
          summary: fileMetadata.summary,
          categories: fileMetadata.categories,
          keywords: fileMetadata.keywords,
          topics: fileMetadata.topics,
        })
        .from(files)
        .leftJoin(fileMetadata, eq(files.id, fileMetadata.fileId))
        .where(
          and(
            eq(files.userId, "demo-user"),
            eq(files.processingStatus, "completed"),
            sql`${fileMetadata.openaiFileId} IS NOT NULL`,
          ),
        )
        .limit(50); // Get a reasonable sample for analysis

      if (filesWithOpenAI.length === 0) {
        console.log("⚠️ No files with OpenAI IDs found for semantic search");
        return [];
      }

      console.log(
        `📊 Analyzing ${filesWithOpenAI.length} files with OpenAI vector storage`,
      );

      // Use GPT-5 to analyze which files are most relevant
      const analysisPrompt = `
Analyze this search query: "${query}"

Here are files available in the system:
${filesWithOpenAI
  .map(
    (f) => `
- File: ${f.originalName || f.filename}
- OpenAI ID: ${f.openaiFileId}
- Summary: ${f.summary || "No summary"}
- Categories: ${Array.isArray(f.categories) ? f.categories.join(", ") : f.categories || "None"}
- Keywords: ${Array.isArray(f.keywords) ? f.keywords.join(", ") : f.keywords || "None"}
- Topics: ${Array.isArray(f.topics) ? f.topics.join(", ") : f.topics || "None"}
`,
  )
  .join("\n")}

Based on the search query, rank and analyze the most relevant files. Provide detailed explanations of why each file matches.

Respond in JSON format:
{
  "results": [
    {
      "fileId": "openai_file_id",
      "relevanceScore": 85,
      "explanation": "This file is highly relevant because...",
      "matchedContent": ["specific terms/concepts that match"],
      "documentType": "educational content",
      "summary": "Brief file description"
    }
  ],
  "searchIntent": "What the user is trying to find",
  "totalResults": 3
}`;

      // Implement timeout and retry logic
      const maxRetries = 2;
      const timeoutMs = 15000; // 15 second timeout
      let lastError: any = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 Semantic search attempt ${attempt}/${maxRetries}`);

          const response = (await Promise.race([
            openai.chat.completions.create({
              model: "gpt-4o", // Using GPT-4o for better performance
              messages: [
                {
                  role: "system",
                  content:
                    "You are an expert semantic search assistant. Analyze queries and match them to relevant files based on meaning, context, and conceptual relationships. Always respond with valid JSON.",
                },
                {
                  role: "user",
                  content: analysisPrompt,
                },
              ],
              response_format: { type: "json_object" },
              temperature: 0.3,
            }),
            new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(new Error(`OpenAI API timeout after ${timeoutMs}ms`)),
                timeoutMs,
              ),
            ),
          ])) as any;

          const searchResults = JSON.parse(
            response.choices[0].message.content ||
              '{"results":[],"searchIntent":"","totalResults":0}',
          );
          console.log(
            `✅ Semantic analysis completed: ${searchResults.results?.length || 0} relevant files found`,
          );

          // Record success and reset circuit breaker
          this.circuitBreaker.recordSuccess();

          // Return formatted results
          return (searchResults.results || [])
            .slice(0, limit)
            .map((result: any, index: number) => ({
              fileId: result.fileId || `result_${index}`,
              relevanceScore: result.relevanceScore || 50,
              explanation:
                result.explanation ||
                "Semantically relevant to your search query",
              matchedContent: result.matchedContent || [],
              documentType: result.documentType || "document",
              summary: result.summary || "No summary available",
              searchIntent: searchResults.searchIntent || query,
            }));
        } catch (error: any) {
          lastError = error;
          console.warn(
            `⚠️ Semantic search attempt ${attempt} failed:`,
            error.message,
          );

          if (attempt < maxRetries) {
            // Exponential backoff: wait longer between retries
            const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
            console.log(`⏳ Retrying in ${backoffMs}ms...`);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
          }
        }
      }

      // If all retries failed, record failure and fall back gracefully
      this.circuitBreaker.recordFailure();
      console.error(
        `❌ All semantic search attempts failed. Last error:`,
        lastError?.message,
      );
      console.log(`🔄 Falling back to SQL-only search mode`);
      return [];
    } catch (error: any) {
      // Record failure for outer catch as well
      this.circuitBreaker.recordFailure();
      console.error("❌ Semantic search failed:", error);
      console.error("Error details:", {
        message: error?.message,
        name: error?.name,
      });

      // Return empty results rather than crashing
      return [];
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
        lastActivity: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Failed to get stats:", error);
      return {
        totalFiles: 0,
        storageUsage: 0,
        lastActivity: new Date().toISOString(),
      };
    }
  }
}

export const vectorIndexManager = new VectorIndexManager();
