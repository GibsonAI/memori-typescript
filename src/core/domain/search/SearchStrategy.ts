import { logError } from '../../infrastructure/config/Logger';

// SearchStrategy interface and base classes

/**
 * Search capability enumeration for strategy features
 */
export enum SearchCapability {
  KEYWORD_SEARCH = 'keyword_search',
  SEMANTIC_SEARCH = 'semantic_search',
  FILTERING = 'filtering',
  SORTING = 'sorting',
  RELEVANCE_SCORING = 'relevance_scoring',
  CATEGORIZATION = 'categorization',
  TEMPORAL_FILTERING = 'temporal_filtering',
  TIME_RANGE_PROCESSING = 'time_range_processing',
  TEMPORAL_PATTERN_MATCHING = 'temporal_pattern_matching',
  TEMPORAL_AGGREGATION = 'temporal_aggregation',
}

/**
 * Search query interface for strategy operations
 */
export interface SearchQuery {
  /** The search text/query string */
  text: string;
  /** Maximum number of results to return */
  limit?: number;
  /** Number of results to skip for pagination */
  offset?: number;
  /** Key-value pairs for simple filtering */
  filters?: Record<string, unknown>;
  /**
   * Advanced filter expression that will be parsed and executed by AdvancedFilterEngine.
   * This field accepts filter expressions as strings that support complex boolean logic,
   * field comparisons, and nested conditions. When provided, this takes precedence over
   * the simple filters field for more sophisticated filtering requirements.
   */
  filterExpression?: string;
  /** Sort configuration for results */
  sortBy?: {
    /** Field name to sort by */
    field: string;
    /** Sort direction */
    direction: 'asc' | 'desc';
  };
  /** Whether to include metadata in search results */
  includeMetadata?: boolean;
  /** Additional context information for the search operation */
  context?: Record<string, unknown>;
}

/**
 * Search result interface with standardized structure
 */
export interface SearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
  strategy: string;
  timestamp: Date;
  error?: string;
  context?: Record<string, unknown>;
}

/**
 * Enhanced error context interface for comprehensive debugging
 */
export interface EnhancedErrorContext {
  strategy: string;
  operation: string;
  query: string;
  parameters: Record<string, unknown>;
  executionTime: number;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  databaseState?: {
    connectionStatus: 'connected' | 'disconnected' | 'error';
    lastError?: string;
    queryCount?: number;
  };
  systemContext?: {
    memoryUsage?: number;
    availableMemory?: number;
    cpuUsage?: number;
  };
  retryCount?: number;
  fallbackStrategy?: string;
  originalError?: Error;
}

/**
 * Standardized error context interface for consistent debugging
 */
export interface SearchErrorContext {
  strategy: string;
  operation: string;
  query?: string;
  parameters?: Record<string, unknown>;
  duration?: number;
  timestamp: Date;
  executionTime?: number;
  databaseState?: {
    connectionStatus: 'connected' | 'disconnected' | 'error';
    lastError?: string;
    queryCount?: number;
  };
  systemContext?: {
    memoryUsage?: number;
    availableMemory?: number;
    cpuUsage?: number;
  };
  systemState?: {
    memoryUsage: number;
    activeConnections: number;
    databaseStatus: string;
  };
  errorCategory?: 'low' | 'medium' | 'high' | 'critical';
  recoveryAttempts?: number;
  circuitBreakerState?: 'closed' | 'open' | 'half-open';
}

/**
 * Enhanced error categories for better error classification
 */
export enum SearchErrorCategory {
  VALIDATION = 'validation',
  EXECUTION = 'execution',
  DATABASE = 'database',
  TIMEOUT = 'timeout',
  CONFIGURATION = 'configuration',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NETWORK = 'network',
  PARSE = 'parse',
  TRANSFORMATION = 'transformation',
  UNKNOWN = 'unknown'
}

/**
 * Search strategy metadata for runtime information
 */
export interface SearchStrategyMetadata {
  name: string;
  version: string;
  description: string;
  capabilities: SearchCapability[];
  supportedMemoryTypes: ('short_term' | 'long_term')[];
  configurationSchema?: Record<string, unknown>;
  performanceMetrics?: {
    averageResponseTime: number;
    throughput: number;
    memoryUsage: number;
  };
}

/**
  * Search strategy configuration interface
  */
export interface SearchStrategyConfig {
  strategyName: string;
  enabled: boolean;
  priority: number;
  timeout: number;
  maxResults: number;
  minScore?: number;
  performance?: {
    enableMetrics: boolean;
    enableCaching: boolean;
    cacheSize: number;
    enableParallelExecution: boolean;
  };
  scoring?: {
    baseWeight: number;
    recencyWeight: number;
    importanceWeight: number;
    relationshipWeight: number;
  };
  strategySpecific?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

/**
 * SearchStrategy interface
 */
export interface ISearchStrategy {
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly SearchCapability[];
  readonly priority: number;
  readonly supportedMemoryTypes: readonly ('short_term' | 'long_term')[];

  canHandle(query: SearchQuery): boolean;
  search(query: SearchQuery): Promise<SearchResult[]>;
  getMetadata(): SearchStrategyMetadata;
  validateConfiguration(): Promise<boolean>;
}

export { BaseSearchStrategy } from './strategies/BaseSearchStrategy';

/**
 * Utility class for creating standardized search results
 */
export class SearchResultBuilder {
  /**
     * Create a successful search result
     */
  static createSuccessful(
    id: string,
    content: string,
    metadata: Record<string, unknown>,
    score: number,
    strategy: string,
  ): SearchResult {
    return {
      id,
      content,
      metadata: {
        strategy,
        success: true,
        createdAt: new Date(),
        ...metadata,
      },
      score: Math.max(0, Math.min(1, score)),
      strategy,
      timestamp: new Date(),
    };
  }

  /**
     * Create an error search result
     */
  static createError(
    error: string,
    strategy: string,
    context: Record<string, unknown> = {},
  ): SearchResult {
    return {
      id: '',
      content: '',
      metadata: {
        strategy,
        success: false,
        error: true,
        createdAt: new Date(),
        ...context,
      },
      score: 0,
      strategy,
      timestamp: new Date(),
      error,
    };
  }

  /**
     * Create a batch of search results
     */
  static createBatch(
    results: Array<{
      id: string;
      content: string;
      metadata?: Record<string, unknown>;
      score: number;
    }>,
    strategy: string,
  ): SearchResult[] {
    return results.map(result =>
      SearchResultBuilder.createSuccessful(
        result.id,
        result.content,
        result.metadata || {},
        result.score,
        strategy,
      ),
    );
  }

  /**
     * Create results with normalized scores
     */
  static createWithNormalizedScores(
    results: Array<{
      id: string;
      content: string;
      metadata?: Record<string, unknown>;
      rawScore: number;
    }>,
    strategy: string,
    normalizationFactor: number = 1,
  ): SearchResult[] {
    return results.map(result => {
      const normalizedScore = Math.max(0, Math.min(1, result.rawScore / normalizationFactor));
      return SearchResultBuilder.createSuccessful(
        result.id,
        result.content,
        result.metadata || {},
        normalizedScore,
        strategy,
      );
    });
  }
}

/**
 * Enhanced error classes for search operations with standardized context
 */
export class SearchError extends Error {
  public readonly category: SearchErrorCategory;
  public readonly timestamp: Date;
  public readonly context?: SearchErrorContext;

  constructor(
    message: string,
    public readonly strategy?: string,
    context?: Record<string, unknown> | SearchErrorContext,
    public readonly cause?: Error,
    category: SearchErrorCategory = SearchErrorCategory.UNKNOWN,
  ) {
    super(message);
    this.name = 'SearchError';
    this.category = category;
    this.timestamp = new Date();

    // Handle both old and new context formats
    if (context && 'strategy' in context && 'operation' in context) {
      this.context = context as SearchErrorContext;
    } else if (context) {
      // Convert old context format to new standardized format
      this.context = {
        strategy: this.strategy || 'unknown',
        operation: 'unknown',
        timestamp: this.timestamp,
        parameters: context,
      };
    }
  }

  /**
     * Get a structured error summary for logging
     */
  getErrorSummary(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      strategy: this.strategy,
      category: this.category,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}

export class SearchStrategyError extends SearchError {
  constructor(
    strategy: string,
    message: string,
    operation: string = 'search',
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    const errorContext: SearchErrorContext = {
      strategy,
      operation,
      timestamp: new Date(),
      parameters: context,
    };

    super(
      `Strategy ${strategy} error: ${message}`,
      strategy,
      errorContext,
      cause,
      SearchErrorCategory.EXECUTION,
    );
    this.name = 'SearchStrategyError';
  }
}

export class SearchValidationError extends SearchError {
  constructor(
    message: string,
    field?: string,
    value?: unknown,
    strategy?: string,
    context?: Record<string, unknown>,
  ) {
    const fieldInfo = field ? ` (field: ${field})` : '';
    const valueInfo = value !== undefined ? ` (value: ${value})` : '';
    const fullMessage = `Validation error: ${message}${fieldInfo}${valueInfo}`;

    const errorContext: SearchErrorContext = {
      strategy: strategy || 'unknown',
      operation: 'validation',
      timestamp: new Date(),
      parameters: { ...context, field, value },
    };

    super(
      fullMessage,
      strategy,
      errorContext,
      undefined,
      SearchErrorCategory.VALIDATION,
    );
    this.name = 'SearchValidationError';
  }
}

export class SearchTimeoutError extends SearchError {
  constructor(
    strategy: string,
    timeout: number,
    operation: string = 'search',
    context?: Record<string, unknown>,
  ) {
    const errorContext: SearchErrorContext = {
      strategy,
      operation,
      timestamp: new Date(),
      parameters: { ...context, timeout },
    };

    super(
      `Search strategy '${strategy}' timed out after ${timeout}ms`,
      strategy,
      errorContext,
      undefined,
      SearchErrorCategory.TIMEOUT,
    );
    this.name = 'SearchTimeoutError';
  }
}

export class SearchConfigurationError extends SearchError {
  constructor(
    strategy: string,
    message: string,
    config?: Record<string, unknown>,
    context?: Record<string, unknown>,
  ) {
    const errorContext: SearchErrorContext = {
      strategy,
      operation: 'configuration',
      timestamp: new Date(),
      parameters: { ...context, config },
    };

    super(
      `Configuration error for ${strategy}: ${message}`,
      strategy,
      errorContext,
      undefined,
      SearchErrorCategory.CONFIGURATION,
    );
    this.name = 'SearchConfigurationError';
  }
}

export class SearchDatabaseError extends SearchError {
  constructor(
    strategy: string,
    message: string,
    operation: string = 'database_query',
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    const errorContext: SearchErrorContext = {
      strategy,
      operation,
      timestamp: new Date(),
      parameters: context,
    };

    super(
      `Database error in ${strategy}: ${message}`,
      strategy,
      errorContext,
      cause,
      SearchErrorCategory.DATABASE,
    );
    this.name = 'SearchDatabaseError';
  }
}

export class SearchParseError extends SearchError {
  constructor(
    strategy: string,
    message: string,
    operation: string = 'parse',
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    const errorContext: SearchErrorContext = {
      strategy,
      operation,
      timestamp: new Date(),
      parameters: context,
    };

    super(
      `Parse error in ${strategy}: ${message}`,
      strategy,
      errorContext,
      cause,
      SearchErrorCategory.PARSE,
    );
    this.name = 'SearchParseError';
  }
}

/**
 * Strategy validation utilities
 */
export class StrategyValidator {
  /**
     * Validate a search strategy implementation
     */
  static async validateStrategy(strategy: ISearchStrategy): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check basic interface compliance
      if (!strategy.name || typeof strategy.name !== 'string') {
        errors.push('Strategy must have a valid name');
      }

      if (!strategy.description || typeof strategy.description !== 'string') {
        errors.push('Strategy must have a valid description');
      }

      if (!Array.isArray(strategy.capabilities)) {
        errors.push('Strategy must have capabilities array');
      }

      // Validate capabilities
      const validCapabilities = Object.values(SearchCapability);
      const invalidCapabilities = strategy.capabilities.filter(
        cap => !validCapabilities.includes(cap),
      );

      if (invalidCapabilities.length > 0) {
        errors.push(`Invalid capabilities: ${invalidCapabilities.join(', ')}`);
      }

      // Test canHandle method
      const testQuery: SearchQuery = { text: 'test' };
      const canHandleResult = strategy.canHandle(testQuery);
      if (typeof canHandleResult !== 'boolean') {
        errors.push('canHandle method must return a boolean');
      }

      // Test configuration validation
      const configValid = await strategy.validateConfiguration();
      if (typeof configValid !== 'boolean') {
        errors.push('validateConfiguration method must return a boolean');
      }

      // Test metadata
      const metadata = strategy.getMetadata();
      if (!metadata.name || !metadata.capabilities) {
        errors.push('getMetadata must return valid metadata object');
      }

      // Performance validation
      if (strategy.capabilities.includes(SearchCapability.KEYWORD_SEARCH)) {
        const startTime = Date.now();
        try {
          const results = await strategy.search(testQuery);
          const duration = Date.now() - startTime;

          if (duration > 5000) {
            warnings.push(`Strategy search took ${duration}ms, consider optimization`);
          }

          if (!Array.isArray(results)) {
            errors.push('search method must return an array of SearchResult');
          }
        } catch (error) {
          warnings.push(`Strategy threw error during test search: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

    } catch (error) {
      errors.push(`Strategy validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
     * Validate multiple strategies
     */
  static async validateStrategies(strategies: ISearchStrategy[]): Promise<ValidationResult> {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    let allValid = true;

    for (const strategy of strategies) {
      const result = await this.validateStrategy(strategy);

      if (!result.isValid) {
        allValid = false;
        allErrors.push(...result.errors.map(error => `${strategy.name}: ${error}`));
      }

      allWarnings.push(...result.warnings.map(warning => `${strategy.name}: ${warning}`));
    }

    return {
      isValid: allValid,
      errors: allErrors,
      warnings: allWarnings,
    };
  }
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Error handling utility for consistent error management across strategies
 */
export class SearchErrorHandler {
  private static readonly MAX_ERROR_CONTEXT_DEPTH = 3;
  private static readonly ERROR_LOG_SIZE_LIMIT = 10000;

  /**
     * Create a standardized error context with comprehensive information
     */
  static createErrorContext(
    strategy: string,
    operation: string,
    parameters?: Record<string, unknown>,
    additionalContext?: Record<string, unknown>,
  ): SearchErrorContext {
    return {
      strategy,
      operation,
      parameters: this.sanitizeParameters(parameters || {}),
      timestamp: new Date(),
      ...additionalContext,
    };
  }

  /**
     * Sanitize parameters to remove sensitive information and limit size
     */
  private static sanitizeParameters(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    let totalSize = 0;

    for (const [key, value] of Object.entries(params)) {
      // Skip sensitive fields
      if (this.isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Convert value to string representation with size limit
      const stringValue = this.valueToString(value);
      if (totalSize + stringValue.length > this.ERROR_LOG_SIZE_LIMIT) {
        sanitized[key] = '[TRUNCATED]';
        break;
      }

      sanitized[key] = value;
      totalSize += stringValue.length;
    }

    return sanitized;
  }

  /**
     * Check if a field contains sensitive information
     */
  private static isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'password', 'token', 'key', 'secret', 'auth', 'credential',
      'apiKey', 'accessToken', 'refreshToken', 'sessionId',
    ];
    return sensitiveFields.some(sensitive =>
      fieldName.toLowerCase().includes(sensitive.toLowerCase()),
    );
  }

  /**
     * Convert a value to string representation for logging
     */
  private static valueToString(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      return value.length > 1000 ? value.substring(0, 1000) + '...' : value;
    }

    if (typeof value === 'object') {
      try {
        const jsonStr = JSON.stringify(value);
        return jsonStr.length > 1000 ? jsonStr.substring(0, 1000) + '...' : jsonStr;
      } catch {
        return '[Object - cannot stringify]';
      }
    }

    return String(value);
  }

  /**
     * Create enhanced logging metadata for errors
     */
  static createLoggingMetadata(
    error: Error,
    context: SearchErrorContext,
    additionalMetadata?: Record<string, unknown>,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      errorName: error.name,
      errorMessage: error.message,
      errorCategory: (error as SearchError).category || SearchErrorCategory.UNKNOWN,
      strategy: context.strategy,
      operation: context.operation,
      timestamp: context.timestamp.toISOString(),
      duration: context.duration,
      hasCause: !!error.cause,
      stackTrace: this.truncateStackTrace(error.stack),
      ...additionalMetadata,
    };

    // Add system information if available
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        metadata.memoryUsage = process.memoryUsage().heapUsed;
      }
    } catch {
      // Ignore process module errors
    }

    return metadata;
  }

  /**
     * Truncate stack trace to prevent excessive log size
     */
  private static truncateStackTrace(stack?: string): string | undefined {
    if (!stack) return undefined;

    const lines = stack.split('\n');
    if (lines.length <= this.MAX_ERROR_CONTEXT_DEPTH * 2) {
      return stack;
    }

    // Keep first few lines and last few lines of stack trace
    const firstLines = lines.slice(0, this.MAX_ERROR_CONTEXT_DEPTH);
    const lastLines = lines.slice(-this.MAX_ERROR_CONTEXT_DEPTH);

    return [...firstLines, '  ...', ...lastLines].join('\n');
  }

  /**
     * Determine error category based on error type and message
     */
  static categorizeError(error: unknown): SearchErrorCategory {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return SearchErrorCategory.TIMEOUT;
    }

    if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('format')) {
      return SearchErrorCategory.VALIDATION;
    }

    if (errorMessage.includes('database') || errorMessage.includes('sql') || errorMessage.includes('connection')) {
      return SearchErrorCategory.DATABASE;
    }

    if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
      return SearchErrorCategory.NETWORK;
    }

    if (errorMessage.includes('parse') || errorMessage.includes('json') || errorMessage.includes('syntax')) {
      return SearchErrorCategory.PARSE;
    }

    if (errorMessage.includes('configuration') || errorMessage.includes('config') || errorMessage.includes('setting')) {
      return SearchErrorCategory.CONFIGURATION;
    }

    if (errorMessage.includes('authentication') || errorMessage.includes('auth') || errorMessage.includes('unauthorized')) {
      return SearchErrorCategory.AUTHENTICATION;
    }

    if (errorMessage.includes('authorization') || errorMessage.includes('permission') || errorMessage.includes('forbidden')) {
      return SearchErrorCategory.AUTHORIZATION;
    }

    if (errorMessage.includes('execution') || errorMessage.includes('runtime') || errorMessage.includes('failed')) {
      return SearchErrorCategory.EXECUTION;
    }

    return SearchErrorCategory.UNKNOWN;
  }
}
// Additional imports for enhanced error handling
// Note: performance import removed as it's not currently used
