import { ILLMProvider } from '../../../src/core/infrastructure/providers/ILLMProvider';
import { IProviderConfig } from '../../../src/core/infrastructure/providers/IProviderConfig';
import { ProviderType } from '../../../src/core/infrastructure/providers/ProviderType';
import { ChatCompletionParams } from '../../../src/core/infrastructure/providers/types/ChatCompletionParams';
import { ChatCompletionResponse } from '../../../src/core/infrastructure/providers/types/ChatCompletionResponse';
import { EmbeddingParams } from '../../../src/core/infrastructure/providers/types/EmbeddingParams';
import { EmbeddingResponse } from '../../../src/core/infrastructure/providers/types/EmbeddingResponse';
import { ProviderDiagnostics } from '../../../src/core/infrastructure/providers/types/ProviderDiagnostics';

/**
 * Mock configuration for OpenAI provider
 */
export interface MockOpenAIConfig extends IProviderConfig {
  mockResponse?: string;
  mockError?: boolean;
  mockDelay?: number;
  mockUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  mockFunctions?: Array<{
    name: string;
    description?: string;
    parameters?: any;
  }>;
  mockTools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: any;
    };
  }>;
}

/**
 * Mock OpenAI provider for testing
 * Implements the ILLMProvider interface with configurable mock responses
 */
export class MockOpenAIProvider implements ILLMProvider {
  private config: MockOpenAIConfig;
  private model: string;
  private isInitialized = false;

  constructor(config: MockOpenAIConfig) {
    this.config = config;
    this.model = config.model || 'gpt-4o-mini';
  }

  getProviderType(): ProviderType {
    return ProviderType.OPENAI;
  }

  getConfig(): IProviderConfig {
    return { ...this.config };
  }

  async initialize(config: IProviderConfig): Promise<void> {
    // Preserve existing mock configuration while updating with new config
    this.config = { ...this.config, ...config } as MockOpenAIConfig;
    this.model = config.model || 'gpt-4o-mini';
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
      providerType: ProviderType.OPENAI,
      isInitialized: this.isInitialized,
      isHealthy,
      model: this.model,
      metadata: {
        mock: true,
        mockResponse: this.config.mockResponse?.substring(0, 50) + '...',
        mockError: this.config.mockError,
        mockDelay: this.config.mockDelay,
        hasFunctions: !!this.config.mockFunctions?.length,
        hasTools: !!this.config.mockTools?.length,
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
      throw new Error('Mock OpenAI API error');
    }

    const responseContent = this.config.mockResponse || 'This is a mock response from OpenAI GPT.';

    // Handle function calling if configured
    if (this.config.mockFunctions?.length && Math.random() > 0.7) {
      const randomFunction = this.config.mockFunctions[Math.floor(Math.random() * this.config.mockFunctions.length)];

      return {
        message: {
          role: 'assistant',
          content: '',
          function_call: {
            name: randomFunction.name,
            arguments: JSON.stringify({
              parameter: 'mock_value',
              timestamp: new Date().toISOString(),
            }),
          },
        },
        finish_reason: 'function_call',
        usage: this.config.mockUsage || {
          prompt_tokens: 15,
          completion_tokens: 25,
          total_tokens: 40,
        },
        id: `mock-openai-${Date.now()}`,
        model: this.model,
        created: Date.now(),
        metadata: {
          mock: true,
          provider: 'openai',
          functionCalled: true,
        },
      };
    }

    // Handle tool calls if configured
    if (this.config.mockTools?.length && Math.random() > 0.8) {
      const randomTool = this.config.mockTools[Math.floor(Math.random() * this.config.mockTools.length)];

      return {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: `call_${Date.now()}`,
            type: 'function',
            function: {
              name: randomTool.function.name,
              arguments: JSON.stringify({
                parameter: 'mock_value',
                timestamp: new Date().toISOString(),
              }),
            },
          }],
        },
        finish_reason: 'tool_calls',
        usage: this.config.mockUsage || {
          prompt_tokens: 15,
          completion_tokens: 25,
          total_tokens: 40,
        },
        id: `mock-openai-${Date.now()}`,
        model: this.model,
        created: Date.now(),
        metadata: {
          mock: true,
          provider: 'openai',
          toolCalled: true,
        },
      };
    }

    return {
      message: {
        role: 'assistant',
        content: responseContent,
      },
      finish_reason: 'stop',
      usage: this.config.mockUsage || {
        prompt_tokens: 15,
        completion_tokens: 25,
        total_tokens: 40,
      },
      id: `mock-openai-${Date.now()}`,
      model: this.model,
      created: Date.now(),
      metadata: {
        mock: true,
        provider: 'openai',
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
      throw new Error('Mock OpenAI embeddings API error');
    }

    const inputText = Array.isArray(params.input) ? params.input[0] : params.input;
    const embeddingDimension = 1536; // Standard OpenAI embedding dimension
    const mockEmbedding = new Array(embeddingDimension).fill(0).map(() => Math.random() - 0.5);

    return {
      data: [{
        index: 0,
        embedding: mockEmbedding,
        object: 'embedding',
      }],
      model: params.model || 'text-embedding-3-small',
      usage: {
        prompt_tokens: Math.ceil(inputText.length / 4), // Rough token estimation
        total_tokens: Math.ceil(inputText.length / 4),
      },
      id: `mock-openai-embedding-${Date.now()}`,
      created: Date.now(),
      metadata: {
        mock: true,
        provider: 'openai',
      },
    };
  }

  getClient(): any {
    return {
      providerType: 'openai',
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

  /**
   * Set mock functions for testing function calling
   */
  setMockFunctions(functions: Array<{ name: string; description?: string; parameters?: any }>): void {
    this.config.mockFunctions = functions;
  }

  /**
   * Set mock tools for testing tool calling
   */
  setMockTools(tools: Array<{ type: 'function'; function: { name: string; description?: string; parameters?: any } }>): void {
    this.config.mockTools = tools;
  }
}