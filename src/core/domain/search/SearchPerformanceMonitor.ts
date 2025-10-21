import { SearchStrategy } from './types';
import { logError, logWarn, logInfo } from '../../infrastructure/config/Logger';

/**
 * Performance monitoring and analytics module for search operations
 * Extracted from SearchService to improve maintainability and separation of concerns
 */

// ===== PERFORMANCE MONITORING INTERFACES =====

/**
 * Performance metrics collection interface
 */
export interface PerformanceMetrics {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageResponseTime: number;
  averageQueryTime: number;
  strategyUsage: Map<SearchStrategy, number>;
  errorCounts: Map<string, number>;
  memoryUsage: number;
  peakMemoryUsage: number;
  queryComplexity: Map<string, number>;
  performanceTrends: PerformanceTrend[];
  lastMaintenanceCheck: Date;
  maintenanceCheckCount: number;
}

/**
 * Performance trend data structure
 */
export interface PerformanceTrend {
  timestamp: number;
  responseTime: number;
  memoryUsage: number;
  queryCount: number;
  errorRate: number;
  strategy: SearchStrategy;
}

/**
 * Performance report structure
 */
export interface PerformanceReport {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageResponseTime: number;
  successRate: number;
  strategyUsagePercentages: Record<SearchStrategy, number>;
  topErrors: Array<{ error: string; count: number }>;
  performanceTrends: PerformanceTrend[];
  optimizationRecommendations: string[];
  timestamp: Date;
}

/**
 * Dashboard data structure
 */
export interface DashboardData {
  currentMetrics: {
    totalQueries: number;
    averageResponseTime: number;
    memoryUsage: number;
    errorRate: number;
  };
  historicalData: {
    responseTimeHistory: Array<{ timestamp: Date; value: number }>;
    memoryUsageHistory: Array<{ timestamp: Date; value: number }>;
    queryVolumeHistory: Array<{ timestamp: Date; value: number }>;
  };
  strategyComparison: Array<{
    strategy: SearchStrategy;
    usagePercentage: number;
    averageResponseTime: number;
    successRate: number;
  }>;
  errorAnalysis: Array<{
    error: string;
    count: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }>;
  optimizationSuggestions: string[];
  systemHealth: 'healthy' | 'degraded' | 'critical';
  lastUpdated: Date;
}

/**
 * Performance monitoring configuration
 */
export interface PerformanceMonitoringConfig {
  enabled: boolean;
  collectionInterval: number;
  retentionPeriod: number;
  alertThresholds: {
    maxResponseTime: number;
    maxErrorRate: number;
    maxMemoryUsage: number;
  };
}

/**
 * Performance alert structure
 */
export interface PerformanceAlert {
  type: 'response_time' | 'error_rate' | 'memory_usage' | 'system_health';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  metrics: {
    currentValue: number;
    threshold: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  recommendations: string[];
}

/**
 * Performance monitoring and analytics service
 */
export class SearchPerformanceMonitor {
  private performanceMetrics: PerformanceMetrics;
  private performanceMonitoringConfig: PerformanceMonitoringConfig;
  private performanceCollectionTimer?: ReturnType<typeof setInterval>;
  private performanceAlertCallbacks: Array<(alert: PerformanceAlert) => void> = [];

  constructor(config?: Partial<PerformanceMonitoringConfig>) {
    this.performanceMonitoringConfig = {
      enabled: true,
      collectionInterval: 60000, // 1 minute
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      alertThresholds: {
        maxResponseTime: 5000, // 5 seconds
        maxErrorRate: 0.1, // 10%
        maxMemoryUsage: 100 * 1024 * 1024, // 100MB
      },
      ...config,
    };

    this.performanceMetrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageResponseTime: 0,
      averageQueryTime: 0,
      strategyUsage: new Map<SearchStrategy, number>(),
      errorCounts: new Map<string, number>(),
      memoryUsage: 0,
      peakMemoryUsage: 0,
      queryComplexity: new Map<string, number>(),
      performanceTrends: [],
      lastMaintenanceCheck: new Date(),
      maintenanceCheckCount: 0,
    };

    if (this.performanceMonitoringConfig.enabled) {
      this.startPerformanceMonitoring();
    }
  }

  /**
   * Clean up resources and stop monitoring
   */
  cleanup(): void {
    if (this.performanceCollectionTimer) {
      clearInterval(this.performanceCollectionTimer);
      this.performanceCollectionTimer = undefined;
    }
    this.performanceAlertCallbacks = [];
  }

  /**
   * Start the performance monitoring system
   */
  private startPerformanceMonitoring(): void {
    this.performanceCollectionTimer = setInterval(() => {
      this.collectPerformanceSnapshot();
      this.analyzePerformanceTrends();
      this.checkPerformanceAlerts();
    }, this.performanceMonitoringConfig.collectionInterval);

    logInfo('Performance monitoring system started', {
      component: 'SearchPerformanceMonitor',
      operation: 'startPerformanceMonitoring'
    });
  }

  /**
   * Collect current performance snapshot
   */
  private collectPerformanceSnapshot(): void {
    const now = Date.now();
    const currentMemory = process.memoryUsage();

    const trendData: PerformanceTrend = {
      timestamp: now,
      responseTime: this.performanceMetrics.averageResponseTime,
      memoryUsage: currentMemory.heapUsed,
      queryCount: this.performanceMetrics.totalQueries,
      errorRate: this.performanceMetrics.totalQueries > 0 ?
        this.performanceMetrics.failedQueries / this.performanceMetrics.totalQueries : 0,
      strategy: SearchStrategy.FTS5, // Default strategy for trend tracking
    };

    this.performanceMetrics.performanceTrends.push(trendData);
    this.performanceMetrics.memoryUsage = currentMemory.heapUsed;

    if (currentMemory.heapUsed > this.performanceMetrics.peakMemoryUsage) {
      this.performanceMetrics.peakMemoryUsage = currentMemory.heapUsed;
    }

    // Clean old trend data
    const retentionCutoff = now - this.performanceMonitoringConfig.retentionPeriod;
    this.performanceMetrics.performanceTrends = this.performanceMetrics.performanceTrends.filter(
      trend => trend.timestamp > retentionCutoff
    );
  }

  /**
   * Record query metrics with detailed tracking
   */
  recordQueryMetrics(strategy: SearchStrategy, success: boolean, responseTime: number, queryComplexity: number): void {
    this.performanceMetrics.totalQueries++;
    if (success) {
      this.performanceMetrics.successfulQueries++;
    } else {
      this.performanceMetrics.failedQueries++;
    }

    // Update average response time
    this.performanceMetrics.averageResponseTime =
      (this.performanceMetrics.averageResponseTime * (this.performanceMetrics.totalQueries - 1) + responseTime) /
      this.performanceMetrics.totalQueries;

    // Record strategy usage
    const currentUsage = this.performanceMetrics.strategyUsage.get(strategy) || 0;
    this.performanceMetrics.strategyUsage.set(strategy, currentUsage + 1);

    // Track query complexity
    const complexityKey = queryComplexity.toString();
    const currentComplexity = this.performanceMetrics.queryComplexity.get(complexityKey) || 0;
    this.performanceMetrics.queryComplexity.set(complexityKey, currentComplexity + 1);

    // Update memory usage
    const currentMemory = process.memoryUsage();
    this.performanceMetrics.memoryUsage = currentMemory.heapUsed;
    if (currentMemory.heapUsed > this.performanceMetrics.peakMemoryUsage) {
      this.performanceMetrics.peakMemoryUsage = currentMemory.heapUsed;
    }
  }

  /**
   * Get comprehensive performance report
   */
  getPerformanceReport(): PerformanceReport {
    return {
      ...this.performanceMetrics,
      successRate: this.performanceMetrics.totalQueries > 0 ?
        this.performanceMetrics.successfulQueries / this.performanceMetrics.totalQueries : 0,
      strategyUsagePercentages: this.calculateStrategyUsagePercentages(),
      topErrors: this.getTopErrors(),
      performanceTrends: this.performanceMetrics.performanceTrends,
      optimizationRecommendations: this.generateOptimizationRecommendations(),
      timestamp: new Date()
    };
  }

  /**
   * Calculate strategy usage percentages
   */
  private calculateStrategyUsagePercentages(): Record<SearchStrategy, number> {
    const percentages: Record<string, number> = {};
    const total = this.performanceMetrics.totalQueries;

    for (const [strategy, count] of this.performanceMetrics.strategyUsage) {
      percentages[strategy] = total > 0 ? (count / total) * 100 : 0;
    }

    return percentages as Record<SearchStrategy, number>;
  }

  /**
   * Get top errors for analysis
   */
  private getTopErrors(): Array<{ error: string; count: number }> {
    return Array.from(this.performanceMetrics.errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([error, count]) => ({ error, count }));
  }

  /**
   * Analyze performance trends and generate insights
   */
  private analyzePerformanceTrends(): void {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    const recentTrends = this.performanceMetrics.performanceTrends.filter(
      trend => trend.timestamp > oneHourAgo
    );

    const dailyTrends = this.performanceMetrics.performanceTrends.filter(
      trend => trend.timestamp > oneDayAgo
    );

    // Analyze trends and generate insights
    const hourlyAverage = this.calculateAverageResponseTime(recentTrends);
    const dailyAverage = this.calculateAverageResponseTime(dailyTrends);

    if (hourlyAverage > dailyAverage * 1.5) {
      this.generatePerformanceAlert('response_time', hourlyAverage, dailyAverage);
    }

    const hourlyErrorRate = this.calculateAverageErrorRate(recentTrends);
    const dailyErrorRate = this.calculateAverageErrorRate(dailyTrends);

    if (hourlyErrorRate > dailyErrorRate * 2) {
      this.generatePerformanceAlert('error_rate', hourlyErrorRate, dailyErrorRate);
    }
  }

  /**
   * Calculate average response time from trends
   */
  private calculateAverageResponseTime(trends: PerformanceTrend[]): number {
    if (trends.length === 0) return 0;
    return trends.reduce((sum, trend) => sum + trend.responseTime, 0) / trends.length;
  }

  /**
   * Calculate average error rate from trends
   */
  private calculateAverageErrorRate(trends: PerformanceTrend[]): number {
    if (trends.length === 0) return 0;
    return trends.reduce((sum, trend) => sum + trend.errorRate, 0) / trends.length;
  }

  /**
   * Check for performance alerts based on thresholds with gradual alerting
   */
  private checkPerformanceAlerts(): void {
    const currentMemory = process.memoryUsage();
    const currentErrorRate = this.performanceMetrics.totalQueries > 0 ?
      this.performanceMetrics.failedQueries / this.performanceMetrics.totalQueries : 0;

    // Only alert if we have a minimum number of queries to avoid false positives
    const minQueriesForAlert = 5;
    if (this.performanceMetrics.totalQueries < minQueriesForAlert) {
      return;
    }

    // Gradual alerting: Use different thresholds based on severity
    const warningThreshold = this.performanceMonitoringConfig.alertThresholds.maxErrorRate;
    const criticalThreshold = warningThreshold * 3; // 3x the normal threshold for critical

    if (this.performanceMetrics.averageResponseTime > this.performanceMonitoringConfig.alertThresholds.maxResponseTime * 2) {
      this.generatePerformanceAlert(
        'response_time',
        this.performanceMetrics.averageResponseTime,
        this.performanceMonitoringConfig.alertThresholds.maxResponseTime * 2
      );
    }

    // Use gradual error rate alerting
    if (currentErrorRate > criticalThreshold) {
      // Critical alert for very high error rates
      this.generatePerformanceAlert('error_rate', currentErrorRate, criticalThreshold);
    } else if (currentErrorRate > warningThreshold && this.shouldAlertForErrorRate(currentErrorRate)) {
      // Warning alert only if trend is concerning
      this.generatePerformanceAlert('error_rate', currentErrorRate, warningThreshold);
    }

    if (currentMemory.heapUsed > this.performanceMonitoringConfig.alertThresholds.maxMemoryUsage * 1.5) {
      this.generatePerformanceAlert(
        'memory_usage',
        currentMemory.heapUsed,
        this.performanceMonitoringConfig.alertThresholds.maxMemoryUsage * 1.5
      );
    }
  }

  /**
   * Determine if we should alert for a given error rate based on trends
   */
  private shouldAlertForErrorRate(errorRate: number): boolean {
    const recentTrends = this.performanceMetrics.performanceTrends.slice(-5);
    if (recentTrends.length < 3) return true; // Alert if we don't have enough trend data

    const recentErrorRates = recentTrends.map(t => t.errorRate);
    const averageRecentErrorRate = recentErrorRates.reduce((a, b) => a + b, 0) / recentErrorRates.length;

    // Only alert if error rate is consistently high or rapidly increasing
    return errorRate > averageRecentErrorRate * 1.5;
  }

  /**
   * Generate performance alert
   */
  private generatePerformanceAlert(type: PerformanceAlert['type'], currentValue: number, threshold: number): void {
    const alert: PerformanceAlert = {
      type,
      severity: this.calculateAlertSeverity(type, currentValue, threshold),
      message: this.generateAlertMessage(type, currentValue, threshold),
      timestamp: new Date(),
      metrics: {
        currentValue,
        threshold,
        trend: this.calculateTrendDirection(type),
      },
      recommendations: this.generateAlertRecommendations(type, currentValue, threshold),
    };

    this.performanceAlertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        logError('Performance alert callback failed', {
          component: 'SearchPerformanceMonitor',
          operation: 'generatePerformanceAlert',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    logWarn('Performance Alert generated', {
      component: 'SearchPerformanceMonitor',
      operation: 'generatePerformanceAlert',
      alertType: alert.type,
      severity: alert.severity,
      message: alert.message
    });
  }

  /**
   * Calculate alert severity
   */
  private calculateAlertSeverity(type: PerformanceAlert['type'], currentValue: number, threshold: number): PerformanceAlert['severity'] {
    const ratio = currentValue / threshold;
    if (ratio > 3) return 'critical';
    if (ratio > 2) return 'high';
    if (ratio > 1.5) return 'medium';
    return 'low';
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(type: PerformanceAlert['type'], currentValue: number, threshold: number): string {
    const ratio = (currentValue / threshold * 100).toFixed(1);

    switch (type) {
      case 'response_time':
        return `Response time (${currentValue}ms) exceeds threshold (${threshold}ms) by ${ratio}%`;
      case 'error_rate':
        return `Error rate (${(currentValue * 100).toFixed(1)}%) exceeds threshold (${(threshold * 100).toFixed(1)}%) by ${ratio}%`;
      case 'memory_usage':
        return `Memory usage (${(currentValue / 1024 / 1024).toFixed(1)}MB) exceeds threshold (${(threshold / 1024 / 1024).toFixed(1)}MB) by ${ratio}%`;
      case 'system_health':
        return `System health degraded - performance metrics indicate issues`;
      default:
        return `${type} threshold exceeded`;
    }
  }

  /**
   * Calculate trend direction for metrics
   */
  private calculateTrendDirection(type: PerformanceAlert['type']): 'increasing' | 'decreasing' | 'stable' {
    const recentTrends = this.performanceMetrics.performanceTrends.slice(-10);

    if (recentTrends.length < 2) return 'stable';

    let values: number[] = [];
    switch (type) {
      case 'response_time':
        values = recentTrends.map(t => t.responseTime);
        break;
      case 'error_rate':
        values = recentTrends.map(t => t.errorRate);
        break;
      case 'memory_usage':
        values = recentTrends.map(t => t.memoryUsage);
        break;
      default:
        return 'stable';
    }

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = (secondAvg - firstAvg) / firstAvg;

    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  /**
   * Generate recommendations for performance alerts
   */
  private generateAlertRecommendations(type: PerformanceAlert['type'], currentValue: number, threshold: number): string[] {
    const recommendations: string[] = [];

    switch (type) {
      case 'response_time':
        recommendations.push('Consider optimizing database queries');
        recommendations.push('Check system resource utilization');
        recommendations.push('Review search strategy configurations');
        break;
      case 'error_rate':
        recommendations.push('Investigate recent error patterns');
        recommendations.push('Check system logs for error details');
        recommendations.push('Consider disabling problematic search strategies');
        break;
      case 'memory_usage':
        recommendations.push('Monitor for memory leaks');
        recommendations.push('Consider increasing system memory');
        recommendations.push('Review caching strategies');
        break;
      case 'system_health':
        recommendations.push('Run comprehensive system health check');
        recommendations.push('Review recent configuration changes');
        recommendations.push('Check external dependencies');
        break;
    }

    return recommendations;
  }

  /**
   * Generate optimization recommendations
   */
  private generateOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.performanceMetrics.averageResponseTime > 2000) {
      recommendations.push('Response times are high - consider query optimization');
    }

    const errorRate = this.performanceMetrics.totalQueries > 0 ?
      this.performanceMetrics.failedQueries / this.performanceMetrics.totalQueries : 0;
    if (errorRate > 0.05) {
      recommendations.push('Error rate is elevated - investigate failing strategies');
    }

    const memoryUsageMB = this.performanceMetrics.memoryUsage / 1024 / 1024;
    if (memoryUsageMB > 500) {
      recommendations.push('Memory usage is high - consider optimizing memory-intensive operations');
    }

    const strategyUsage = this.calculateStrategyUsagePercentages();
    const slowestStrategy = Object.entries(strategyUsage)
      .sort(([, a], [, b]) => b - a)[0];

    if (slowestStrategy && strategyUsage[slowestStrategy[0] as SearchStrategy] > 50) {
      recommendations.push(`Strategy ${slowestStrategy[0]} is heavily used - consider load balancing`);
    }

    return recommendations;
  }

  /**
   * Get dashboard data for performance monitoring UI
   */
  getDashboardData(): DashboardData {
    return {
      currentMetrics: this.getCurrentPerformanceMetrics(),
      historicalData: this.getHistoricalPerformanceData(),
      strategyComparison: this.getStrategyPerformanceComparison(),
      errorAnalysis: this.getErrorAnalysis(),
      optimizationSuggestions: this.getOptimizationSuggestions(),
      systemHealth: this.getSystemHealthStatus(),
      lastUpdated: new Date()
    };
  }

  /**
   * Get current performance metrics
   */
  private getCurrentPerformanceMetrics() {
    return {
      totalQueries: this.performanceMetrics.totalQueries,
      averageResponseTime: this.performanceMetrics.averageResponseTime,
      memoryUsage: this.performanceMetrics.memoryUsage,
      errorRate: this.performanceMetrics.totalQueries > 0 ?
        this.performanceMetrics.failedQueries / this.performanceMetrics.totalQueries : 0,
    };
  }

  /**
   * Get historical performance data
   */
  private getHistoricalPerformanceData() {
    const recentTrends = this.performanceMetrics.performanceTrends.slice(-50);

    return {
      responseTimeHistory: recentTrends.map(trend => ({
        timestamp: new Date(trend.timestamp),
        value: trend.responseTime,
      })),
      memoryUsageHistory: recentTrends.map(trend => ({
        timestamp: new Date(trend.timestamp),
        value: trend.memoryUsage,
      })),
      queryVolumeHistory: recentTrends.map(trend => ({
        timestamp: new Date(trend.timestamp),
        value: trend.queryCount,
      })),
    };
  }

  /**
   * Get strategy performance comparison
   */
  private getStrategyPerformanceComparison() {
    const comparison = [];

    for (const [strategy, usage] of this.performanceMetrics.strategyUsage) {
      const usagePercentage = this.performanceMetrics.totalQueries > 0 ? (usage / this.performanceMetrics.totalQueries) * 100 : 0;
      const strategyTrends = this.performanceMetrics.performanceTrends.filter(t => t.strategy === strategy);

      comparison.push({
        strategy,
        usagePercentage,
        averageResponseTime: strategyTrends.length > 0 ?
          strategyTrends.reduce((sum, t) => sum + t.responseTime, 0) / strategyTrends.length : 0,
        successRate: this.calculateStrategySuccessRate(strategy),
      });
    }

    return comparison.sort((a, b) => b.usagePercentage - a.usagePercentage);
  }

  /**
   * Calculate success rate for a specific strategy
   */
  private calculateStrategySuccessRate(strategy: SearchStrategy): number {
    return this.performanceMetrics.totalQueries > 0 ?
      this.performanceMetrics.successfulQueries / this.performanceMetrics.totalQueries : 0;
  }

  /**
   * Get error analysis data
   */
  private getErrorAnalysis() {
    const topErrors = this.getTopErrors();

    return topErrors.map(error => ({
      error: error.error,
      count: error.count,
      trend: this.calculateErrorTrend(error.error),
    }));
  }

  /**
   * Calculate error trend for specific error
   */
  private calculateErrorTrend(errorType: string): 'increasing' | 'decreasing' | 'stable' {
    const recentTrends = this.performanceMetrics.performanceTrends.slice(-20);
    const olderTrends = this.performanceMetrics.performanceTrends.slice(-40, -20);

    const recentErrorRate = recentTrends.length > 0 ?
      recentTrends.reduce((sum, t) => sum + t.errorRate, 0) / recentTrends.length : 0;
    const olderErrorRate = olderTrends.length > 0 ?
      olderTrends.reduce((sum, t) => sum + t.errorRate, 0) / olderTrends.length : 0;

    if (recentErrorRate > olderErrorRate * 1.2) return 'increasing';
    if (recentErrorRate < olderErrorRate * 0.8) return 'decreasing';
    return 'stable';
  }

  /**
   * Get optimization suggestions
   */
  private getOptimizationSuggestions(): string[] {
    return this.generateOptimizationRecommendations();
  }

  /**
   * Get system health status
   */
  private getSystemHealthStatus(): 'healthy' | 'degraded' | 'critical' {
    const errorRate = this.performanceMetrics.totalQueries > 0 ?
      this.performanceMetrics.failedQueries / this.performanceMetrics.totalQueries : 0;
    const memoryUsageRatio = this.performanceMetrics.memoryUsage / this.performanceMonitoringConfig.alertThresholds.maxMemoryUsage;
    const responseTimeRatio = this.performanceMetrics.averageResponseTime / this.performanceMonitoringConfig.alertThresholds.maxResponseTime;

    if (errorRate > 0.2 || memoryUsageRatio > 2 || responseTimeRatio > 3) {
      return 'critical';
    }

    if (errorRate > 0.1 || memoryUsageRatio > 1.5 || responseTimeRatio > 2) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Add performance alert callback
   */
  addPerformanceAlertCallback(callback: (alert: PerformanceAlert) => void): void {
    this.performanceAlertCallbacks.push(callback);
  }

  /**
   * Remove performance alert callback
   */
  removePerformanceAlertCallback(callback: (alert: PerformanceAlert) => void): void {
    const index = this.performanceAlertCallbacks.indexOf(callback);
    if (index > -1) {
      this.performanceAlertCallbacks.splice(index, 1);
    }
  }

  /**
   * Update performance monitoring configuration
   */
  updatePerformanceMonitoringConfig(config: Partial<PerformanceMonitoringConfig>): void {
    this.performanceMonitoringConfig = { ...this.performanceMonitoringConfig, ...config };

    if (config.enabled !== undefined) {
      if (config.enabled) {
        this.startPerformanceMonitoring();
      } else {
        if (this.performanceCollectionTimer) {
          clearInterval(this.performanceCollectionTimer);
          this.performanceCollectionTimer = undefined;
        }
      }
    }
  }

  /**
   * Calculate query complexity for performance tracking
   */
  calculateQueryComplexity(query: { text?: string; filters?: any; limit?: number; offset?: number }): number {
    let complexity = 1;

    if (query.text) {
      const words = query.text.split(/\s+/).length;
      complexity += Math.min(words / 10, 5);

      const booleanOperators = (query.text.match(/\b(AND|OR|NOT)\b/gi) || []).length;
      complexity += booleanOperators * 0.5;

      const phraseSearches = (query.text.match(/"[^"]*"/g) || []).length;
      complexity += phraseSearches * 0.3;
    }

    if (query.filters) {
      const filterCount = Object.keys(query.filters).length;
      complexity += filterCount * 0.2;
    }

    if (query.limit && query.limit > 10) complexity += 0.1;
    if (query.offset && query.offset > 0) complexity += 0.1;

    return Math.min(complexity, 10);
  }

  /**
   * Get performance monitoring configuration
   */
  getPerformanceMonitoringConfig(): PerformanceMonitoringConfig {
    return { ...this.performanceMonitoringConfig };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Update performance metrics with query time
   */
  updatePerformanceMetrics(queryTime: number): void {
    this.performanceMetrics.totalQueries++;
    this.performanceMetrics.averageQueryTime = queryTime;

    const currentAvg = this.performanceMetrics.averageResponseTime;
    const totalTime = currentAvg * (this.performanceMetrics.totalQueries - 1) + queryTime;
    this.performanceMetrics.averageResponseTime = totalTime / this.performanceMetrics.totalQueries;
  }

  /**
   * Update maintenance check metrics
   */
  updateMaintenanceCheckMetrics(): void {
    this.performanceMetrics.maintenanceCheckCount++;
    this.performanceMetrics.lastMaintenanceCheck = new Date();
  }

  /**
   * Record error for tracking with enhanced categorization
   */
  recordError(errorType: string, context?: { strategy?: string; operation?: string; severity?: string }): void {
    const currentCount = this.performanceMetrics.errorCounts.get(errorType) || 0;
    this.performanceMetrics.errorCounts.set(errorType, currentCount + 1);

    // Log error with context for better debugging
    logWarn(`Performance monitor recorded error: ${errorType}`, {
      component: 'SearchPerformanceMonitor',
      operation: 'recordError',
      errorType,
      context,
      totalErrors: currentCount + 1,
      timestamp: new Date().toISOString()
    });
  }
}