import { generateTextToSpeech as openAITTS, getOpenAIClient } from './openai';
import { difyService } from './difyService';

export type AIProvider = 'openai' | 'dify';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIProviderConfig {
  provider: AIProvider;
  openai?: {
    apiKey: string;
  };
  dify?: {
    baseUrl: string;
    apiKey: string;
  };
}

class AIProviderService {
  private currentProvider: AIProvider = 'openai';
  private userProviderPreferences: Map<string, AIProvider> = new Map();

  /**
   * Set the default provider
   */
  setDefaultProvider(provider: AIProvider) {
    this.currentProvider = provider;
    console.log(`✓ Default AI provider set to: ${provider}`);
  }

  /**
   * Set user-specific provider preference
   */
  setUserProvider(userId: string, provider: AIProvider) {
    this.userProviderPreferences.set(userId, provider);
  }

  /**
   * Get provider for a specific user or default
   */
  getProvider(userId?: string): AIProvider {
    if (userId && this.userProviderPreferences.has(userId)) {
      return this.userProviderPreferences.get(userId)!;
    }
    return this.currentProvider;
  }

  /**
   * Initialize Dify configuration
   */
  initializeDify(config: { baseUrl: string; apiKey: string }) {
    difyService.initialize(config);
  }

  /**
   * Get provider status
   */
  getProviderStatus() {
    return {
      currentProvider: this.currentProvider,
      providers: {
        openai: {
          available: !!process.env.OPENAI_API_KEY,
          configured: true
        },
        dify: {
          available: difyService.isConfigured(),
          configured: difyService.isConfigured(),
          status: difyService.getStatus()
        }
      }
    };
  }

  /**
   * Chat with files using the selected provider
   */
  async chatWithFiles(
    messages: ChatMessage[],
    fileContents: string[],
    systemPrompt?: string,
    userId?: string
  ): Promise<string> {
    const provider = this.getProvider(userId);
    
    console.log(`Using ${provider} provider for chat`);

    if (provider === 'dify') {
      if (!difyService.isConfigured()) {
        throw new Error('Dify is not configured. Please provide API credentials or switch to OpenAI.');
      }
      
      return await difyService.chatWithFiles(
        messages,
        fileContents,
        systemPrompt,
        true, // Enable MCP by default
        userId
      );
    } else {
      // Use OpenAI directly with proper format
      const openai = getOpenAIClient();
      
      // Combine file contents into context
      const context = fileContents.length > 0 
        ? fileContents.join('\n\n---\n\n')
        : "No specific files selected. User is asking a general question.";
      
      // Build messages array for OpenAI
      const openAIMessages = [];
      
      // Add system message
      const systemContent = systemPrompt || `You are a helpful AI assistant that can answer questions about uploaded documents. 
You have access to the user's document content and can provide specific information, summaries, analysis, and insights.

When answering:
- Be concise but comprehensive
- Reference specific documents when relevant
- If no files are selected, provide general guidance about what the user can do
- If the question cannot be answered from the provided context, say so clearly
- Use a conversational, helpful tone

Available document context:
${context}`;
      
      openAIMessages.push({ role: 'system', content: systemContent });
      
      // Add conversation messages
      messages.forEach(msg => {
        openAIMessages.push({ 
          role: msg.role as 'user' | 'assistant' | 'system', 
          content: msg.content 
        });
      });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
        messages: openAIMessages,
        temperature: 0.7,
        max_tokens: 1000,
      });
      
      return response.choices[0].message.content || "I apologize, but I couldn't generate a response. Please try again.";
    }
  }

  /**
   * Generate text-to-speech using the selected provider
   */
  async generateTextToSpeech(
    text: string,
    voice: string = 'alloy',
    userId?: string
  ): Promise<Buffer> {
    const provider = this.getProvider(userId);
    
    console.log(`Using ${provider} provider for TTS`);

    if (provider === 'dify') {
      if (!difyService.isConfigured()) {
        throw new Error('Dify is not configured. Please provide API credentials or switch to OpenAI.');
      }
      
      return await difyService.generateTextToSpeech(text, voice);
    } else {
      // Default to OpenAI
      return await openAITTS(text, voice);
    }
  }

  /**
   * Run a Dify workflow (only available with Dify provider)
   */
  async runDifyWorkflow(
    workflowId: string,
    inputs: Record<string, any>,
    userId?: string
  ): Promise<any> {
    if (!difyService.isConfigured()) {
      throw new Error('Dify is not configured. Please provide API credentials.');
    }
    
    return await difyService.runWorkflow(workflowId, inputs, userId);
  }

  /**
   * Get available MCP tools from Dify
   */
  async getMCPTools(): Promise<any[]> {
    if (!difyService.isConfigured()) {
      return [];
    }
    
    return await difyService.getMCPTools();
  }

  /**
   * Execute MCP tool through Dify
   */
  async executeMCPTool(
    toolName: string,
    parameters: Record<string, any>,
    userId?: string
  ): Promise<any> {
    if (!difyService.isConfigured()) {
      throw new Error('Dify is not configured for MCP tool execution.');
    }

    // Execute the tool through Dify's MCP integration
    const result = await difyService.chatCompletion({
      query: `Execute tool: ${toolName}`,
      inputs: {
        tool: toolName,
        parameters
      },
      user: userId
    });

    return result;
  }
}

// Create singleton instance
export const aiProvider = new AIProviderService();