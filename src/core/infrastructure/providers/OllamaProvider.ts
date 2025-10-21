import { MemoryCapableProvider } from './MemoryCapableProvider';
import { IProviderConfig } from './IProviderConfig';
import { ProviderType } from './ProviderType';
import { ChatCompletionParams } from './types/ChatCompletionParams';
import { ChatCompletionResponse } from './types/ChatCompletionResponse';
import { EmbeddingParams } from './types/EmbeddingParams';
import { EmbeddingResponse } from './types/EmbeddingResponse';

/**
 * Ollama API types (based on Ollama REST API)
 */
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  format?: string;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_last_n?: number;
    repeat_penalty?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    mirostat?: number;
    mirostat_eta?: number;
    mirostat_tau?: number;
    num_ctx?: number;
    num_gqa?: number;
    num_gpu?: number;
    num_thread?: number;
    num_predict?: number;
    tfs_z?: number;
    typical_p?: number;
    seed?: number;
    stop?: string[];
  };
  stream?: boolean;
  keep_alive?: string | number;
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
  options?: {
    num_ctx?: number;
    num_gqa?: number;
    num_gpu?: number;
    num_thread?: number;
    numgqa?: number;
    numa?: boolean;
    numbatch?: number;
    numgpulayers?: number;
  };
  keep_alive?: string | number;
}

interface OllamaEmbeddingResponse {
  model: string;
  embeddings: number[][];
  total_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
}

/**
 * Ollama provider implementation using memory-capable architecture.
 */
export class OllamaProvider extends MemoryCapableProvider {
  private model: string;
  private baseUrl: string;

  constructor(config: IProviderConfig) {
    super(config);
    this.model = config.model || 'llama2:7b';
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  /**
   * Initialize the Ollama provider (no-op since we use HTTP requests)
   */
  protected initializeClient(): void {
    // Ollama uses HTTP requests, no client initialization needed
  }

  /**
   * Dispose of the Ollama provider (no-op since we use HTTP requests)
   */
  protected disposeClient(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Check if the Ollama service is healthy
   */
  protected checkClientHealth(): Promise<boolean> {
    try {
      // Check if Ollama service is running by listing local models
      return fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }).then(response => {
        if (response.ok) {
          return true;
        }
        // If tags endpoint fails, try the version endpoint
        return fetch(`${this.baseUrl}/api/version`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }).then(versionResponse => versionResponse.ok).catch(() => false);
      }).catch(() => false);
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  /**
   * Get base diagnostics for Ollama
   */
  protected getBaseDiagnostics(): Promise<Record<string, any>> {
    return Promise.resolve({
      baseUrl: this.baseUrl,
      hasApiKey: !!this.config.apiKey,
      apiKey: this.config.apiKey || 'ollama-local',
      localModel: true,
    });
  }

  getProviderType(): ProviderType {
    return ProviderType.OLLAMA;
  }

  getModel(): string {
    return this.model;
  }

  getClient(): any {
    return {
      providerType: 'ollama',
      model: this.model,
      baseUrl: this.baseUrl,
      local: true,
    };
  }

  /**
   * Execute the actual Ollama chat completion API call
   * This is called by the base class when not using cache/pooling optimizations
   */
  protected async executeChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    try {
      // Convert messages to Ollama format
      const ollamaMessages = this.convertToOllamaMessages(params.messages);

      const requestBody: any = {
        model: params.model || this.model,
        messages: ollamaMessages,
        temperature: params.temperature,
        top_p: params.top_p,
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty,
        max_tokens: params.max_tokens,
        stop: Array.isArray(params.stop) ? params.stop : params.stop ? [params.stop] : undefined,
        stream: params.stream || false,
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama API error: URL: ${this.baseUrl}/chat/completions ${response.status} - ${errorText}`);
      }

      const responseText = await response.text();

      if (!responseText.trim()) {
        throw new Error(`Ollama API returned empty response`);
      }

      const responseJson = JSON.parse(responseText);

      // Handle streaming response
      if (params.stream) {
        throw new Error('Streaming responses are not yet supported in this provider implementation');
      }

      // Ollama returns OpenAI-compatible format
      const choice = responseJson.choices?.[0];
      if (!choice || !choice.message) {
        throw new Error(`Invalid response format: ${responseText}`);
      }

      return {
        message: {
          role: choice.message.role as 'user' | 'assistant',
          content: choice.message.content,
        },
        finish_reason: choice.finish_reason || 'stop',
        usage: responseJson.usage ? {
          prompt_tokens: responseJson.usage.prompt_tokens || 0,
          completion_tokens: responseJson.usage.completion_tokens || 0,
          total_tokens: responseJson.usage.total_tokens || 0,
        } : undefined,
        id: responseJson.id || `ollama-${Date.now()}`,
        model: responseJson.model,
        created: responseJson.created,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Ollama API request failed: ${String(error)}`);
    }
  }

  /**
   * Execute the actual Ollama embedding API call
   * This is called by the base class when not using cache/pooling optimizations
   */
  protected async executeEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse> {
    try {
      const inputText = Array.isArray(params.input) ? params.input.join(' ') : params.input;

      const requestBody: OllamaEmbeddingRequest = {
        model: params.model || this.model,
        prompt: inputText,
        options: {},
      };

      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama embeddings API error: ${response.status} - ${errorText}`);
      }

      const ollamaResponse = await response.json() as OllamaEmbeddingResponse;

      return {
        data: ollamaResponse.embeddings.map((embedding, index) => ({
          index,
          embedding,
          object: 'embedding',
        })),
        model: ollamaResponse.model,
        usage: {
          prompt_tokens: 1, // Ollama doesn't provide token counts
          total_tokens: 1,
        },
        id: `ollama-embedding-${Date.now()}`,
        created: Date.now(),
        metadata: {
          total_duration: ollamaResponse.total_duration,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Ollama embeddings request failed: ${String(error)}`);
    }
  }

  /**
   * Convert standard messages to Ollama format
   */
  private convertToOllamaMessages(messages: ChatCompletionParams['messages']): OllamaMessage[] {
    return messages
      .filter(msg => msg.role !== 'function') // Ollama doesn't support function calls
      .map(msg => ({
        role: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));
  }
}
