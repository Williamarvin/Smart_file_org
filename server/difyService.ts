import fetch from 'node-fetch';

export interface DifyConfig {
  baseUrl: string;
  apiKey: string;
}

export interface DifyMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface DifyCompletionOptions {
  inputs?: Record<string, any>;
  query: string;
  response_mode?: 'streaming' | 'blocking';
  conversation_id?: string;
  user?: string;
  files?: Array<{
    type: string;
    transfer_method: string;
    url?: string;
    upload_file_id?: string;
  }>;
}

export class DifyService {
  private config: DifyConfig | null = null;

  /**
   * Initialize Dify service with configuration
   */
  initialize(config: DifyConfig) {
    this.config = config;
    console.log('✓ Dify service initialized');
  }

  /**
   * Check if Dify service is configured
   */
  isConfigured(): boolean {
    return this.config !== null && !!this.config.apiKey && !!this.config.baseUrl;
  }

  /**
   * Get current configuration status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      baseUrl: this.config?.baseUrl || null
    };
  }

  /**
   * Send a chat completion request to Dify
   */
  async chatCompletion(options: DifyCompletionOptions): Promise<any> {
    if (!this.config) {
      throw new Error('Dify service not configured. Please provide API credentials.');
    }

    const url = `${this.config.baseUrl}/chat-messages`;
    
    try {
      // Use streaming mode for agent chat apps
      const requestBody = {
        ...options,
        response_mode: 'streaming' 
      };
      
      console.log('Sending to Dify:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Dify API error: ${response.status} - ${error}`);
      }

      // Handle streaming response for agent chat
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/event-stream')) {
        // Parse SSE stream
        const text = await response.text();
        const lines = text.split('\n');
        let fullAnswer = '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.answer) {
                fullAnswer += parsed.answer;
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
        
        return { answer: fullAnswer || 'No response generated' };
      } else {
        // Handle regular JSON response
        const data = await response.json();
        return data;
      }
    } catch (error: any) {
      console.error('Dify chat completion error:', error);
      throw new Error(`Failed to get Dify response: ${error.message}`);
    }
  }

  /**
   * Create a new conversation
   */
  async createConversation(name?: string): Promise<string> {
    if (!this.config) {
      throw new Error('Dify service not configured');
    }

    const url = `${this.config.baseUrl}/conversations`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: name || 'New Conversation' })
    });

    if (!response.ok) {
      throw new Error(`Failed to create conversation: ${response.statusText}`);
    }

    const data = await response.json();
    return data.conversation_id;
  }

  /**
   * Call a Dify workflow
   */
  async runWorkflow(workflowId: string, inputs: Record<string, any>, user?: string): Promise<any> {
    if (!this.config) {
      throw new Error('Dify service not configured');
    }

    const url = `${this.config.baseUrl}/workflows/run`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs,
          response_mode: 'blocking',
          user: user || 'default-user'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Dify workflow error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('Dify workflow error:', error);
      throw new Error(`Failed to run Dify workflow: ${error.message}`);
    }
  }

  /**
   * Get available MCP tools
   */
  async getMCPTools(): Promise<any[]> {
    if (!this.config) {
      throw new Error('Dify service not configured');
    }

    const url = `${this.config.baseUrl}/tools`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get MCP tools: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tools || [];
    } catch (error: any) {
      console.error('Failed to fetch MCP tools:', error);
      return [];
    }
  }

  /**
   * Convert chat format for compatibility with OpenAI-style API
   * Now with full MCP tool support
   */
  async chatWithFiles(
    messages: DifyMessage[], 
    fileContents: string[],
    systemPrompt?: string,
    enableMCP: boolean = true,
    userId?: string,
    conversationId?: string
  ): Promise<{ response: string; conversationId?: string }> {
    if (!this.config) {
      throw new Error('Dify service not configured');
    }

    // Combine file contents into context
    const context = fileContents.join('\n\n---\n\n');
    
    // Get the last user message as the query
    const lastMessage = messages[messages.length - 1];
    const query = lastMessage?.content || '';

    // Build inputs including context and previous messages
    const inputs: Record<string, any> = {};
    
    // Add required folder_file_materials field for Dify app
    inputs.folder_file_materials = context || '';
    
    // Only add context if we have file contents
    if (context && context.trim()) {
      inputs.context = context;
    }
    
    // Add chat history if present
    if (messages.length > 1) {
      inputs.chat_history = messages.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content
      }));
    }

    if (systemPrompt) {
      inputs.system_prompt = systemPrompt;
    }

    // For Dify agent chat apps, we need to ensure required fields exist
    // Ensure the system prompt overrides any internal Dify prompts
    const difyInputs = {
      folder_file_materials: inputs.folder_file_materials || 'No specific files selected for this conversation.',
      ai_tutor_prompt: systemPrompt || 'You are a helpful AI assistant. Answer directly without generating prompts.',
      system_prompt: systemPrompt || 'You are a helpful AI assistant. Answer directly without generating prompts.',
      instruction: systemPrompt, // Add instruction field to override Dify's internal prompts
      ...inputs
    };
    
    // Build completion options with conversation ID if provided
    const completionOptions: DifyCompletionOptions = {
      query,
      inputs: difyInputs,
      user: userId || 'default-user'
      // response_mode is now handled in chatCompletion method
    };
    
    // Add conversation_id if provided to maintain chat context
    // Don't add if it's null or "null" string
    if (conversationId && conversationId !== 'null' && conversationId !== 'undefined') {
      completionOptions.conversation_id = conversationId;
    }
    
    const result = await this.chatCompletion(completionOptions);

    // Handle MCP tool execution results if present
    if (result.mcp_tool_results) {
      console.log('MCP tools executed:', result.mcp_tool_results);
    }

    // Extract conversation ID from response for maintaining context
    const responseConversationId = result.conversation_id || conversationId;

    return {
      response: result.answer || result.text || '',
      conversationId: responseConversationId
    };
  }

  /**
   * Generate text-to-speech using Dify
   */
  async generateTextToSpeech(text: string, voice?: string): Promise<Buffer> {
    if (!this.config) {
      throw new Error('Dify service not configured');
    }

    const url = `${this.config.baseUrl}/audio/speech`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text.slice(0, 4096),
          voice: voice || 'alloy'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to generate speech: ${response.statusText}`);
      }

      const buffer = await response.buffer();
      return buffer;
    } catch (error: any) {
      console.error('Dify TTS error:', error);
      throw new Error(`Failed to generate speech: ${error.message}`);
    }
  }
}

// Create singleton instance
export const difyService = new DifyService();