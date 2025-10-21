/**
 * Shared utilities for generating realistic mock responses across all provider types
 */

export interface MockResponseConfig {
  scenario?: 'success' | 'error' | 'partial' | 'empty' | 'long_content' | 'function_call' | 'tool_call';
  contentLength?: 'short' | 'medium' | 'long';
  includeMetadata?: boolean;
  customContent?: string;
  errorType?: 'network' | 'api' | 'authentication' | 'rate_limit' | 'timeout';
}

export interface MockUsageStats {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Generates realistic response content based on configuration
 */
export class MockResponseGenerator {
  private static readonly DEFAULT_RESPONSES = {
    short: 'This is a brief mock response.',
    medium: 'This is a more detailed mock response that provides comprehensive information about the requested topic.',
    long: 'This is an extensive mock response that includes detailed explanations, examples, and comprehensive coverage of the subject matter. It demonstrates the capability to generate longer-form content with multiple paragraphs and detailed information that would be typical of a thorough response from an AI assistant.',
  };

  private static readonly ERROR_RESPONSES = {
    network: 'Network connection failed. Please check your internet connection and try again.',
    api: 'API request failed. The service may be temporarily unavailable.',
    authentication: 'Authentication failed. Please check your API credentials.',
    rate_limit: 'Rate limit exceeded. Please wait before making additional requests.',
    timeout: 'Request timeout. The operation took longer than expected.',
  };

  /**
   * Generate response content based on configuration
   */
  static generateContent(config: MockResponseConfig = {}): string {
    const { scenario = 'success', contentLength = 'medium', customContent } = config;

    if (customContent) {
      return customContent;
    }

    if (scenario === 'error') {
      return this.ERROR_RESPONSES[config.errorType || 'api'];
    }

    if (scenario === 'empty') {
      return '';
    }

    if (scenario === 'partial') {
      return this.DEFAULT_RESPONSES[contentLength].substring(0, 50) + '...';
    }

    return this.DEFAULT_RESPONSES[contentLength];
  }

  /**
   * Generate realistic usage statistics based on content length
   */
  static generateUsage(content: string, baseTokens: number = 10): MockUsageStats {
    const contentTokens = Math.ceil(content.length / 4); // Rough token estimation
    const completionTokens = Math.max(baseTokens, Math.floor(contentTokens * 0.3));

    return {
      prompt_tokens: Math.floor(contentTokens * 0.7),
      completion_tokens: completionTokens,
      total_tokens: contentTokens + completionTokens,
    };
  }

  /**
   * Generate realistic function call arguments
   */
  static generateFunctionArguments(functionName: string, context?: string): string {
    const baseArgs = {
      timestamp: new Date().toISOString(),
      function_name: functionName,
    };

    if (context) {
      return JSON.stringify({
        ...baseArgs,
        context,
        metadata: {
          generated_at: baseArgs.timestamp,
          version: '1.0',
        },
      });
    }

    return JSON.stringify(baseArgs);
  }

  /**
   * Generate realistic tool call arguments
   */
  static generateToolArguments(toolName: string, parameters?: Record<string, any>): string {
    const baseArgs = {
      timestamp: new Date().toISOString(),
      tool_name: toolName,
      action: 'execute',
    };

    const finalArgs = parameters ? { ...baseArgs, ...parameters } : baseArgs;

    return JSON.stringify(finalArgs);
  }

  /**
   * Generate provider-specific metadata
   */
  static generateMetadata(provider: string, config: MockResponseConfig = {}): Record<string, any> {
    const baseMetadata = {
      mock: true,
      provider,
      generated_at: new Date().toISOString(),
      version: '1.0',
    };

    if (config.includeMetadata) {
      return {
        ...baseMetadata,
        response_config: config,
        processing_time_ms: Math.floor(Math.random() * 500) + 100,
      };
    }

    return baseMetadata;
  }

  /**
   * Generate context-aware responses based on input messages
   */
  static generateContextualResponse(messages: Array<{ role: string; content: string }>, provider: string): string {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();

    if (!lastUserMessage) {
      return this.generateContent({ scenario: 'success', contentLength: 'medium' });
    }

    const content = lastUserMessage.content.toLowerCase();

    // Simple contextual responses based on keywords
    if (content.includes('hello') || content.includes('hi')) {
      return `Hello! I'm the ${provider} mock assistant. How can I help you today?`;
    }

    if (content.includes('error') || content.includes('problem')) {
      return `I understand you're experiencing an issue. This is a mock response from ${provider}. In a real scenario, I would help diagnose and resolve the problem.`;
    }

    if (content.includes('function') || content.includes('tool')) {
      return `I can help you with function and tool calling. This is a mock response demonstrating ${provider}'s capabilities.`;
    }

    if (content.includes('long') || content.includes('detailed')) {
      return this.generateContent({ scenario: 'success', contentLength: 'long' });
    }

    return this.generateContent({ scenario: 'success', contentLength: 'medium' });
  }
}