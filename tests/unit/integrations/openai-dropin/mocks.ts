// Comprehensive mock implementations for OpenAI drop-in testing
// Provides mock OpenAI client, Memori instances, and streaming responses

import type OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  EmbeddingCreateParams,
  CreateEmbeddingResponse,
  ChatCompletionMessageParam,
} from '../../../../src/integrations/openai-dropin/types';
import type { MemoryProcessingParams, MemorySearchResult } from '../../../../src/core/types/models';
import type { MemoryClassification, MemoryImportanceLevel } from '../../../../src/core/types/schemas';

/**
 * Mock OpenAI client for testing
 */
export class MockOpenAIClient {
  private chatCompletions: ChatCompletion[] = [];
  private embeddingResponses: CreateEmbeddingResponse[] = [];
  private shouldFail: boolean = false;
  private failMessage: string = 'Mock failure';
  private delayMs: number = 0;
  private callHistory: Array<{ method: string; params: any; timestamp: number }> = [];

  constructor(options?: {
    shouldFail?: boolean;
    failMessage?: string;
    delayMs?: number;
    mockResponses?: {
      chatCompletions?: ChatCompletion[];
      embeddings?: CreateEmbeddingResponse[];
    };
  }) {
    this.shouldFail = options?.shouldFail || false;
    this.failMessage = options?.failMessage || 'Mock failure';
    this.delayMs = options?.delayMs || 0;

    if (options?.mockResponses) {
      this.chatCompletions = options.mockResponses.chatCompletions || [];
      this.embeddingResponses = options.mockResponses.embeddings || [];
    }
  }

  get chat(): OpenAI.Chat {
    return {
      completions: {
        create: this.createChatCompletion.bind(this),
      },
    } as OpenAI.Chat;
  }

  get embeddings(): OpenAI.Embeddings {
    return {
      create: this.createEmbedding.bind(this),
    } as OpenAI.Embeddings;
  }

  private async createChatCompletion(
    params: ChatCompletionCreateParams,
    _options?: OpenAI.RequestOptions,
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    this.callHistory.push({
      method: 'chat.completions.create',
      params,
      timestamp: Date.now(),
    });

    if (this.shouldFail) {
      throw new Error(this.failMessage);
    }

    await this.delay();

    // Return streaming response if requested
    if (params.stream) {
      return this.createMockStreamingResponse(params);
    }

    // Return regular response
    const mockResponse = this.createMockChatCompletion(params);
    this.chatCompletions.push(mockResponse);
    return mockResponse;
  }

  private async createEmbedding(
    params: EmbeddingCreateParams,
    _options?: OpenAI.RequestOptions,
  ): Promise<CreateEmbeddingResponse> {
    this.callHistory.push({
      method: 'embeddings.create',
      params,
      timestamp: Date.now(),
    });

    if (this.shouldFail) {
      throw new Error(this.failMessage);
    }

    await this.delay();

    const mockResponse = this.createMockEmbeddingResponse(params);
    this.embeddingResponses.push(mockResponse);
    return mockResponse;
  }

  private createMockChatCompletion(params: ChatCompletionCreateParams): ChatCompletion {
    const model = params.model || 'gpt-4o-mini';
    const content = this.generateMockResponse(params.messages);

    return {
      id: `chatcmpl-${uuidv4()}`,
      object: 'chat.completion',
      created: Date.now(),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
            refusal: null,
          },
          logprobs: null,
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: this.calculatePromptTokens(params.messages),
        completion_tokens: content.length / 4, // Rough estimate
        total_tokens: 0, // Will be calculated below
      },
    };
  }

  private createMockStreamingResponse(params: ChatCompletionCreateParams): AsyncIterable<ChatCompletionChunk> {
    const content = this.generateMockResponse(params.messages);
    const chunks = this.splitIntoChunks(content, 3); // Split into 3 chunks

    return {
      [Symbol.asyncIterator]: () => {
        let index = 0;
        return {
          next: async () => {
            if (index < chunks.length) {
              const chunk: ChatCompletionChunk = {
                id: `chatcmpl-${uuidv4()}`,
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: params.model || 'gpt-4o-mini',
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: chunks[index],
                    },
                    finish_reason: null,
                  },
                ],
              };

              index++;
              return { value: chunk, done: false };
            } else {
              // Final chunk with finish reason
              const finalChunk: ChatCompletionChunk = {
                id: `chatcmpl-${uuidv4()}`,
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: params.model || 'gpt-4o-mini',
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: 'stop',
                  },
                ],
              };
              return { value: finalChunk, done: true };
            }
          },
        };
      },
    };
  }

  private createMockEmbeddingResponse(params: EmbeddingCreateParams): CreateEmbeddingResponse {
    const model = params.model || 'text-embedding-3-small';
    const input = Array.isArray(params.input) ? params.input : [params.input];

    return {
      object: 'list',
      data: input.map((text, index) => ({
        object: 'embedding',
        embedding: this.generateMockEmbedding(text),
        index,
      })),
      model,
      usage: {
        prompt_tokens: (input as string[]).reduce((sum: number, text: string) => sum + text.length, 0) / 4,
        total_tokens: 0, // Will be calculated by consumer
      },
    };
  }

  private generateMockResponse(messages: ChatCompletionMessageParam[]): string {
    const userMessage = messages.find(msg => msg.role === 'user')?.content?.toString() || '';
    if (userMessage.toLowerCase().includes('hello')) {
      return 'Hello! How can I help you today?';
    }
    if (userMessage.toLowerCase().includes('test')) {
      return 'This is a test response for unit testing purposes.';
    }
    if (userMessage.toLowerCase().includes('error')) {
      return 'I understand there might be an error, but this is just a mock response.';
    }
    return 'This is a mock response from the OpenAI API.';
  }

  private generateMockEmbedding(text: string | string[] | number | number[]): number[] {
    // Generate a deterministic but varied embedding based on input
    const seed = text.toString().split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const embedding: number[] = [];
    for (let i = 0; i < 1536; i++) { // Standard embedding dimension
      embedding.push(Math.sin(seed + i) * 0.1);
    }
    return embedding;
  }

  private splitIntoChunks(content: string, numChunks: number): string[] {
    const chunkSize = Math.ceil(content.length / numChunks);
    const chunks: string[] = [];
    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, content.length);
      chunks.push(content.slice(start, end));
    }
    return chunks;
  }

  private calculatePromptTokens(messages: ChatCompletionMessageParam[]): number {
    return messages.reduce((sum, msg) => {
      return sum + (msg.content ? String(msg.content).length : 0);
    }, 0) / 4; // Rough token estimation
  }

  private async delay(): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }
  }

  // Test utility methods
  getCallHistory(): Array<{ method: string; params: any; timestamp: number }> {
    return [...this.callHistory];
  }

  clearCallHistory(): void {
    this.callHistory = [];
  }

  setFailureMode(shouldFail: boolean, message?: string): void {
    this.shouldFail = shouldFail;
    if (message) {
      this.failMessage = message;
    }
  }

  setDelay(delayMs: number): void {
    this.delayMs = delayMs;
  }
}

/**
 * Mock Memori instance for testing - provides only the methods needed for testing
 */
export class MockMemori {
  private memories: Array<{
    id: string;
    userInput: string;
    aiOutput: string;
    metadata: any;
  }> = [];
  private enabled: boolean = false;
  private sessionId: string = uuidv4();
  private shouldFailEnable: boolean = false;
  private enableErrorMessage: string = 'Mock enable failure';

  setEnableFailure(shouldFail: boolean, message?: string): void {
    this.shouldFailEnable = shouldFail;
    if (message) {
      this.enableErrorMessage = message;
    }
  }

  async enable(): Promise<void> {
    if (this.shouldFailEnable) {
      throw new Error(this.enableErrorMessage);
    }
    this.enabled = true;
  }

  async close(): Promise<void> {
    this.enabled = false;
  }

  async recordConversation(
    userInput: string,
    aiOutput: string,
    options?: {
      model?: string;
      metadata?: any;
    },
  ): Promise<string> {
    const id = uuidv4();
    this.memories.push({
      id,
      userInput,
      aiOutput,
      metadata: options?.metadata || {},
    });
    return id;
  }

  async searchMemories(
    query: string,
    options?: {
      limit?: number;
      minImportance?: MemoryImportanceLevel;
      namespace?: string;
    },
  ): Promise<MemorySearchResult[]> {
    // Simple mock search implementation
    const matchingMemories = this.memories.filter(memory =>
      memory.userInput.toLowerCase().includes(query.toLowerCase()) ||
      memory.aiOutput.toLowerCase().includes(query.toLowerCase()),
    );

    return matchingMemories.slice(0, options?.limit || 10).map(memory => ({
      id: memory.id,
      content: memory.userInput + ' ' + memory.aiOutput,
      summary: memory.userInput.slice(0, 100) + '...',
      classification: 'conversational' as MemoryClassification,
      importance: 'medium' as MemoryImportanceLevel,
      entities: [],
      keywords: [],
      conversationId: memory.metadata.conversationId || uuidv4(),
      confidenceScore: 0.8,
      classificationReason: 'Mock classification',
      promotionEligible: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  getSessionId(): string {
    return this.sessionId;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getMemories(): Array<{ id: string; userInput: string; aiOutput: string; metadata: any }> {
    return [...this.memories];
  }

  clearMemories(): void {
    this.memories = [];
  }
}

/**
 * Mock MemoryAgent for testing - provides only the methods needed for testing
 */
export class MockMemoryAgent {
  private processingHistory: MemoryProcessingParams[] = [];

  async processConversation(params: MemoryProcessingParams): Promise<any> {
    this.processingHistory.push(params);

    // Return mock processed memory
    return {
      content: params.userInput + ' ' + params.aiOutput,
      summary: params.userInput.slice(0, 100) + '...',
      classification: 'conversational' as MemoryClassification,
      importance: 'medium' as MemoryImportanceLevel,
      entities: [],
      keywords: [],
      conversationId: params.context?.conversationId || uuidv4(),
      confidenceScore: 0.8,
      classificationReason: 'Mock processing',
      promotionEligible: false,
    };
  }

  getProcessingHistory(): MemoryProcessingParams[] {
    return [...this.processingHistory];
  }

  clearProcessingHistory(): void {
    this.processingHistory = [];
  }
}

/**
 * Mock streaming response generator
 */
export class MockStreamingResponse {
  static createMockChunks(content: string, options?: {
    chunkCount?: number;
    delayBetweenChunks?: number;
    includeUsage?: boolean;
  }): ChatCompletionChunk[] {
    const chunkCount = options?.chunkCount || 3;
    const chunks = this.splitIntoChunks(content, chunkCount);

    const result: ChatCompletionChunk[] = chunks.map((chunk, _index) => ({
      id: `chatcmpl-${uuidv4()}`,
      object: 'chat.completion.chunk',
      created: Date.now(),
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          delta: {
            content: chunk,
          },
          finish_reason: null,
        },
      ],
    }));

    // Add final chunk with finish reason
    result.push({
      id: `chatcmpl-${uuidv4()}`,
      object: 'chat.completion.chunk',
      created: Date.now(),
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
    });

    return result;
  }

  static createAsyncIterable(
    chunks: ChatCompletionChunk[],
    options?: { delayBetweenChunks?: number },
  ): AsyncIterable<ChatCompletionChunk> {
    return {
      [Symbol.asyncIterator]: () => {
        let index = 0;
        return {
          next: async () => {
            if (index < chunks.length) {
              const chunk = chunks[index];
              index++;

              if (options?.delayBetweenChunks && options.delayBetweenChunks > 0) {
                await new Promise(resolve => setTimeout(resolve, options.delayBetweenChunks));
              }

              return { value: chunk, done: false };
            } else {
              return { value: undefined, done: true };
            }
          },
        };
      },
    };
  }

  private static splitIntoChunks(content: string, numChunks: number): string[] {
    const chunkSize = Math.ceil(content.length / numChunks);
    const chunks: string[] = [];
    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, content.length);
      chunks.push(content.slice(start, end));
    }
    return chunks;
  }
}

/**
 * Test data generators
 */
export class TestDataGenerator {
  static createMockChatParams(options?: {
    withUserMessage?: boolean;
    withSystemMessage?: boolean;
    messageCount?: number;
    includeStreaming?: boolean;
  }): ChatCompletionCreateParams {
    const messageCount = options?.messageCount || 2;
    const messages: ChatCompletionMessageParam[] = [];

    if (options?.withSystemMessage) {
      messages.push({
        role: 'system',
        content: 'You are a helpful assistant for testing purposes.',
      });
    }

    if (options?.withUserMessage !== false) {
      messages.push({
        role: 'user',
        content: 'Hello, this is a test message for unit testing.',
      });
    }

    // Add additional messages if requested
    for (let i = messages.length; i < messageCount; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1} for testing purposes.`,
      });
    }

    return {
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 1000,
      stream: options?.includeStreaming || false,
    };
  }

  static createMockEmbeddingParams(options?: {
    inputCount?: number;
    inputLength?: number;
    useNumbers?: boolean;
  }): EmbeddingCreateParams {
    const inputCount = options?.inputCount || 1;
    const inputLength = options?.inputLength || 100;

    const inputs: string[] = [];
    for (let i = 0; i < inputCount; i++) {
      if (options?.useNumbers) {
        inputs.push(`Input ${i + 1} with numbers: ${'0123456789'.repeat(inputLength / 10)}`);
      } else {
        inputs.push(`Test input ${i + 1} for embedding testing. `.repeat(Math.ceil(inputLength / 50)));
      }
    }

    return {
      model: 'text-embedding-3-small',
      input: inputCount === 1 ? inputs[0] : inputs,
      encoding_format: 'float',
    };
  }

  static createMockChatResponse(options?: {
    content?: string;
    includeUsage?: boolean;
    includeSystemFingerprint?: boolean;
  }): ChatCompletion {
    const content = options?.content || 'This is a mock response for testing purposes.';
    const includeUsage = options?.includeUsage !== false;

    return {
      id: `chatcmpl-${uuidv4()}`,
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
            refusal: null,
          },
          logprobs: null,
          finish_reason: 'stop',
        },
      ],
      usage: includeUsage ? {
        prompt_tokens: 50,
        completion_tokens: content.length / 4,
        total_tokens: 50 + content.length / 4,
      } : undefined,
      system_fingerprint: options?.includeSystemFingerprint ? `fp-${uuidv4()}` : undefined,
    };
  }
}