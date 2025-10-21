/**
 * Enhanced error simulation utilities for provider mocks
 */

export type MockErrorType =
  | 'network_error'
  | 'api_error'
  | 'authentication_error'
  | 'rate_limit_error'
  | 'timeout_error'
  | 'invalid_request_error'
  | 'server_error'
  | 'model_not_found_error'
  | 'context_length_error'
  | 'content_filter_error';

export interface MockErrorConfig {
  errorType: MockErrorType;
  message?: string;
  statusCode?: number;
  retryable?: boolean;
  delay?: number;
  metadata?: Record<string, any>;
}

/**
 * Centralized error simulation for all provider mocks
 */
export class MockErrorSimulator {
  private static readonly ERROR_DEFINITIONS: Record<MockErrorType, { defaultMessage: string; defaultStatusCode: number; retryable: boolean }> = {
    network_error: {
      defaultMessage: 'Network connection failed',
      defaultStatusCode: 0,
      retryable: true,
    },
    api_error: {
      defaultMessage: 'API request failed',
      defaultStatusCode: 500,
      retryable: true,
    },
    authentication_error: {
      defaultMessage: 'Authentication failed. Please check your API credentials.',
      defaultStatusCode: 401,
      retryable: false,
    },
    rate_limit_error: {
      defaultMessage: 'Rate limit exceeded. Please wait before making additional requests.',
      defaultStatusCode: 429,
      retryable: true,
    },
    timeout_error: {
      defaultMessage: 'Request timeout. The operation took longer than expected.',
      defaultStatusCode: 408,
      retryable: true,
    },
    invalid_request_error: {
      defaultMessage: 'Invalid request parameters provided.',
      defaultStatusCode: 400,
      retryable: false,
    },
    server_error: {
      defaultMessage: 'Internal server error occurred.',
      defaultStatusCode: 500,
      retryable: true,
    },
    model_not_found_error: {
      defaultMessage: 'The specified model was not found.',
      defaultStatusCode: 404,
      retryable: false,
    },
    context_length_error: {
      defaultMessage: 'Input context length exceeds maximum allowed.',
      defaultStatusCode: 400,
      retryable: false,
    },
    content_filter_error: {
      defaultMessage: 'Content was filtered due to policy restrictions.',
      defaultStatusCode: 403,
      retryable: false,
    },
  };

  /**
   * Create a mock error based on configuration
   */
  static createError(config: MockErrorConfig): Error {
    const errorDef = this.ERROR_DEFINITIONS[config.errorType];
    const message = config.message || errorDef.defaultMessage;
    const statusCode = config.statusCode || errorDef.defaultStatusCode;

    // Create enhanced error with additional properties
    const error = new Error(message) as any;
    error.name = this.getErrorName(config.errorType);
    error.statusCode = statusCode;
    error.retryable = config.retryable ?? errorDef.retryable;
    error.errorType = config.errorType;
    error.timestamp = new Date().toISOString();

    if (config.metadata) {
      error.metadata = config.metadata;
    }

    // Simulate delay if configured
    if (config.delay) {
      // Note: This would need to be handled by the calling code
      error.simulatedDelay = config.delay;
    }

    return error;
  }

  /**
   * Get appropriate error name for the error type
   */
  private static getErrorName(errorType: MockErrorType): string {
    return errorType.split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('') + 'Error';
  }

  /**
   * Check if an error should be retryable
   */
  static isRetryable(error: any): boolean {
    return error.retryable === true;
  }

  /**
   * Get retry delay for an error (with jitter)
   */
  static getRetryDelay(error: any, baseDelay: number = 1000): number {
    if (!this.isRetryable(error)) {
      return 0;
    }

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * baseDelay;
    return baseDelay + jitter;
  }

  /**
   * Simulate intermittent errors for testing resilience
   */
  static shouldError(config: { errorRate?: number; errorType?: MockErrorType } = {}): boolean {
    const { errorRate = 0.1 } = config; // 10% default error rate
    return Math.random() < errorRate;
  }

  /**
   * Create error configuration for common scenarios
   */
  static getScenarioConfig(scenario: 'flaky_network' | 'rate_limited' | 'server_overload' | 'auth_failure'): Partial<MockErrorConfig> {
    const scenarios = {
      flaky_network: {
        errorType: 'network_error' as MockErrorType,
        errorRate: 0.3,
        retryable: true,
      },
      rate_limited: {
        errorType: 'rate_limit_error' as MockErrorType,
        retryable: true,
      },
      server_overload: {
        errorType: 'server_error' as MockErrorType,
        retryable: true,
      },
      auth_failure: {
        errorType: 'authentication_error' as MockErrorType,
        retryable: false,
      },
    };

    return scenarios[scenario];
  }

  /**
   * Validate error configuration
   */
  static validateConfig(config: MockErrorConfig): boolean {
    return (
      config.errorType in this.ERROR_DEFINITIONS &&
      (config.statusCode === undefined || (config.statusCode >= 100 && config.statusCode < 600))
    );
  }

  /**
   * Get all available error types
   */
  static getAvailableErrorTypes(): MockErrorType[] {
    return Object.keys(this.ERROR_DEFINITIONS) as MockErrorType[];
  }

  /**
   * Create a chain of errors for testing error recovery
   */
  static createErrorChain(errors: MockErrorType[], delays: number[] = []): MockErrorConfig[] {
    return errors.map((errorType, index) => ({
      errorType,
      delay: delays[index] || 0,
    }));
  }
}