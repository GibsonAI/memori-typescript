import { DatabaseManager } from '../../../infrastructure/database/DatabaseManager';
import { logError, logInfo, logWarn } from '../../../infrastructure/config/Logger';
import {
  ISearchStrategy,
  SearchQuery,
  SearchResult,
  SearchStrategyConfig,
  SearchStrategyMetadata,
  SearchCapability,
  SearchError,
  SearchValidationError,
  SearchTimeoutError,
  SearchConfigurationError,
  SearchDatabaseError,
  SearchParseError,
  SearchErrorCategory,
  SearchErrorContext,
} from '../SearchStrategy';

/**
 * Abstract base class with shared functionality for search strategies.
 * Centralizes metadata management, configuration validation, error handling,
 * and diagnostic logging to keep concrete strategies focused on core logic.
 */
export abstract class BaseSearchStrategy implements ISearchStrategy {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly capabilities: readonly SearchCapability[];
  abstract readonly priority: number;
  abstract readonly supportedMemoryTypes: readonly ('short_term' | 'long_term')[];

  protected readonly config: SearchStrategyConfig;
  protected readonly databaseManager: DatabaseManager;

  constructor(config: SearchStrategyConfig, databaseManager: DatabaseManager) {
    this.config = config;
    this.databaseManager = databaseManager;
  }

  abstract canHandle(query: SearchQuery): boolean;

  /**
   * Core execution entry point shared by all search strategies.
   * Handles validation, logging, and standardized error handling.
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const startTime = Date.now();

    try {
      this.validateQuery(query);
      const results = await this.executeSearch(query);

      const duration = Date.now() - startTime;
      this.logSearchOperation('search', duration, results.length);

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logSearchOperation('search_failed', duration, 0);

      throw this.handleSearchError(error, 'search', {
        query: query.text,
        duration,
      });
    }
  }

  /**
   * Concrete strategies implement their specialized search behaviour here.
   */
  protected abstract executeSearch(query: SearchQuery): Promise<SearchResult[]>;

  /**
   * Provide capability listing for metadata generation.
   */
  protected abstract getCapabilities(): readonly SearchCapability[];

  /**
   * Generate standardized metadata for strategy diagnostics.
   */
  getMetadata(): SearchStrategyMetadata {
    return {
      name: this.name,
      version: '1.0.0',
      description: this.description,
      capabilities: [...this.getCapabilities()],
      supportedMemoryTypes: [...this.supportedMemoryTypes],
      configurationSchema: this.getConfigurationSchema(),
      performanceMetrics: this.getPerformanceMetrics(),
    };
  }

  /**
   * Validate strategy configuration against shared guardrails.
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      if (!this.config.enabled) {
        return true;
      }

      if (this.config.priority < 0 || this.config.priority > 100) {
        throw new Error('Priority must be between 0 and 100');
      }

      if (this.config.timeout < 1000 || this.config.timeout > 30000) {
        throw new Error('Timeout must be between 1000ms and 30000ms');
      }

      if (this.config.maxResults < 1 || this.config.maxResults > 1000) {
        throw new Error('MaxResults must be between 1 and 1000');
      }

      if (this.config.minScore !== undefined && (this.config.minScore < 0 || this.config.minScore > 1)) {
        throw new Error('MinScore must be between 0 and 1');
      }

      return this.validateStrategyConfiguration();
    } catch (error) {
      logError(`Configuration validation failed for ${this.name}`, {
        component: 'BaseSearchStrategy',
        operation: 'validateConfiguration',
        strategy: this.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Allow concrete strategies to add custom validation rules.
   */
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - default implementation returns true
  protected validateStrategyConfiguration(): boolean | Promise<boolean> {
    return true;
  }

  /**
   * Basic query validation used by most strategies.
   * Strategies can override for specialized validation requirements.
   */
  protected validateQuery(query: SearchQuery): void {
    if (!query.text && !query.filters) {
      throw this.handleValidationError('Search query must include text or filters');
    }
  }

  /**
   * Meta-data schema used by diagnostics tooling.
   */
  protected getConfigurationSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        priority: { type: 'number', minimum: 0, maximum: 100 },
        timeout: { type: 'number', minimum: 1000, maximum: 30000 },
        maxResults: { type: 'number', minimum: 1, maximum: 1000 },
        minScore: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['priority', 'timeout', 'maxResults'],
    };
  }

  /**
   * Default performance metrics, can be overridden by concrete strategies.
   */
  protected getPerformanceMetrics(): SearchStrategyMetadata['performanceMetrics'] {
    return {
      averageResponseTime: 100,
      throughput: 500,
      memoryUsage: 25,
    };
  }

  /**
   * Utility for building consistent search results.
   */
  protected createSearchResult(
    id: string,
    content: string,
    metadata: Record<string, unknown>,
    score: number,
  ): SearchResult {
    return {
      id,
      content,
      metadata: {
        strategy: this.name,
        createdAt: new Date(),
        ...metadata,
      },
      score: Math.max(0, Math.min(1, score)),
      strategy: this.name,
      timestamp: new Date(),
    };
  }

  /**
   * Utility for producing standardized error results.
   */
  protected createErrorResult(
    error: string,
    context: Record<string, unknown> = {},
  ): SearchResult {
    return {
      id: '',
      content: '',
      metadata: {
        error: true,
        strategy: this.name,
        ...context,
      },
      score: 0,
      strategy: this.name,
      timestamp: new Date(),
      error,
    };
  }

  /**
   * Structured logging for search operations.
   */
  protected logSearchOperation(operation: string, duration: number, resultCount: number): void {
    logInfo(`Search operation: ${operation}`, {
      component: 'BaseSearchStrategy',
      operation,
      strategy: this.name,
      duration: `${duration}ms`,
      resultCount,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Shared error handling path providing enhanced context and logging.
   */
  protected handleSearchError(
    error: unknown,
    operation: string,
    context?: Record<string, unknown>,
    category: SearchErrorCategory = SearchErrorCategory.EXECUTION,
  ): SearchError {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const startTime = context?.startTime as number || Date.now();
    const executionTime = Date.now() - startTime;

    const severity = this.determineErrorSeverity(error, category, executionTime);

    const contextParameters: Record<string, unknown> | undefined = context
      ? { ...context, errorType: category }
      : { errorType: category };

    const errorContext: SearchErrorContext = {
      strategy: this.name,
      operation,
      query: context?.query as string,
      parameters: contextParameters,
      executionTime,
      timestamp: new Date(),
      databaseState: this.getDatabaseState(),
      systemContext: this.getSystemContext(),
      errorCategory: severity,
    };

    const searchError = new SearchError(
      `Search strategy ${this.name} failed during ${operation}: ${errorMessage}`,
      this.name,
      errorContext,
      error instanceof Error ? error : undefined,
      category,
    );

    logError('Search strategy error', {
      component: 'BaseSearchStrategy',
      operation: 'handleSearchError',
      strategy: this.name,
      ...searchError.getErrorSummary(),
    });

    return searchError;
  }

  protected handleDatabaseError(
    error: unknown,
    operation: string,
    query?: string,
    context?: Record<string, unknown>,
  ): SearchDatabaseError {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const dbContext: SearchErrorContext = {
      strategy: this.name,
      operation,
      query,
      parameters: context,
      timestamp: new Date(),
      databaseState: this.getDatabaseState(),
    };

    logError('Database error context', {
      component: 'BaseSearchStrategy',
      operation: 'handleDatabaseError',
      strategy: this.name,
      dbContext,
    });

    const dbError = new SearchDatabaseError(
      this.name,
      errorMessage,
      operation,
      context,
      error instanceof Error ? error : undefined,
    );

    logError('Database error', {
      component: 'BaseSearchStrategy',
      operation: 'handleDatabaseError',
      strategy: this.name,
      ...dbError.getErrorSummary(),
    });

    return dbError;
  }

  protected handleValidationError(
    message: string,
    field?: string,
    value?: unknown,
    context?: Record<string, unknown>,
  ): SearchValidationError {
    const validationError = new SearchValidationError(
      message,
      field,
      value,
      this.name,
      context,
    );

    logError('Validation error', {
      component: 'BaseSearchStrategy',
      operation: 'handleValidationError',
      strategy: this.name,
      ...validationError.getErrorSummary(),
    });

    return validationError;
  }

  protected handleTimeoutError(
    timeout: number,
    operation: string,
    context?: Record<string, unknown>,
  ): SearchTimeoutError {
    const timeoutError = new SearchTimeoutError(
      this.name,
      timeout,
      operation,
      context,
    );

    logError('Timeout error', {
      component: 'BaseSearchStrategy',
      operation: 'handleTimeoutError',
      strategy: this.name,
      ...timeoutError.getErrorSummary(),
    });

    return timeoutError;
  }

  protected handleConfigurationError(
    message: string,
    context?: Record<string, unknown>,
  ): SearchConfigurationError {
    const configError = new SearchConfigurationError(
      this.name,
      message,
      undefined,
      context,
    );

    logWarn('Configuration error', {
      component: 'BaseSearchStrategy',
      operation: 'handleConfigurationError',
      strategy: this.name,
      ...configError.getErrorSummary(),
    });

    return configError;
  }

  protected handleParseError(
    message: string,
    context?: Record<string, unknown>,
  ): SearchParseError {
    const parseError = new SearchParseError(
      this.name,
      message,
      'parse',
      context,
    );

    logError('Parse error', {
      component: 'BaseSearchStrategy',
      operation: 'handleParseError',
      strategy: this.name,
      ...parseError.getErrorSummary(),
    });

    return parseError;
  }

  /**
   * --- Internal helpers ----------------------------------------------------
   */

  protected getDatabaseState(): SearchErrorContext['databaseState'] {
    try {
      const dbManager = this.databaseManager as unknown as {
        isConnected?: boolean;
        lastError?: string;
        queryCount?: number;
      };
      return {
        connectionStatus: dbManager?.isConnected ? 'connected' : 'disconnected',
        lastError: dbManager?.lastError,
        queryCount: dbManager?.queryCount,
      };
    } catch {
      return {
        connectionStatus: 'error',
      };
    }
  }

  protected getSystemContext(): SearchErrorContext['systemContext'] {
    try {
      const memoryUsage = process.memoryUsage();
      return {
        memoryUsage: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100,
        availableMemory: Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100,
        cpuUsage: process.cpuUsage().user / 1000,
      };
    } catch {
      return undefined;
    }
  }

  private determineErrorSeverity(
    error: unknown,
    category: SearchErrorCategory,
    executionTime: number,
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (category === SearchErrorCategory.DATABASE ||
      category === SearchErrorCategory.AUTHENTICATION ||
      category === SearchErrorCategory.AUTHORIZATION) {
      return 'critical';
    }

    if (category === SearchErrorCategory.TIMEOUT ||
      category === SearchErrorCategory.CONFIGURATION) {
      return 'high';
    }

    if (category === SearchErrorCategory.EXECUTION && executionTime > 10000) {
      return 'medium';
    }

    if (category === SearchErrorCategory.VALIDATION ||
      category === SearchErrorCategory.PARSE) {
      return 'low';
    }

    if (error instanceof Error && 'code' in error) {
      const errorCode = (error as Error & { code?: string }).code;
      if (errorCode === 'ECONNREFUSED' || errorCode === 'SQLITE_BUSY') {
        return 'high';
      }
    }

    if (error instanceof Error && 'statusCode' in error) {
      const statusCode = (error as Error & { statusCode?: number }).statusCode;
      if (statusCode && statusCode >= 500) {
        return 'critical';
      }
    }

    return 'medium';
  }
}
