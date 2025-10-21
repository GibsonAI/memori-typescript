// Test utilities and helpers for OpenAI drop-in testing
// Provides common test scenarios, fixtures, and helper functions

import type {
  ChatCompletionCreateParams,
  EmbeddingCreateParams,
  MemoryRecordingResult,
  StreamingMetadata,
  BufferedStream,
} from '../../../../src/integrations/openai-dropin/types';
import { MockOpenAIClient, MockMemori, MockMemoryAgent } from './mocks';

/**
 * Test fixture factory for creating consistent test data
 */
export class TestFixtures {
  static createBasicChatParams(): ChatCompletionCreateParams {
    return {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: 'Hello, this is a test message for unit testing.',
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      stream: false,
    };
  }

  static createStreamingChatParams(): ChatCompletionCreateParams {
    return {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: 'Hello, this is a streaming test message.',
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      stream: true,
    };
  }

  static createEmbeddingParams(): EmbeddingCreateParams {
    return {
      model: 'text-embedding-3-small',
      input: 'This is a test input for embedding generation.',
      encoding_format: 'float',
    };
  }

  static createMultipleInputEmbeddingParams(): EmbeddingCreateParams {
    return {
      model: 'text-embedding-3-small',
      input: [
        'First test input for embedding.',
        'Second test input for embedding.',
        'Third test input for embedding.',
      ],
      encoding_format: 'float',
    };
  }

  static createLongContentParams(): ChatCompletionCreateParams {
    const longMessage = 'A'.repeat(5000); // 5KB message
    return {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: longMessage,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      stream: false,
    };
  }

  static createErrorScenarioParams(): ChatCompletionCreateParams {
    return {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: 'This will cause an error in testing.',
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      stream: false,
    };
  }

  static createMockChatResponse(options?: {
    content?: string;
    includeUsage?: boolean;
    includeSystemFingerprint?: boolean;
  }): any {
    const content = options?.content || 'This is a mock response for testing purposes.';
    const includeUsage = options?.includeUsage !== false;

    return {
      id: `chatcmpl-${Date.now()}`,
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
      system_fingerprint: options?.includeSystemFingerprint ? `fp-${Date.now()}` : undefined,
    };
  }
}

/**
 * Test scenario builders for different testing situations
 */
export class TestScenarios {
  static createSuccessfulChatScenario() {
    return {
      description: 'Successful chat completion with memory recording',
      params: TestFixtures.createBasicChatParams(),
      expectedMemoryRecording: true,
      expectedSuccess: true,
    };
  }

  static createStreamingChatScenario() {
    return {
      description: 'Streaming chat completion with memory recording',
      params: TestFixtures.createStreamingChatParams(),
      expectedMemoryRecording: true,
      expectedSuccess: true,
      expectedStreaming: true,
    };
  }

  static createEmbeddingScenario() {
    return {
      description: 'Embedding generation with memory recording',
      params: TestFixtures.createEmbeddingParams(),
      expectedMemoryRecording: true,
      expectedSuccess: true,
      expectedEmbeddingCount: 1,
    };
  }

  static createMultipleEmbeddingScenario() {
    return {
      description: 'Multiple embedding generation with memory recording',
      params: TestFixtures.createMultipleInputEmbeddingParams(),
      expectedMemoryRecording: true,
      expectedSuccess: true,
      expectedEmbeddingCount: 3,
    };
  }

  static createErrorScenario() {
    return {
      description: 'Error scenario for testing error handling',
      params: TestFixtures.createErrorScenarioParams(),
      expectedMemoryRecording: false,
      expectedSuccess: false,
      expectedError: true,
    };
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceUtils {
  static async measureExecutionTime<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<{ result: T; duration: number; operationName: string }> {
    const startTime = Date.now();
    const result = await operation();
    const endTime = Date.now();
    const duration = endTime - startTime;

    return {
      result,
      duration,
      operationName,
    };
  }

  static async runPerformanceBenchmark<T>(
    operation: () => Promise<T>,
    iterations: number,
    operationName: string,
  ): Promise<{
    results: T[];
    durations: number[];
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    operationName: string;
  }> {
    const results: T[] = [];
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { result, duration } = await this.measureExecutionTime(operation, operationName);
      results.push(result);
      durations.push(duration);
    }

    const averageDuration = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);

    return {
      results,
      durations,
      averageDuration,
      minDuration,
      maxDuration,
      operationName,
    };
  }

  static generatePerformanceReport(benchmark: Awaited<ReturnType<typeof this.runPerformanceBenchmark>>): string {
    return `
Performance Report for ${benchmark.operationName}:
- Iterations: ${benchmark.durations.length}
- Average Duration: ${benchmark.averageDuration.toFixed(2)}ms
- Min Duration: ${benchmark.minDuration.toFixed(2)}ms
- Max Duration: ${benchmark.maxDuration.toFixed(2)}ms
- Total Time: ${(benchmark.durations.reduce((sum, duration) => sum + duration, 0)).toFixed(2)}ms
    `.trim();
  }
}

/**
 * Memory validation utilities
 */
export class MemoryValidationUtils {
  static validateMemoryRecordingResult(
    result: MemoryRecordingResult,
    expectedSuccess: boolean,
    expectedStreaming: boolean = false,
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (result.success !== expectedSuccess) {
      errors.push(`Expected success=${expectedSuccess}, got success=${result.success}`);
    }

    if (result.wasStreaming !== expectedStreaming) {
      errors.push(`Expected wasStreaming=${expectedStreaming}, got wasStreaming=${result.wasStreaming}`);
    }

    if (expectedSuccess && !result.chatId) {
      errors.push('Expected chatId to be present for successful recording');
    }

    if (!expectedSuccess && !result.error) {
      errors.push('Expected error message for failed recording');
    }

    if (result.duration < 0) {
      errors.push('Duration should be non-negative');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static validateStreamingMetadata(metadata: StreamingMetadata): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!metadata.model) {
      errors.push('Model should be present in streaming metadata');
    }

    if (metadata.contentLength < 0) {
      errors.push('Content length should be non-negative');
    }

    if (metadata.chunkCount < 0) {
      errors.push('Chunk count should be non-negative');
    }

    if (metadata.duration < 0) {
      errors.push('Duration should be non-negative');
    }

    if (metadata.tokensUsed < 0) {
      errors.push('Tokens used should be non-negative');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static validateBufferedStream(stream: BufferedStream): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (stream.chunks.length === 0) {
      errors.push('Buffered stream should contain at least one chunk');
    }

    if (stream.completeContent.length === 0) {
      errors.push('Buffered stream should contain complete content');
    }

    if (!stream.metadata.model) {
      errors.push('Buffered stream metadata should contain model');
    }

    // Validate that content matches chunks
    const chunkContent = stream.chunks
      .map(chunk => chunk.choices[0]?.delta?.content || '')
      .join('');
    if (chunkContent !== stream.completeContent) {
      errors.push('Complete content does not match concatenated chunk content');
    }

    const validation = this.validateStreamingMetadata(stream.metadata);
    errors.push(...validation.errors);

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Test assertion helpers
 */
export class TestAssertions {
  static expectMemoryRecordingSuccess(
    result: MemoryRecordingResult,
  ): void {
    expect(result.success).toBe(true);
    expect(result.chatId).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  }

  static expectMemoryRecordingFailure(
    result: MemoryRecordingResult,
  ): void {
    expect(result.success).toBe(false);
    expect(result.chatId).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).not.toBe('');
  }

  static expectStreamingResponse(
    response: any,
  ): void {
    expect(response).toBeDefined();
    expect(typeof response[Symbol.asyncIterator]).toBe('function');
  }

  static expectNonStreamingResponse(
    response: any,
  ): void {
    expect(response).toBeDefined();
    expect(response.choices).toBeDefined();
    expect(Array.isArray(response.choices)).toBe(true);
    expect(response.choices.length).toBeGreaterThan(0);
    expect(response.choices[0].message).toBeDefined();
    expect(response.choices[0].message.content).toBeDefined();
  }
}

/**
 * Mock factory for creating test instances
 */
export class MockFactory {
  static createMockOpenAI(options?: {
    shouldFail?: boolean;
    failMessage?: string;
    delayMs?: number;
  }): MockOpenAIClient {
    return new MockOpenAIClient(options);
  }

  static createMockMemori(): MockMemori {
    return new MockMemori();
  }

  static createMockMemoryAgent(): MockMemoryAgent {
    return new MockMemoryAgent();
  }

  static createTestSuiteMocks() {
    const mockOpenAI = this.createMockOpenAI();
    const mockMemori = this.createMockMemori();
    const mockMemoryAgent = this.createMockMemoryAgent();

    return {
      mockOpenAI,
      mockMemori,
      mockMemoryAgent,
      getCallHistory: () => mockOpenAI.getCallHistory(),
      clearCallHistory: () => mockOpenAI.clearCallHistory(),
      getMemories: () => mockMemori.getMemories(),
      clearMemories: () => mockMemori.clearMemories(),
      getProcessingHistory: () => mockMemoryAgent.getProcessingHistory(),
      clearProcessingHistory: () => mockMemoryAgent.clearProcessingHistory(),
    };
  }
}

/**
 * Test data generators for edge cases and stress testing
 */
export class TestDataGenerators {
  static generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static generateRandomChatParams(options?: {
    messageCount?: number;
    includeSystemMessage?: boolean;
    includeStreaming?: boolean;
    maxMessageLength?: number;
  }): ChatCompletionCreateParams {
    const messageCount = options?.messageCount || Math.floor(Math.random() * 5) + 1;
    const messages = [];

    if (options?.includeSystemMessage) {
      messages.push({
        role: 'system' as const,
        content: this.generateRandomString(Math.floor(Math.random() * 200) + 50),
      });
    }

    for (let i = 0; i < messageCount; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: this.generateRandomString(
          options?.maxMessageLength || Math.floor(Math.random() * 500) + 50,
        ),
      });
    }

    return {
      model: 'gpt-4o-mini',
      messages,
      temperature: Math.random(),
      max_tokens: Math.floor(Math.random() * 2000) + 100,
      stream: options?.includeStreaming || Math.random() > 0.5,
    };
  }

  static generateRandomEmbeddingParams(options?: {
    inputCount?: number;
    maxInputLength?: number;
  }): EmbeddingCreateParams {
    const inputCount = options?.inputCount || Math.floor(Math.random() * 5) + 1;
    const inputs: string[] = [];

    for (let i = 0; i < inputCount; i++) {
      inputs.push(
        this.generateRandomString(
          options?.maxInputLength || Math.floor(Math.random() * 500) + 50,
        )
      );
    }

    return {
      model: 'text-embedding-3-small',
      input: inputCount === 1 ? inputs[0] : inputs,
      encoding_format: Math.random() > 0.5 ? 'float' : 'base64',
    };
  }

  static generateStressTestParams(iterations: number = 100) {
    const params: ChatCompletionCreateParams[] = [];

    for (let i = 0; i < iterations; i++) {
      params.push(this.generateRandomChatParams({
        messageCount: Math.floor(Math.random() * 10) + 1,
        includeSystemMessage: Math.random() > 0.7,
        includeStreaming: Math.random() > 0.5,
      }));
    }

    return params;
  }
}

/**
 * Test cleanup utilities
 */
export class TestCleanup {
  static async cleanupAsync(): Promise<void> {
    // Wait for any pending async operations
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  static clearAllTimers(): void {
    // Clear any pending timers in test environment
    jest.clearAllTimers();
  }

  static restoreAllMocks(): void {
    jest.restoreAllMocks();
  }

  static async fullCleanup(): Promise<void> {
    await this.cleanupAsync();
    this.clearAllTimers();
    this.restoreAllMocks();
  }
}

export default {
  TestFixtures,
  TestScenarios,
  PerformanceUtils,
  MemoryValidationUtils,
  TestAssertions,
  MockFactory,
  TestDataGenerators,
  TestCleanup,
};