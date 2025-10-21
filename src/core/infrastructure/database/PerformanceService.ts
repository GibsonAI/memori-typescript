import { PerformanceMetrics, PerformanceTrend } from '@/core/types/base';
import { DatabaseOperationMetrics, DatabasePerformanceConfig } from './types';

// Node.js process for memory usage monitoring
declare const process: {
  memoryUsage(): { heapUsed: number };
};

/**
 * PerformanceService - Handles all database performance monitoring and analytics
 *
 * Extracted from DatabaseManager to follow Single Responsibility Principle
 */
export class PerformanceService {
  private performanceMetrics: {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageOperationTime: number;
    lastOperationTime: Date;
    errorRate: number;
    memoryUsage: number;
    peakMemoryUsage: number;
    operationBreakdown: Map<string, number>;
    errorBreakdown: Map<string, number>;
    trends: PerformanceTrend[];
    metadata: {
      component: string;
      databaseType: string;
      connectionCount: number;
      queryLatency: number;
      slowQueries: Array<{ query: string; duration: number; timestamp: number }>;
    };
  };

  private performanceConfig: DatabasePerformanceConfig;
  private operationMetrics: DatabaseOperationMetrics[] = [];
  private maxOperationHistory: number = 1000;

  constructor(config?: Partial<DatabasePerformanceConfig>) {
    this.performanceConfig = {
      enabled: true,
      slowQueryThreshold: 1000,
      trackSlowQueries: true,
      maxSlowQueryHistory: 100,
      enableQueryAnalysis: true,
      collectionInterval: 60000,
      ...config,
    };

    this.performanceMetrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageOperationTime: 0,
      lastOperationTime: new Date(),
      errorRate: 0,
      memoryUsage: 0,
      peakMemoryUsage: 0,
      operationBreakdown: new Map<string, number>(),
      errorBreakdown: new Map<string, number>(),
      trends: [],
      metadata: {
        component: 'PerformanceService',
        databaseType: 'sqlite',
        connectionCount: 0,
        queryLatency: 0,
        slowQueries: [],
      },
    };
  }

  /**
   * Record database operation performance metrics
   */
  recordOperationMetrics(metrics: DatabaseOperationMetrics): void {
    const endTime = Date.now();
    metrics.endTime = endTime;
    metrics.duration = endTime - metrics.startTime;

    // Update aggregate metrics
    this.performanceMetrics.totalOperations++;
    if (metrics.success) {
      this.performanceMetrics.successfulOperations++;
    } else {
      this.performanceMetrics.failedOperations++;
    }
    this.performanceMetrics.lastOperationTime = new Date(endTime);

    // Update operation type counts
    const currentCount = this.performanceMetrics.operationBreakdown.get(metrics.operationType) || 0;
    this.performanceMetrics.operationBreakdown.set(metrics.operationType, currentCount + 1);

    // Update average operation time
    this.performanceMetrics.averageOperationTime =
      (this.performanceMetrics.averageOperationTime * (this.performanceMetrics.totalOperations - 1) + (metrics.duration || 0)) /
      this.performanceMetrics.totalOperations;

    // Track slow queries
    if (this.performanceConfig.trackSlowQueries && (metrics.duration || 0) > this.performanceConfig.slowQueryThreshold) {
      this.trackSlowQuery({
        query: `${metrics.operationType}${metrics.tableName ? `_${metrics.tableName}` : ''}`,
        duration: metrics.duration || 0,
        timestamp: endTime,
      });
    }

    // Update query latency (exponential moving average)
    const currentLatency = this.performanceMetrics.metadata?.queryLatency || 0;
    const newLatency = (currentLatency * 0.9) + ((metrics.duration || 0) * 0.1);
    this.performanceMetrics.metadata = {
      ...this.performanceMetrics.metadata,
      queryLatency: newLatency,
    };

    // Update memory usage (with environment compatibility)
    let memoryUsage = 0;
    try {
      // Check if we're in a Node.js environment with process available
      if (typeof process !== 'undefined' && process.memoryUsage) {
        memoryUsage = process.memoryUsage().heapUsed;
      } else if (typeof performance !== 'undefined') {
        // Browser environment fallback - cast to any to avoid TypeScript issues
        const perf = performance as any;
        if (perf.memory && perf.memory.usedJSHeapSize) {
          memoryUsage = perf.memory.usedJSHeapSize;
        }
      }
    } catch (error) {
      // Silently handle environments where memory usage is not available
      memoryUsage = 0;
    }
    this.performanceMetrics.memoryUsage = memoryUsage;

    // Track errors
    if (!metrics.success && metrics.error) {
      const currentErrorCount = this.performanceMetrics.errorBreakdown.get(metrics.error) || 0;
      this.performanceMetrics.errorBreakdown.set(metrics.error, currentErrorCount + 1);
    }

    // Store operation history
    this.operationMetrics.unshift(metrics);
    if (this.operationMetrics.length > this.maxOperationHistory) {
      this.operationMetrics = this.operationMetrics.slice(0, this.maxOperationHistory);
    }
  }

  /**
   * Track slow queries for performance analysis
   */
  private trackSlowQuery(slowQuery: { query: string; duration: number; timestamp: number }): void {
    const slowQueries = this.performanceMetrics.metadata?.slowQueries || [];
    slowQueries.unshift(slowQuery);
    if (slowQueries.length > this.performanceConfig.maxSlowQueryHistory) {
      slowQueries.splice(this.performanceConfig.maxSlowQueryHistory);
    }
    this.performanceMetrics.metadata = {
      ...this.performanceMetrics.metadata,
      slowQueries,
    };
  }

  /**
   * Get database performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get recent database operation metrics
   */
  getRecentOperationMetrics(limit: number = 100): DatabaseOperationMetrics[] {
    return this.operationMetrics.slice(0, limit);
  }

  /**
   * Get database performance analytics
   */
  getPerformanceAnalytics(): {
    averageLatency: number;
    errorRate: number;
    slowQueryCount: number;
    operationBreakdown: Record<string, number>;
    topErrors: Array<{ error: string; count: number }>;
    slowQueries: Array<{ query: string; duration: number; timestamp: number }>;
    memoryUsage: number;
    connectionStatus: string;
  } {
    const totalOps = this.performanceMetrics.totalOperations;
    const errorRate = totalOps > 0 ?
      Array.from(this.performanceMetrics.errorBreakdown.values()).reduce((sum: number, count: number) => sum + count, 0) / totalOps : 0;

    // Generate operation breakdown
    const operationBreakdown: Record<string, number> = {};
    for (const [opType, count] of this.performanceMetrics.operationBreakdown) {
      operationBreakdown[opType] = (count / totalOps) * 100;
    }

    // Get top errors
    const topErrors = Array.from(this.performanceMetrics.errorBreakdown.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([error, count]) => ({ error, count }));

    const slowQueries = this.performanceMetrics.metadata?.slowQueries || [];

    return {
      averageLatency: this.performanceMetrics.averageOperationTime,
      errorRate,
      slowQueryCount: slowQueries.length,
      operationBreakdown,
      topErrors,
      slowQueries: [...slowQueries],
      memoryUsage: this.performanceMetrics.memoryUsage,
      connectionStatus: this.isConnected() ? 'connected' : 'disconnected',
    };
  }

  /**
   * Get database performance report
   */
  getDatabasePerformanceReport(): {
    summary: {
      totalOperations: number;
      averageLatency: number;
      errorRate: number;
      memoryUsage: number;
      connectionCount: number;
    };
    performanceByOperation: Record<string, { count: number; averageLatency: number; errorRate: number }>;
    slowQueries: Array<{ query: string; duration: number; timestamp: number }>;
    recommendations: string[];
    timestamp: Date;
  } {
    const analytics = this.getPerformanceAnalytics();
    const performanceByOperation: Record<string, { count: number; averageLatency: number; errorRate: number }> = {};

    // Calculate performance by operation type
    for (const [opType, count] of this.performanceMetrics.operationBreakdown) {
      const opMetrics = this.operationMetrics.filter(m => m.operationType === opType);
      const errorCount = opMetrics.filter(m => !m.success).length;
      const avgLatency = opMetrics.length > 0 ?
        opMetrics.reduce((sum, m) => sum + (m.duration || 0), 0) / opMetrics.length : 0;

      performanceByOperation[opType] = {
        count,
        averageLatency: avgLatency,
        errorRate: count > 0 ? errorCount / count : 0,
      };
    }

    // Generate recommendations
    const recommendations = this.generateDatabasePerformanceRecommendations(analytics);

    const connectionCount = this.performanceMetrics.metadata?.connectionCount || 0;

    return {
      summary: {
        totalOperations: this.performanceMetrics.totalOperations,
        averageLatency: analytics.averageLatency,
        errorRate: analytics.errorRate,
        memoryUsage: analytics.memoryUsage,
        connectionCount,
      },
      performanceByOperation,
      slowQueries: analytics.slowQueries,
      recommendations,
      timestamp: new Date(),
    };
  }

  /**
   * Generate database performance recommendations
   */
  private generateDatabasePerformanceRecommendations(analytics: ReturnType<typeof this.getPerformanceAnalytics>): string[] {
    const recommendations: string[] = [];

    // High latency recommendations
    if (analytics.averageLatency > 1000) {
      recommendations.push('Database operations are slow - consider query optimization');
      recommendations.push('Check database indexes and table fragmentation');
      recommendations.push('Monitor system resource usage (CPU, disk I/O)');
    }

    // High error rate recommendations
    if (analytics.errorRate > 0.05) {
      recommendations.push('High error rate detected - check database connectivity');
      const topError = analytics.topErrors[0];
      if (topError) {
        recommendations.push(`Most common error: ${topError.error} - investigate database logs`);
      }
    }

    // Slow queries recommendations
    if (analytics.slowQueryCount > 10) {
      recommendations.push('Multiple slow queries detected - review query patterns');
      recommendations.push('Consider adding database indexes for frequently queried fields');
      recommendations.push('Check for missing indexes on search and filter operations');
    }

    // Memory usage recommendations
    const memoryUsageMB = analytics.memoryUsage / 1024 / 1024;
    if (memoryUsageMB > 200) {
      recommendations.push('High memory usage detected - monitor for memory leaks');
      recommendations.push('Consider optimizing large result set handling');
    }

    // Connection issues
    if (analytics.connectionStatus !== 'connected') {
      recommendations.push('Database connection issues detected - check connection configuration');
      recommendations.push('Verify database server availability and credentials');
    }

    return recommendations;
  }

  /**
   * Get database performance monitoring status
   */
  getPerformanceMonitoringStatus(): {
    enabled: boolean;
    totalOperations: number;
    averageLatency: number;
    errorRate: number;
    slowQueryCount: number;
    memoryUsage: number;
    lastOperationTime: number;
  } {
    return {
      enabled: this.performanceConfig.enabled,
      totalOperations: this.performanceMetrics.totalOperations,
      averageLatency: this.performanceMetrics.averageOperationTime,
      errorRate: this.performanceMetrics.totalOperations > 0 ?
        Array.from(this.performanceMetrics.errorBreakdown.values()).reduce((sum: number, count: number) => sum + count, 0) / this.performanceMetrics.totalOperations : 0,
      slowQueryCount: (this.performanceMetrics.metadata?.slowQueries || []).length,
      memoryUsage: this.performanceMetrics.memoryUsage,
      lastOperationTime: this.performanceMetrics.lastOperationTime.getTime(),
    };
  }

  /**
   * Update database performance monitoring configuration
   */
  updatePerformanceMonitoringConfig(config: Partial<DatabasePerformanceConfig>): void {
    this.performanceConfig = { ...this.performanceConfig, ...config };
  }

  /**
   * Get database performance monitoring configuration
   */
  getPerformanceMonitoringConfig(): DatabasePerformanceConfig {
    return { ...this.performanceConfig };
  }

  /**
   * Clear database performance metrics
   */
  clearPerformanceMetrics(): void {
    this.performanceMetrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageOperationTime: 0,
      lastOperationTime: new Date(),
      errorRate: 0,
      memoryUsage: 0,
      peakMemoryUsage: 0,
      operationBreakdown: new Map<string, number>(),
      errorBreakdown: new Map<string, number>(),
      trends: [],
      metadata: {
        component: 'PerformanceService',
        databaseType: 'sqlite',
        connectionCount: 0,
        queryLatency: 0,
        slowQueries: [],
      },
    };
    this.operationMetrics = [];
  }

  /**
   * Check if database is connected (for performance monitoring)
   */
  private isConnected(): boolean {
    // Simple check - try to execute a simple query
    return true; // Placeholder - would need actual connection check
  }
}