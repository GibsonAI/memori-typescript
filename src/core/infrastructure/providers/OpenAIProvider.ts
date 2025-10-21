import OpenAI from 'openai';
import { MemoryCapableProvider } from './MemoryCapableProvider';
import { IProviderConfig } from './IProviderConfig';
import { ProviderType } from './ProviderType';
import { ChatCompletionParams } from './types/ChatCompletionParams';
import { ChatCompletionResponse } from './types/ChatCompletionResponse';
import { EmbeddingParams } from './types/EmbeddingParams';
import { EmbeddingResponse } from './types/EmbeddingResponse';

/**
 * OpenAI provider implementation using memory-capable architecture.
 */
export class OpenAIProvider extends MemoryCapableProvider {
  private model: string;
  private client: OpenAI | null = null;

  constructor(config: IProviderConfig) {
    super(config);
    this.model = config.model || 'gpt-4o-mini';
  }

  /**
    * Initialize the OpenAI client
    */
   protected initializeClient(): void {
     // Handle dummy API key for Ollama
     const apiKey = this.config.apiKey === 'ollama-local' ? 'sk-dummy-key-for-ollama' : this.config.apiKey;

     this.client = new OpenAI({
       apiKey: apiKey,
       baseURL: this.config.baseUrl,
     });
   }

  /**
   * Dispose of the OpenAI client
   */
  protected async disposeClient(): Promise<void> {
    // OpenAI client doesn't require explicit disposal
    // But we can clear the reference if needed
    this.client = null;
  }

  /**
   * Check if the OpenAI client is healthy
   */
  protected async checkClientHealth(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    try {
      // Simple health check - try to list models
      await this.client.models.list();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get base diagnostics from the OpenAI client
   */
  protected async getBaseDiagnostics(): Promise<Record<string, any>> {
    return {
      baseUrl: this.config.baseUrl,
      hasApiKey: !!this.config.apiKey,
      clientInitialized: !!this.client,
    };
  }

  /**
   * Get the provider type (OpenAI or Ollama based on configuration)
   */
  getProviderType(): ProviderType {
    return this.config.apiKey === 'ollama-local' ||
            this.config.baseUrl?.includes('ollama') ||
            this.config.baseUrl?.includes('11434')
      ? ProviderType.OLLAMA
      : ProviderType.OPENAI;
  }

  /**
   * Get the current model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Get the OpenAI client (for backward compatibility)
   */
  getClient(): OpenAI {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }
    return this.client;
  }

  /**
   * Create a chat completion (core LLM functionality)
   */
  async createChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    // This method is implemented in the base class with integrated features
    // The base class handles caching, connection pooling, memory processing, etc.
    return super.createChatCompletion(params);
  }

  /**
   * Create an embedding (core LLM functionality)
   */
  async createEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse> {
    // This method is implemented in the base class with integrated features
    // The base class handles caching, connection pooling, memory processing, etc.
    return super.createEmbedding(params);
  }

  /**
   * Execute the actual OpenAI chat completion API call
   * This is called by the base class when not using cache/pooling optimizations
   */
  protected async executeChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await this.client.chat.completions.create({
      model: params.model || this.model,
      messages: params.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      top_p: params.top_p,
      frequency_penalty: params.frequency_penalty,
      presence_penalty: params.presence_penalty,
      stop: params.stop,
      stream: params.stream,
      ...params.options,
    });

    // Handle streaming vs non-streaming response
    if (params.stream && 'choices' in response === false) {
      // This is a stream - for now, we'll throw an error as streaming is not yet supported
      throw new Error('Streaming responses are not yet supported in this provider implementation');
    }

    // Non-streaming response
    const chatResponse = response as OpenAI.Chat.Completions.ChatCompletion;

    return {
      message: {
        role: chatResponse.choices[0].message.role || 'assistant',
        content: chatResponse.choices[0].message.content || '',
        function_call: chatResponse.choices[0].message.function_call ? {
          name: chatResponse.choices[0].message.function_call.name,
          arguments: chatResponse.choices[0].message.function_call.arguments,
        } : undefined,
        tool_calls: chatResponse.choices[0].message.tool_calls?.filter(toolCall =>
          toolCall.type === 'function'
        ).map(toolCall => ({
          id: toolCall.id,
          type: 'function' as const,
          function: {
            name: (toolCall as any).function?.name || '',
            arguments: (toolCall as any).function?.arguments || '',
          },
        })),
      },
      finish_reason: chatResponse.choices[0].finish_reason || 'stop',
      usage: chatResponse.usage ? {
        prompt_tokens: chatResponse.usage.prompt_tokens,
        completion_tokens: chatResponse.usage.completion_tokens,
        total_tokens: chatResponse.usage.total_tokens,
      } : undefined,
      id: chatResponse.id,
      model: chatResponse.model,
      created: chatResponse.created,
      metadata: {
        system_fingerprint: (chatResponse as any).system_fingerprint,
      },
    };
  }

  /**
   * Execute the actual OpenAI embedding API call
   * This is called by the base class when not using cache/pooling optimizations
   */
  protected async executeEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await this.client.embeddings.create({
      model: params.model || 'text-embedding-3-small',
      input: params.input,
      encoding_format: params.encoding_format as 'float' | 'base64',
      dimensions: params.dimensions,
      user: params.user,
      ...params.options,
    });

    return {
      data: response.data.map((item: any, index: number) => ({
        index,
        embedding: item.embedding,
        object: item.object,
      })),
      model: response.model,
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        total_tokens: response.usage.total_tokens,
      } : undefined,
      id: (response as any).id,
      created: (response as any).created,
      metadata: {},
    };
  }
}
