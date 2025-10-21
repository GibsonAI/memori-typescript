import { ILLMProvider } from '../../../src/core/infrastructure/providers/ILLMProvider';
import { IProviderConfig } from '../../../src/core/infrastructure/providers/IProviderConfig';
import { ProviderType } from '../../../src/core/infrastructure/providers/ProviderType';
import { ChatCompletionParams } from '../../../src/core/infrastructure/providers/types/ChatCompletionParams';
import { ChatCompletionResponse } from '../../../src/core/infrastructure/providers/types/ChatCompletionResponse';
import { EmbeddingParams } from '../../../src/core/infrastructure/providers/types/EmbeddingParams';
import { EmbeddingResponse } from '../../../src/core/infrastructure/providers/types/EmbeddingResponse';
import { ProviderDiagnostics } from '../../../src/core/infrastructure/providers/types/ProviderDiagnostics';

/**
 * Mock configuration for Anthropic provider
 */
export interface MockAnthropicConfig extends IProviderConfig {
  mockResponse?: string;
  mockError?: boolean;
  mockDelay?: number;
  mockUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Mock Anthropic provider for testing
 * Implements the ILLMProvider interface with configurable mock responses
 */
export class MockAnthropicProvider implements ILLMProvider {
  private config: MockAnthropicConfig;
  private model: string;
  private isInitialized = false;

  constructor(config: MockAnthropicConfig) {
    this.config = config;
    this.model = config.model || 'claude-3-5-sonnet-20241022';
  }

  getProviderType(): ProviderType {
    return ProviderType.ANTHROPIC;
  }

  getConfig(): IProviderConfig {
    return { ...this.config };
  }

  async initialize(config: IProviderConfig): Promise<void> {
    // Preserve existing mock configuration while updating with new config
    this.config = { ...this.config, ...config } as MockAnthropicConfig;
    this.model = config.model || 'claude-3-5-sonnet-20241022';
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
      providerType: ProviderType.ANTHROPIC,
      isInitialized: this.isInitialized,
      isHealthy,
      model: this.model,
      metadata: {
        mock: true,
        mockResponse: this.config.mockResponse?.substring(0, 50) + '...',
        mockError: this.config.mockError,
        mockDelay: this.config.mockDelay,
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
      throw new Error('Mock Anthropic API error');
    }

    const responseContent = this.config.mockResponse || 'This is a mock response from Anthropic Claude.';

    return {
      message: {
        role: 'assistant',
        content: responseContent,
      },
      finish_reason: 'stop',
      usage: this.config.mockUsage || {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      id: `mock-anthropic-${Date.now()}`,
      model: this.model,
      created: Date.now(),
      metadata: {
        mock: true,
        provider: 'anthropic',
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
      throw new Error('Mock Anthropic embeddings API error');
    }

    const inputText = Array.isArray(params.input) ? params.input[0] : params.input;
    const embeddingDimension = 1536; // Standard embedding dimension
    const mockEmbedding = new Array(embeddingDimension).fill(0).map(() => Math.random() - 0.5);

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
      id: `mock-anthropic-embedding-${Date.now()}`,
      created: Date.now(),
      metadata: {
        mock: true,
        provider: 'anthropic',
      },
    };
  }

  getClient(): any {
    return {
      providerType: 'anthropic',
      model: this.model,
      mock: true,
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
}