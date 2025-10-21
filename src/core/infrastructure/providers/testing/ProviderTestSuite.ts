import { ILLMProvider } from '../ILLMProvider';
import { IProviderConfig } from '../IProviderConfig';
import { ProviderType } from '../ProviderType';
import { ChatCompletionParams } from '../types/ChatCompletionParams';
import { EmbeddingParams } from '../types/EmbeddingParams';

/**
 * Test case configuration
 */
export interface TestCase {
  name: string;
  params: ChatCompletionParams | EmbeddingParams;
  expectedResult?: {
    success: boolean;
    minTokens?: number;
    maxTokens?: number;
  };
  timeout?: number;
}

/**
 * Test suite results
 */
export interface TestSuiteResult {
  providerType: ProviderType;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
  results: TestResult[];
  errors: string[];
}

/**
 * Individual test result
 */
export interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Provider test suite for comprehensive testing
 * Provides standardized testing framework for all LLM providers
 */
export class ProviderTestSuite {
  private provider: ILLMProvider;
  private config: IProviderConfig;

  constructor(provider: ILLMProvider, config: IProviderConfig) {
    this.provider = provider;
    this.config = config;
  }

  /**
   * Run a comprehensive test suite
   */
  async runTestSuite(customTests?: TestCase[]): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];
    const errors: string[] = [];

    try {
      // Standard test cases
      const standardTests = this.getStandardTestCases();

      // Run all tests (standard + custom)
      const allTests = customTests ? [...standardTests, ...customTests] : standardTests;

      for (const testCase of allTests) {
        const testResult = await this.runSingleTest(testCase);
        results.push(testResult);

        if (!testResult.passed && testResult.error) {
          errors.push(`${testCase.name}: ${testResult.error}`);
        }
      }

      const duration = Date.now() - startTime;
      const passedTests = results.filter(r => r.passed).length;
      const failedTests = results.length - passedTests;

      return {
        providerType: this.provider.getProviderType(),
        totalTests: results.length,
        passedTests,
        failedTests,
        duration,
        results,
        errors,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        providerType: this.provider.getProviderType(),
        totalTests: 0,
        passedTests: 0,
        failedTests: 1,
        duration,
        results: [],
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Test provider initialization and health
   */
  async testInitialization(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Test that provider is properly initialized
      await this.provider.initialize(this.config);
      const isHealthy = await this.provider.isHealthy();
      const diagnostics = await this.provider.getDiagnostics();

      if (!isHealthy) {
        return {
          testName: 'initialization',
          passed: false,
          duration: Date.now() - startTime,
          error: 'Provider is not healthy after initialization',
          metadata: { diagnostics },
        };
      }

      return {
        testName: 'initialization',
        passed: true,
        duration: Date.now() - startTime,
        metadata: { diagnostics },
      };
    } catch (error) {
      return {
        testName: 'initialization',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test chat completion functionality
   */
  async testChatCompletion(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const params: ChatCompletionParams = {
        messages: [
          { role: 'user', content: 'Hello, how are you?' }
        ],
        max_tokens: 50,
        temperature: 0.7,
      };

      const response = await this.provider.createChatCompletion(params);

      // Validate response structure
      if (!response.message || !response.message.content) {
        return {
          testName: 'chat-completion',
          passed: false,
          duration: Date.now() - startTime,
          error: 'Invalid response structure - missing message content',
        };
      }

      if (response.message.content.length < 5) {
        return {
          testName: 'chat-completion',
          passed: false,
          duration: Date.now() - startTime,
          error: 'Response too short',
        };
      }

      return {
        testName: 'chat-completion',
        passed: true,
        duration: Date.now() - startTime,
        metadata: {
          responseLength: response.message.content.length,
          model: response.model,
          usage: response.usage,
        },
      };
    } catch (error) {
      return {
        testName: 'chat-completion',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test embedding functionality
   */
  async testEmbedding(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const params: EmbeddingParams = {
        input: 'Test input for embedding',
      };

      const response = await this.provider.createEmbedding(params);

      // Validate response structure
      if (!response.data || response.data.length === 0) {
        return {
          testName: 'embedding',
          passed: false,
          duration: Date.now() - startTime,
          error: 'No embedding data returned',
        };
      }

      const embedding = response.data[0];
      if (!embedding.embedding || embedding.embedding.length === 0) {
        return {
          testName: 'embedding',
          passed: false,
          duration: Date.now() - startTime,
          error: 'Empty embedding vector',
        };
      }

      return {
        testName: 'embedding',
        passed: true,
        duration: Date.now() - startTime,
        metadata: {
          embeddingDimension: embedding.embedding.length,
          model: response.model,
          usage: response.usage,
        },
      };
    } catch (error) {
      return {
        testName: 'embedding',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run a single test case
   */
  private async runSingleTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();

    try {
      let result: any;

      if ('messages' in testCase.params) {
        // Chat completion test
        result = await this.provider.createChatCompletion(testCase.params as ChatCompletionParams);
      } else {
        // Embedding test
        result = await this.provider.createEmbedding(testCase.params as EmbeddingParams);
      }

      // Validate expected results if specified
      if (testCase.expectedResult) {
        if (!testCase.expectedResult.success) {
          return {
            testName: testCase.name,
            passed: false,
            duration: Date.now() - startTime,
            error: 'Expected test to fail but it succeeded',
          };
        }
      }

      return {
        testName: testCase.name,
        passed: true,
        duration: Date.now() - startTime,
        metadata: { result },
      };
    } catch (error) {
      if (testCase.expectedResult && !testCase.expectedResult.success) {
        // Expected failure
        return {
          testName: testCase.name,
          passed: true,
          duration: Date.now() - startTime,
          metadata: { expectedError: error instanceof Error ? error.message : String(error) },
        };
      }

      return {
        testName: testCase.name,
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get standard test cases for all providers
   */
  private getStandardTestCases(): TestCase[] {
    return [
      {
        name: 'basic-chat-completion',
        params: {
          messages: [{ role: 'user', content: 'Say hello' }],
          max_tokens: 10,
        },
      },
      {
        name: 'system-message-handling',
        params: {
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Tell me about yourself' },
          ],
          max_tokens: 50,
        },
      },
      {
        name: 'embedding-generation',
        params: {
          input: 'Test embedding input',
        } as EmbeddingParams,
      },
      {
        name: 'temperature-parameter',
        params: {
          messages: [{ role: 'user', content: 'Write a short poem' }],
          max_tokens: 30,
          temperature: 0.8,
        },
      },
    ];
  }
}