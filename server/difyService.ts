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
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...options,
          response_mode: options.response_mode || 'blocking'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Dify API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data;
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
   */
  async chatWithFiles(
    messages: DifyMessage[], 
    fileContents: string[],
    systemPrompt?: string
  ): Promise<string> {
    if (!this.config) {
      throw new Error('Dify service not configured');
    }

    // Combine file contents into context
    const context = fileContents.join('\n\n---\n\n');
    
    // Get the last user message as the query
    const lastMessage = messages[messages.length - 1];
    const query = lastMessage?.content || '';

    // Build inputs including context and previous messages
    const inputs: Record<string, any> = {
      context: context,
      chat_history: messages.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content
      }))
    };

    if (systemPrompt) {
      inputs.system_prompt = systemPrompt;
    }

    const result = await this.chatCompletion({
      query,
      inputs,
      response_mode: 'blocking'
    });

    return result.answer || result.text || '';
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