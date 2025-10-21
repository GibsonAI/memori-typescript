import { SearchStrategy, SearchErrorContext } from './types';
import { logError, logWarn, logInfo } from '../../infrastructure/config/Logger';

/**
 * Error handling and recovery mechanisms module for search operations
 * Extracted from SearchService to improve maintainability and separation of concerns
 */

// ===== ERROR HANDLING INTERFACES =====

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: Date | null;
  state: 'closed' | 'open' | 'half-open';
  nextAttemptTime: Date | null;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
}

/**
 * Error tracking information
 */
export interface ErrorTrackingInfo {
  strategy: SearchStrategy;
  error: unknown;
  context: SearchErrorContext;
  timestamp: Date;
  resolved: boolean;
  recoveryAttempts: number;
}

/**
 * Error trend analysis
 */
export interface ErrorTrendAnalysis {
  hasCriticalTrend: boolean;
  strategyTrends: Map<SearchStrategy, ErrorTrendData>;
  timeWindowTrends: ErrorTrendData[];
  recommendations: string[];
}

/**
 * Error trend data
 */
export interface ErrorTrendData {
  errorCount: number;
  errorRate: number;
  averageRecoveryTime: number;
  trendDirection: 'improving' | 'stable' | 'degrading';
  affectedOperations: string[];
}

/**
 * Recovery action result
 */
export interface RecoveryActionResult {
  success: boolean;
  recoveryTime: number;
  fallbackUsed: boolean;
  error?: string;
}

/**
 * Circuit breaker implementation for fault tolerance
 */
class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    this.state = {
      failureCount: 0,
      lastFailureTime: null,
      state: 'closed',
      nextAttemptTime: null,
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is OPEN for strategy');
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  isOpen(): boolean {
    if (this.state.state === 'open') {
      if (this.state.nextAttemptTime && Date.now() >= this.state.nextAttemptTime.getTime()) {
        this.state.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.state.failureCount = 0;
    this.state.state = 'closed';
    this.state.lastFailureTime = null;
    this.state.nextAttemptTime = null;
  }

  recordFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = new Date();

    if (this.state.failureCount >= this.config.failureThreshold) {
      this.state.state = 'open';
      this.state.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout);
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

/**
 * Error tracker for trend analysis and metrics
 */
class ErrorTracker {
  private errors: ErrorTrackingInfo[] = [];
  private maxErrors = 1000;
  private trendWindow = 24 * 60 * 60 * 1000;

  recordError(strategy: SearchStrategy, error: unknown, context: SearchErrorContext): void {
    const trackingInfo: ErrorTrackingInfo = {
      strategy,
      error,
      context,
      timestamp: new Date(),
      resolved: false,
      recoveryAttempts: 0,
    };

    this.errors.push(trackingInfo);

    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
  }

  markErrorResolved(strategy: SearchStrategy, _timestamp: Date): void {
    const error = this.errors
      .filter(e => e.strategy === strategy && !e.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (error) {
      error.resolved = true;
    }
  }

  analyzeTrends(): ErrorTrendAnalysis {
    const now = Date.now();
    const windowStart = now - this.trendWindow;

    const recentErrors = this.errors.filter(e => e.timestamp.getTime() >= windowStart);

    const strategyTrends = new Map<SearchStrategy, ErrorTrendData>();
    const strategyGroups = new Map<SearchStrategy, ErrorTrackingInfo[]>();

    for (const error of recentErrors) {
      if (!strategyGroups.has(error.strategy)) {
        strategyGroups.set(error.strategy, []);
      }
      strategyGroups.get(error.strategy)!.push(error);
    }

    for (const [strategy, errors] of strategyGroups) {
      const errorCount = errors.length;
      const errorRate = errorCount / (this.trendWindow / 1000);
      const resolvedCount = errors.filter(e => e.resolved).length;
      const averageRecoveryTime = this.calculateAverageRecoveryTime(errors);

      let trendDirection: 'improving' | 'stable' | 'degrading' = 'stable';
      if (resolvedCount / errorCount > 0.8) {
        trendDirection = 'improving';
      } else if (errorCount > errors.length * 0.3) {
        trendDirection = 'degrading';
      }

      strategyTrends.set(strategy, {
        errorCount,
        errorRate,
        averageRecoveryTime,
        trendDirection,
        affectedOperations: [...new Set(errors.map(e => e.context.operation))],
      });
    }

    const hasCriticalTrend = Array.from(strategyTrends.values())
      .some(trend => trend.trendDirection === 'degrading' && trend.errorRate > 0.1);

    const recommendations = this.generateRecommendations(strategyTrends);

    return {
      hasCriticalTrend,
      strategyTrends,
      timeWindowTrends: [],
      recommendations,
    };
  }

  private calculateAverageRecoveryTime(errors: ErrorTrackingInfo[]): number {
    const resolvedErrors = errors.filter(e => e.resolved);
    if (resolvedErrors.length === 0) return 0;

    const totalRecoveryTime = resolvedErrors.reduce((sum, error) => {
      return sum + (error.context.executionTime || 0);
    }, 0);

    return totalRecoveryTime / resolvedErrors.length;
  }

  private generateRecommendations(trends: Map<SearchStrategy, ErrorTrendData>): string[] {
    const recommendations: string[] = [];

    for (const [strategy, trend] of trends) {
      if (trend.trendDirection === 'degrading') {
        recommendations.push(`Consider disabling ${strategy} strategy due to high error rate`);
      }
      if (trend.errorRate > 0.1) {
        recommendations.push(`High error rate detected for ${strategy}, investigate root cause`);
      }
    }

    return recommendations;
  }

  getRecentErrors(strategy?: SearchStrategy, limit = 50): ErrorTrackingInfo[] {
    let errors = this.errors
      .filter(e => !strategy || e.strategy === strategy)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return errors.slice(0, limit);
  }
}

/**
 * Main error handler service that coordinates error tracking, circuit breakers, and recovery
 */
export class SearchErrorHandler {
  private circuitBreakers: Map<SearchStrategy, CircuitBreaker> = new Map();
  private errorTracker: ErrorTracker = new ErrorTracker();
  private errorNotificationCallback?: (error: SearchErrorContext) => void;
  private criticalErrorThreshold = 10;

  /**
   * Create error context for detailed error information
   */
  createErrorContext(
    operation: string,
    strategy: SearchStrategy,
    query: { text?: string; limit?: number; offset?: number; filters?: any; filterExpression?: string },
    additionalContext?: Record<string, unknown>,
  ): SearchErrorContext {
    return {
      strategy: strategy,
      operation,
      query: query.text,
      parameters: {
        limit: query.limit || 10,
        offset: query.offset || 0,
        hasFilters: !!query.filters,
        hasFilterExpression: !!query.filterExpression,
      },
      timestamp: new Date(),
      executionTime: 0,
      systemState: this.getSystemState(),
      errorCategory: this.categorizeErrorSeverity(strategy, operation),
      recoveryAttempts: 0,
      ...additionalContext,
    };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(
    strategy: SearchStrategy,
    operation: () => Promise<T>,
  ): Promise<T> {
    const breaker = this.getCircuitBreaker(strategy);
    return breaker.execute(operation);
  }

  /**
   * Get or create circuit breaker for a strategy
   */
  getCircuitBreaker(strategyName: SearchStrategy): CircuitBreaker {
    if (!this.circuitBreakers.has(strategyName)) {
      const config: CircuitBreakerConfig = {
        failureThreshold: 5,
        recoveryTimeout: 30000,
        monitoringPeriod: 60000,
      };
      this.circuitBreakers.set(strategyName, new CircuitBreaker(config));
    }
    return this.circuitBreakers.get(strategyName)!;
  }

  /**
   * Track error for trend analysis
   */
  trackError(strategy: SearchStrategy, error: unknown, context: SearchErrorContext): void {
    this.errorTracker.recordError(strategy, error, context);

    const trends = this.errorTracker.analyzeTrends();
    if (trends.hasCriticalTrend) {
      this.handleCriticalErrorTrend(trends);
    }

    if (context.errorCategory === 'critical') {
      this.sendErrorNotification(context);
    }
  }

  /**
   * Handle critical error trends
   */
  private handleCriticalErrorTrend(trends: ErrorTrendAnalysis): void {
    logWarn('Critical error trend detected', {
      component: 'SearchErrorHandler',
      operation: 'handleCriticalErrorTrend',
      hasCriticalTrend: trends.hasCriticalTrend,
      strategyCount: trends.strategyTrends.size
    });

    for (const [strategy, trend] of trends.strategyTrends) {
      if (trend.trendDirection === 'degrading' && trend.errorRate > 0.1) {
        logError(`Strategy ${strategy} showing critical error trend. Consider disabling.`, {
          component: 'SearchErrorHandler',
          operation: 'handleCriticalErrorTrend',
          strategy,
          errorRate: trend.errorRate,
          trendDirection: trend.trendDirection
        });
      }
    }
  }

  /**
   * Send error notification for critical failures
   */
  private sendErrorNotification(context: SearchErrorContext): void {
    if (this.errorNotificationCallback) {
      try {
        this.errorNotificationCallback(context);
      } catch (error) {
        logError('Error notification callback failed', {
          component: 'SearchErrorHandler',
          operation: 'sendErrorNotification',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    logError('Critical search error occurred', {
      component: 'SearchErrorHandler',
      operation: 'sendErrorNotification',
      strategy: context.strategy,
      contextOperation: context.operation,
      errorCategory: context.errorCategory,
      executionTime: context.executionTime,
      timestamp: context.timestamp,
    });
  }

  /**
   * Get current system state for error context
   */
  private getSystemState(): SearchErrorContext['systemState'] {
    try {
      return {
        memoryUsage: process.memoryUsage?.().heapUsed || 0,
        activeConnections: 0,
        databaseStatus: 'unknown',
      };
    } catch {
      return {
        memoryUsage: 0,
        activeConnections: 0,
        databaseStatus: 'unknown',
      };
    }
  }

  /**
   * Categorize error severity
   */
  categorizeErrorSeverity(strategy: SearchStrategy, operation: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (strategy) {
      case SearchStrategy.FTS5:
        return this.categorizeFTSErrorSeverity(operation);
      case SearchStrategy.LIKE:
        return this.categorizeLikeErrorSeverity(operation);
      default:
        return 'medium';
    }
  }

  /**
   * Check if an error is recoverable
   */
  isRecoverableError(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    const nonRecoverablePatterns = [
      'syntax error',
      'invalid configuration',
      'authentication failed',
      'permission denied',
      'corrupted database',
    ];

    const recoverablePatterns = [
      'timeout',
      'database busy',
      'database locked',
      'connection lost',
      'temporary failure',
      'out of memory',
    ];

    if (nonRecoverablePatterns.some(pattern => errorMessage.includes(pattern))) {
      return false;
    }

    return recoverablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Attempt strategy-specific error recovery
   */
  async attemptStrategyRecovery(
    strategy: SearchStrategy,
    query: { text?: string; limit?: number; offset?: number; filters?: any; filterExpression?: string },
    error: unknown,
    recoveryStrategies?: Array<(query: any, error: any) => Promise<any[]>>,
  ): Promise<any[]> {
    const context = this.createErrorContext('strategy_recovery', strategy, query);

    if (!this.isRecoverableError(error)) {
      this.trackError(strategy, error, context);
      throw error;
    }

    const strategies = recoveryStrategies || this.getDefaultRecoveryStrategies(strategy);

    for (const strategyFn of strategies) {
      try {
        const recoveryResult = await strategyFn(query, error);
        if (recoveryResult && recoveryResult.length > 0) {
          logInfo(`Recovery successful using ${strategyFn.name || 'custom strategy'}`, {
            component: 'SearchErrorHandler',
            operation: 'attemptStrategyRecovery',
            strategy: strategy,
            recoveryStrategyName: strategyFn.name || 'custom strategy'
          });
          context.recoveryAttempts = (context.recoveryAttempts || 0) + 1;
          return recoveryResult;
        }
      } catch (recoveryError) {
        logWarn('Recovery strategy failed', {
          component: 'SearchErrorHandler',
          operation: 'attemptStrategyRecovery',
          strategy: strategy,
          recoveryStrategyName: strategyFn.name || 'custom strategy',
          error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
        });
        continue;
      }
    }

    this.trackError(strategy, error, context);
    throw error;
  }

  /**
   * Get default recovery strategies for a strategy
   */
  private getDefaultRecoveryStrategies(strategy: SearchStrategy): Array<(query: any, error: any) => Promise<any[]>> {
    switch (strategy) {
      case SearchStrategy.FTS5:
        return [this.recoverFTSStrategy.bind(this)];
      case SearchStrategy.LIKE:
        return [this.recoverLikeStrategy.bind(this)];
      case SearchStrategy.RECENT:
        return [this.recoverRecentStrategy.bind(this)];
      default:
        return [];
    }
  }

  /**
   * Recover FTS5 strategy from errors
   */
  private async recoverFTSStrategy(_query: any, _error: any): Promise<any[]> {
    const breaker = this.circuitBreakers.get(SearchStrategy.FTS5);
    if (breaker) {
      breaker.recordSuccess();
    }

    logInfo('FTS strategy recovery attempted', {
      component: 'SearchErrorHandler',
      operation: 'recoverFTSStrategy',
      strategy: SearchStrategy.FTS5
    });
    throw new Error('FTS recovery not implemented in extracted module');
  }

  /**
   * Recover LIKE strategy from errors
   */
  private async recoverLikeStrategy(_query: any, _error: any): Promise<any[]> {
    const breaker = this.circuitBreakers.get(SearchStrategy.LIKE);
    if (breaker) {
      breaker.recordSuccess();
    }

    logInfo('LIKE strategy recovery attempted', {
      component: 'SearchErrorHandler',
      operation: 'recoverLikeStrategy',
      strategy: SearchStrategy.LIKE
    });
    throw new Error('LIKE recovery not implemented in extracted module');
  }

  /**
   * Recover Recent Memories strategy from errors
   */
  private async recoverRecentStrategy(_query: any, _error: any): Promise<any[]> {
    const breaker = this.circuitBreakers.get(SearchStrategy.RECENT);
    if (breaker) {
      breaker.recordSuccess();
    }

    logInfo('Recent strategy recovery attempted', {
      component: 'SearchErrorHandler',
      operation: 'recoverRecentStrategy',
      strategy: SearchStrategy.RECENT
    });
    throw new Error('Recent strategy recovery not implemented in extracted module');
  }

  /**
   * Determine if a strategy should be retried after failure
   */
  shouldRetryStrategy(strategyName: SearchStrategy, error: unknown): boolean {
    const retryableStrategies = [SearchStrategy.FTS5, SearchStrategy.LIKE];
    if (!retryableStrategies.includes(strategyName)) {
      return false;
    }

    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    if (errorMessage.includes('database locked') || errorMessage.includes('busy') || errorMessage.includes('timeout')) {
      return true;
    }

    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return true;
    }

    return false;
  }

  /**
   * Determine if fallback strategy should be used
   */
  shouldFallbackToAlternative(strategyName: SearchStrategy, error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    if (errorMessage.includes('no such table') || errorMessage.includes('database not found')) {
      return true;
    }

    if (errorMessage.includes('configuration') || errorMessage.includes('invalid config')) {
      return true;
    }

    if (errorMessage.includes('validation') || errorMessage.includes('invalid query')) {
      return false;
    }

    return true;
  }

  /**
   * Categorize FTS error severity
   */
  private categorizeFTSErrorSeverity(operation: string): 'low' | 'medium' | 'high' | 'critical' {
    if (operation.includes('initialization') || operation.includes('configuration')) {
      return 'critical';
    }
    if (operation.includes('timeout') || operation.includes('database')) {
      return 'high';
    }
    return 'medium';
  }

  /**
   * Categorize LIKE error severity
   */
  private categorizeLikeErrorSeverity(operation: string): 'low' | 'medium' | 'high' | 'critical' {
    if (operation.includes('configuration')) {
      return 'high';
    }
    return 'medium';
  }

  /**
   * Set error notification callback
   */
  setErrorNotificationCallback(callback: (error: SearchErrorContext) => void): void {
    this.errorNotificationCallback = callback;
  }

  /**
   * Get error statistics and trends
   */
  getErrorStatistics(): {
    totalErrors: number;
    recentErrors: ErrorTrackingInfo[];
    trends: ErrorTrendAnalysis;
    circuitBreakerStates: Map<SearchStrategy, CircuitBreakerState>;
  } {
    return {
      totalErrors: this.errorTracker.getRecentErrors().length,
      recentErrors: this.errorTracker.getRecentErrors(undefined, 100),
      trends: this.errorTracker.analyzeTrends(),
      circuitBreakerStates: new Map(
        Array.from(this.circuitBreakers.entries()).map(([strategy, breaker]) => [
          strategy,
          breaker.getState(),
        ]),
      ),
    };
  }

  /**
   * Reset circuit breaker for a strategy
   */
  resetCircuitBreaker(strategyName: SearchStrategy): void {
    const breaker = this.circuitBreakers.get(strategyName);
    if (breaker) {
      breaker.recordSuccess();
    }
  }

  /**
   * Force circuit breaker to open for a strategy
   */
  tripCircuitBreaker(strategyName: SearchStrategy): void {
    const breaker = this.circuitBreakers.get(strategyName);
    if (breaker) {
      for (let i = 0; i < 10; i++) {
        breaker.recordFailure();
      }
    }
  }
}