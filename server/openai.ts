import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key" 
});

export interface FileMetadataResult {
  summary: string;
  keywords: string[];
  topics: string[];
  categories: string[];
  confidence: number;
}

export async function extractFileMetadata(text: string, filename: string): Promise<FileMetadataResult> {
  try {
    const prompt = `
You are an expert document analyzer. Analyze the following document content and extract comprehensive metadata.

Document filename: ${filename}
Document content: ${text.slice(0, 8000)} ${text.length > 8000 ? '...(truncated)' : ''}

Please provide a detailed analysis in the following JSON format:
{
  "summary": "A comprehensive 2-3 sentence summary of the document's main content and purpose",
  "keywords": ["array", "of", "relevant", "keywords", "and", "key", "phrases"],
  "topics": ["main", "topics", "covered", "in", "the", "document"],
  "categories": ["document", "type", "categories", "like", "research", "business", "technical"],
  "confidence": 0.95
}

Requirements:
- Summary: Write a clear, informative summary that captures the essence of the document
- Keywords: Extract 5-15 relevant keywords and key phrases that someone might search for
- Topics: Identify 3-8 main topics or themes covered
- Categories: Classify into 2-5 broad categories (e.g., personal/life, academics, business, technical, legal, educational, health, finance, entertainment, work, etc.)
- Confidence: Rate your confidence in the analysis from 0.0 to 1.0

Focus on extracting metadata that would be useful for similarity search and content discovery.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert document analyzer specializing in metadata extraction for search and discovery systems. Always respond with valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      summary: result.summary || "No summary available",
      keywords: Array.isArray(result.keywords) ? result.keywords : [],
      topics: Array.isArray(result.topics) ? result.topics : [],
      categories: Array.isArray(result.categories) ? result.categories : [],
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
    };
  } catch (error: any) {
    console.error("Failed to extract metadata with GPT:", error);
    throw new Error("Failed to analyze document content: " + (error?.message || "Unknown error"));
  }
}

export async function generateSearchEmbedding(query: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    return response.data[0].embedding;
  } catch (error: any) {
    console.error("Failed to generate search embedding:", error);
    throw new Error("Failed to generate search embedding: " + (error?.message || "Unknown error"));
  }
}

export async function generateContentEmbedding(content: string): Promise<number[]> {
  try {
    // Truncate content to fit within token limits
    const truncatedContent = content.slice(0, 6000);
    
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: truncatedContent,
    });

    return response.data[0].embedding;
  } catch (error: any) {
    console.error("Failed to generate content embedding:", error);
    throw new Error("Failed to generate content embedding: " + (error?.message || "Unknown error"));
  }
}

export async function findSimilarContent(query: string, existingMetadata: Array<{ summary: string; keywords: string[]; topics: string[] }>): Promise<number[]> {
  try {
    const prompt = `
Based on the search query "${query}", rank the following documents by similarity from most to least similar.
Return an array of indices (0-based) in order of similarity.

Documents:
${existingMetadata.map((meta, index) => `${index}: ${meta.summary} | Keywords: ${meta.keywords.join(', ')} | Topics: ${meta.topics.join(', ')}`).join('\n')}

Respond with only a JSON array of indices, e.g., [2, 0, 1, 3] where the first number is the most similar document.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a similarity ranking expert. Analyze semantic similarity between queries and documents. Respond only with a JSON array of indices.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"indices": []}');
    return Array.isArray(result.indices) ? result.indices : (Array.isArray(result) ? result : []);
  } catch (error) {
    console.error("Failed to find similar content:", error);
    return [];
  }
}
