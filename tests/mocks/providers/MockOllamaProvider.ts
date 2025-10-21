import { ILLMProvider } from '../../../src/core/infrastructure/providers/ILLMProvider';
import { IProviderConfig } from '../../../src/core/infrastructure/providers/IProviderConfig';
import { ProviderType } from '../../../src/core/infrastructure/providers/ProviderType';
import { ChatCompletionParams } from '../../../src/core/infrastructure/providers/types/ChatCompletionParams';
import { ChatCompletionResponse } from '../../../src/core/infrastructure/providers/types/ChatCompletionResponse';
import { EmbeddingParams } from '../../../src/core/infrastructure/providers/types/EmbeddingParams';
import { EmbeddingResponse } from '../../../src/core/infrastructure/providers/types/EmbeddingResponse';
import { ProviderDiagnostics } from '../../../src/core/infrastructure/providers/types/ProviderDiagnostics';

/**
 * Mock configuration for Ollama provider
 */
export interface MockOllamaConfig extends IProviderConfig {
  mockResponse?: string;
  mockError?: boolean;
  mockDelay?: number;
  mockUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  mockEmbedding?: number[];
}

/**
 * Mock Ollama provider for testing
 * Implements the ILLMProvider interface with configurable mock responses
 */
export class MockOllamaProvider implements ILLMProvider {
  private config: MockOllamaConfig;
  private model: string;
  private isInitialized = false;

  constructor(config: MockOllamaConfig) {
    this.config = config;
    this.model = config.model || 'llama2:7b';
  }

  getProviderType(): ProviderType {
    return ProviderType.OLLAMA;
  }

  getConfig(): IProviderConfig {
    return { ...this.config };
  }

  async initialize(config: IProviderConfig): Promise<void> {
    // Preserve existing mock configuration while updating with new config
    this.config = { ...this.config, ...config } as MockOllamaConfig;
    this.model = config.model || 'llama2:7b';
    this.isInitialized = true;
  }

  async dispose(): Promise<void> {
    this.isInitialized = false;
  }

  async isHealthy(): Promise<boolean> {
    return this.isInitialized && !this.config.mockError;
  }

  async getDiagnostics(): Promise<ProviderDiagnostics> {
    const isHealthy = await this.isHealthy();

    return {
      providerType: ProviderType.OLLAMA,
      isInitialized: this.isInitialized,
      isHealthy,
      model: this.model,
      metadata: {
        mock: true,
        mockResponse: this.config.mockResponse?.substring(0, 50) + '...',
        mockError: this.config.mockError,
        mockDelay: this.config.mockDelay,
        localModel: true,
      },
      timestamp: new Date(),
    };
  }

  getModel(): string {
    return this.model;
  }

  async createChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    if (!this.isInitialized) {
      throw new Error('Provider not initialized');
    }

    // Simulate network delay if configured
    if (this.config.mockDelay) {
      await new Promise(resolve => setTimeout(resolve, this.config.mockDelay));
    }

    // Simulate error if configured
    if (this.config.mockError) {
      throw new Error('Mock Ollama API error');
    }

    const responseContent = this.config.mockResponse || 'This is a mock response from Ollama. Running locally!';

    return {
      message: {
        role: 'assistant',
        content: responseContent,
      },
      finish_reason: 'stop',
      usage: this.config.mockUsage || {
        prompt_tokens: 8,
        completion_tokens: 15,
        total_tokens: 23,
      },
      id: `mock-ollama-${Date.now()}`,
      model: this.model,
      created: Date.now(),
      metadata: {
        mock: true,
        provider: 'ollama',
        local: true,
        total_duration: 150000000, // 150ms in nanoseconds
      },
    };
  }

  async createEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse> {
    if (!this.isInitialized) {
      throw new Error('Provider not initialized');
    }

    // Simulate network delay if configured
    if (this.config.mockDelay) {
      await new Promise(resolve => setTimeout(resolve, this.config.mockDelay));
    }

    // Simulate error if configured
    if (this.config.mockError) {
      throw new Error('Mock Ollama embeddings API error');
    }

    const inputText = Array.isArray(params.input) ? params.input[0] : params.input;
    const embeddingDimension = 4096; // Standard embedding dimension for many models
    const mockEmbedding = this.config.mockEmbedding || new Array(embeddingDimension).fill(0).map(() => Math.random() - 0.5);

    return {
      data: [{
        index: 0,
        embedding: mockEmbedding,
        object: 'embedding',
      }],
      model: this.model,
      usage: {
        prompt_tokens: Math.ceil(inputText.length / 4), // Rough token estimation
        total_tokens: Math.ceil(inputText.length / 4),
      },
      id: `mock-ollama-embedding-${Date.now()}`,
      created: Date.now(),
      metadata: {
        mock: true,
        provider: 'ollama',
        local: true,
        total_duration: 75000000, // 75ms in nanoseconds
      },
    };
  }

  getClient(): any {
    return {
      providerType: 'ollama',
      model: this.model,
      mock: true,
      local: true,
    };
  }

  /**
   * Set mock response for testing
   */
  setMockResponse(response: string): void {
    this.config.mockResponse = response;
  }

  /**
   * Set mock error state for testing
   */
  setMockError(error: boolean): void {
    this.config.mockError = error;
  }

  /**
   * Set mock delay for testing
   */
  setMockDelay(delay: number): void {
    this.config.mockDelay = delay;
  }

  /**
   * Set mock embedding vector for testing
   */
  setMockEmbedding(embedding: number[]): void {
    this.config.mockEmbedding = embedding;
  }
}