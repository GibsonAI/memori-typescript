/**
 * DatabaseContext - Foundation class for shared database state and configuration
 *
 * This class manages the core database infrastructure that all database managers
 * depend on, following the Single Responsibility Principle by focusing solely on:
 * - PrismaClient lifecycle management
 * - Shared configuration and connection state
 * - Performance monitoring infrastructure
 * - FTS5 support coordination
 * - Dependency injection for managers
 *
 * Other managers (ChatHistoryManager, MemoryManager, etc.) will depend on this
 * context for their database operations.
 */

import { PrismaClient } from '@prisma/client';
import { DatabasePerformanceConfig, DatabaseOperationMetrics } from './types';
import { logInfo, logError } from '../../infrastructure/config/Logger';
import { ProcessingStateManager } from '../../domain/memory/MemoryProcessingStateManager';
import { PerformanceMetrics } from '../../types/base';

/**
 * Database context configuration interface
 */
export interface DatabaseContextConfig {
  databaseUrl: string;
  enablePerformanceMonitoring?: boolean;
  enableFTS?: boolean;
  performanceConfig?: Partial<DatabasePerformanceConfig>;
  stateManagerConfig?: {
    enableHistoryTracking?: boolean;
    enableMetrics?: boolean;
    maxHistoryEntries?: number;
  };
}

/**
 * Manager interface for dependency injection pattern
 */
export interface DatabaseManager {
  initializeAsync?(): Promise<void>;
  cleanup?(): void;
}

/**
 * DatabaseContext - Core database infrastructure class
 *
 * Provides shared database state and configuration that all database managers
 * depend on. This class follows cognitive load optimization principles by
 * maintaining a simple, predictable interface while providing comprehensive
 * database infrastructure management.
 */
export class DatabaseContext {
  private prisma: PrismaClient;
  private ftsEnabled: boolean = false;
  private stateManager: ProcessingStateManager;
  private managers: Map<string, DatabaseManager> = new Map();

  // Performance monitoring
  private performanceMetrics: PerformanceMetrics = {
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
      component: 'DatabaseContext',
      databaseType: 'sqlite',
      connectionCount: 0,
      queryLatency: 0,
      slowQueries: [],
    },
  };

  private operationMetrics: DatabaseOperationMetrics[] = [];
  private maxOperationHistory = 1000;

  private performanceConfig: DatabasePerformanceConfig = {
    enabled: true,
    slowQueryThreshold: 1000,
    trackSlowQueries: true,
    maxSlowQueryHistory: 100,
    enableQueryAnalysis: true,
    collectionInterval: 60000,
  };

  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private isShuttingDown: boolean = false;

  constructor(config: DatabaseContextConfig) {
    // Initialize PrismaClient with database URL
    // Disable Prisma logging in test environments to prevent async logging warnings
    const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    this.prisma = new PrismaClient({
      datasourceUrl: config.databaseUrl,
      log: (config.enablePerformanceMonitoring !== false && !isTestEnvironment) ? ['error', 'warn'] : [],
    });

    // Configure performance monitoring
    if (config.enablePerformanceMonitoring !== false) {
      this.performanceConfig = {
        ...this.performanceConfig,
        ...config.performanceConfig,
      };
    } else {
      this.performanceConfig.enabled = false;
    }

    // Initialize state manager for memory processing coordination
    this.stateManager = new ProcessingStateManager({
      enableHistoryTracking: config.stateManagerConfig?.enableHistoryTracking ?? true,
      enableMetrics: config.stateManagerConfig?.enableMetrics ?? true,
      maxHistoryEntries: config.stateManagerConfig?.maxHistoryEntries ?? 100,
    });

    // Start health monitoring if performance monitoring is enabled
    if (this.performanceConfig.enabled) {
      this.startHealthMonitoring();
    }

    logInfo('DatabaseContext initialized', {
      component: 'DatabaseContext',
      performanceMonitoring: this.performanceConfig.enabled,
      ftsSupport: config.enableFTS ?? true,
    });
  }

  /**
   * Get PrismaClient instance for database operations
   */
  getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  /**
   * Get processing state manager for memory state coordination
   */
  getStateManager(): ProcessingStateManager {
    return this.stateManager;
  }

  /**
   * Check if FTS5 search support is enabled
   */
  isFTSEnabled(): boolean {
    return this.ftsEnabled;
  }

  /**
   * Get current FTS status with detailed information
   */
  async getFTSStatus(): Promise<{
    enabled: boolean;
    isValid: boolean;
    issues: string[];
    stats: { tables: number; triggers: number; indexes: number };
  }> {
    try {
      if (!this.ftsEnabled) {
        return {
          enabled: false,
          isValid: false,
          issues: ['FTS5 support not initialized'],
          stats: { tables: 0, triggers: 0, indexes: 0 },
        };
      }

      // Verify FTS schema if available
      try {
        const verification = await this.verifyFTSSchema();
        return {
          enabled: this.ftsEnabled,
          isValid: verification.isValid,
          issues: verification.issues,
          stats: verification.stats,
        };
      } catch (error) {
        return {
          enabled: this.ftsEnabled,
          isValid: false,
          issues: [`FTS verification failed: ${error instanceof Error ? error.message : String(error)}`],
          stats: { tables: 0, triggers: 0, indexes: 0 },
        };
      }
    } catch (error) {
      return {
        enabled: false,
        isValid: false,
        issues: [`FTS status check failed: ${error instanceof Error ? error.message : String(error)}`],
        stats: { tables: 0, triggers: 0, indexes: 0 },
      };
    }
  }

  /**
   * Initialize FTS5 support for full-text search
   */
  async initializeFTSSupport(): Promise<void> {
    if (this.ftsEnabled) {
      return;
    }
    const startTime = Date.now();

    try {
      logInfo('Initializing FTS5 search support', {
        component: 'DatabaseContext',
        initializationInProgress: true,
        ftsInitializationInProgress: true,
      });

      // Import initialization functions dynamically to avoid circular dependencies
      const { initializeSearchSchema, verifyFTSSchema } = await import('./init-search-schema');

      // FTS5 support is now checked using PRAGMA compile_options in initializeSearchSchema

      // Initialize the FTS5 schema
      const schemaInitialized = await initializeSearchSchema(this.prisma);

      if (!schemaInitialized) {
        throw new Error('Failed to initialize FTS5 schema');
      }

      // Create FTS triggers for synchronization
      await this.createFTSTriggers();

      // Verify the FTS table and triggers were created successfully
      const verification = await verifyFTSSchema(this.prisma);
      if (!verification.isValid) {
        throw new Error(`FTS5 verification failed: ${verification.issues.join(', ')}`);
      }

      this.ftsEnabled = true;
      const duration = Date.now() - startTime;

      logInfo('FTS5 search support initialized successfully', {
        component: 'DatabaseContext',
        duration,
        tables: verification.stats.tables,
        triggers: verification.stats.triggers,
        indexes: verification.stats.indexes,
      });

      // Record initialization metrics
      if (this.performanceConfig.enabled) {
        this.recordOperationMetrics({
          operationType: 'fts_initialization',
          startTime,
          success: true,
          duration,
        });
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      this.ftsEnabled = false;

      logError('Failed to initialize FTS5 search support', {
        component: 'DatabaseContext',
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      // Record failed initialization metrics
      if (this.performanceConfig.enabled) {
        this.recordOperationMetrics({
          operationType: 'fts_initialization',
          startTime,
          success: false,
          duration,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      throw error;
    }
  }

  /**
   * Register a database manager for dependency injection
   */
  registerManager(name: string, manager: DatabaseManager): void {
    if (this.managers.has(name)) {
      logInfo(`Replacing existing manager: ${name}`, {
        component: 'DatabaseContext',
        managerName: name,
      });
    }

    this.managers.set(name, manager);

    logInfo(`Registered database manager: ${name}`, {
      component: 'DatabaseContext',
      managerName: name,
      totalManagers: this.managers.size,
    });
  }

  /**
   * Get registered manager by name
   */
  getManager<T extends DatabaseManager>(name: string): T | undefined {
    return this.managers.get(name) as T | undefined;
  }

  /**
   * Initialize all registered managers
   */
  async initializeManagers(): Promise<void> {
    const managerNames = Array.from(this.managers.keys());
    logInfo('Initializing registered database managers', {
      component: 'DatabaseContext',
      managers: managerNames,
      count: managerNames.length,
    });

    const results = await Promise.allSettled(
      managerNames.map(async (name) => {
        const manager = this.managers.get(name);
        if (manager?.initializeAsync) {
          await manager.initializeAsync();
        }
      }),
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - successful;

    logInfo('Database managers initialization completed', {
      component: 'DatabaseContext',
      total: results.length,
      successful,
      failed,
    });

    if (failed > 0) {
      const failures = results
        .map((r, i) => r.status === 'rejected' ? `${managerNames[i]}: ${r.reason}` : null)
        .filter(Boolean);

      logError('Some database managers failed to initialize', {
        component: 'DatabaseContext',
        failures,
        failedCount: failed,
      });
    }
  }

  /**
    * Cleanup all registered managers and resources
    */
   async cleanup(): Promise<void> {
     if (this.isShuttingDown) {
       return;
     }

     // FTS initialization is now handled lazily when FTS strategy is created

     this.isShuttingDown = true;
     const startTime = Date.now();

     logInfo('Starting DatabaseContext cleanup', {
       component: 'DatabaseContext',
       managersCount: this.managers.size,
     });

     try {
       // Stop health monitoring first
       if (this.healthCheckInterval) {
         clearInterval(this.healthCheckInterval);
         this.healthCheckInterval = undefined;
       }

       // Cleanup managers in reverse order, but skip FTS-related cleanup if still initializing
       const managerNames = Array.from(this.managers.keys());
       for (const name of managerNames.reverse()) {
         try {
           const manager = this.managers.get(name);
           if (manager?.cleanup) {
             manager.cleanup();
           }
         } catch (error) {
           logError(`Failed to cleanup manager: ${name}`, {
             component: 'DatabaseContext',
             managerName: name,
             error: error instanceof Error ? error.message : String(error),
           });
         }
       }

       // Disconnect Prisma client only if not already disconnecting
       try {
         if (this.prisma) {
           await this.prisma.$disconnect();
         }
       } catch (disconnectError) {
         // Log but don't fail - disconnect errors during cleanup are common
         logInfo('Prisma disconnect during cleanup', {
           component: 'DatabaseContext',
           error: disconnectError instanceof Error ? disconnectError.message : String(disconnectError),
         });
       }

       const duration = Date.now() - startTime;
       logInfo('DatabaseContext cleanup completed', {
         component: 'DatabaseContext',
         duration,
         managersCleaned: managerNames.length,
       });

     } catch (error) {
       const duration = Date.now() - startTime;
       logError('DatabaseContext cleanup failed', {
         component: 'DatabaseContext',
         error: error instanceof Error ? error.message : String(error),
         duration,
       });
       // Don't rethrow cleanup errors to prevent cascading failures
     }
   }

  /**
   * Get database performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get recent operation metrics
   */
  getRecentOperationMetrics(limit: number = 100): DatabaseOperationMetrics[] {
    return this.operationMetrics.slice(0, limit);
  }

  /**
   * Get performance analytics summary
   */
  getPerformanceAnalytics(): {
    averageLatency: number;
    errorRate: number;
    slowQueryCount: number;
    operationBreakdown: Record<string, number>;
    topErrors: Array<{ error: string; count: number }>;
    memoryUsage: number;
    connectionStatus: string;
  } {
    const totalOps = this.performanceMetrics.totalOperations;
    const errorRate = totalOps > 0 ?
      Array.from(this.performanceMetrics.errorBreakdown.values()).reduce((sum: number, count: number) => sum + count, 0) / totalOps : 0;

    // Generate operation breakdown as percentages
    const operationBreakdown: Record<string, number> = {};
    for (const [opType, count] of this.performanceMetrics.operationBreakdown) {
      operationBreakdown[opType] = totalOps > 0 ? (count / totalOps) * 100 : 0;
    }

    // Get top errors
    const topErrors = Array.from(this.performanceMetrics.errorBreakdown.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([error, count]) => ({ error, count }));

    const slowQueries = this.performanceMetrics.metadata?.slowQueries as Array<{ query: string; duration: number; timestamp: number }> || [];

    return {
      averageLatency: this.performanceMetrics.averageOperationTime,
      errorRate,
      slowQueryCount: slowQueries.length,
      operationBreakdown,
      topErrors,
      memoryUsage: this.performanceMetrics.memoryUsage,
      connectionStatus: this.isConnected() ? 'connected' : 'disconnected',
    };
  }

  /**
   * Health check for database connectivity
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded';
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // Simple connectivity check
      await this.prisma.$queryRaw`SELECT 1`;

      const responseTime = Date.now() - startTime;
      const status = responseTime < 100 ? 'healthy' : responseTime < 500 ? 'degraded' : 'unhealthy';

      return { status, responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update performance monitoring configuration
   */
  updatePerformanceMonitoringConfig(config: Partial<DatabasePerformanceConfig>): void {
    this.performanceConfig = { ...this.performanceConfig, ...config };

    if (config.enabled === false) {
      this.stopHealthMonitoring();
    } else if (config.enabled === true && !this.healthCheckInterval) {
      this.startHealthMonitoring();
    }

    logInfo('Updated performance monitoring configuration', {
      component: 'DatabaseContext',
      enabled: this.performanceConfig.enabled,
      slowQueryThreshold: this.performanceConfig.slowQueryThreshold,
    });
  }

  /**
   * Get current performance monitoring configuration
   */
  getPerformanceMonitoringConfig(): DatabasePerformanceConfig {
    return { ...this.performanceConfig };
  }

  /**
   * Record operation metrics for performance monitoring
   */
  recordOperationMetrics(metrics: DatabaseOperationMetrics): void {
    if (!this.performanceConfig.enabled) {
      return;
    }

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
      (this.performanceMetrics.averageOperationTime * (this.performanceMetrics.totalOperations - 1) + metrics.duration!) /
      this.performanceMetrics.totalOperations;

    // Track slow queries
    if (this.performanceConfig.trackSlowQueries && metrics.duration! > this.performanceConfig.slowQueryThreshold) {
      this.trackSlowQuery({
        query: `${metrics.operationType}${metrics.tableName ? `_${metrics.tableName}` : ''}`,
        duration: metrics.duration!,
        timestamp: endTime,
      });
    }

    // Update query latency (exponential moving average)
    const currentLatency = this.performanceMetrics.metadata?.queryLatency as number || 0;
    const newLatency = (currentLatency * 0.9) + (metrics.duration! * 0.1);
    this.performanceMetrics.metadata = {
      ...this.performanceMetrics.metadata,
      queryLatency: newLatency,
    };

    // Update memory usage
    const currentMemory = process.memoryUsage();
    this.performanceMetrics.memoryUsage = currentMemory.heapUsed;
    if (currentMemory.heapUsed > this.performanceMetrics.peakMemoryUsage) {
      this.performanceMetrics.peakMemoryUsage = currentMemory.heapUsed;
    }

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
   * Private helper methods
   */

  private async verifyFTSSchema(): Promise<{
    isValid: boolean;
    issues: string[];
    stats: { tables: number; triggers: number; indexes: number };
  }> {
    const issues: string[] = [];
    let tables = 0;
    let triggers = 0;
    let indexes = 0;

    try {
      // Check if memory_fts table exists
      const tableResult = await this.prisma.$queryRaw`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name='memory_fts'
  `;

      if (Array.isArray(tableResult) && tableResult.length > 0) {
        tables = 1;
      } else {
        issues.push('memory_fts table not found');
      }

      // Count FTS-related triggers
      const triggerResult = await this.prisma.$queryRaw`
  SELECT COUNT(*) as count FROM sqlite_master
  WHERE type='trigger' AND name LIKE 'memory_fts_%'
  `;

      if (Array.isArray(triggerResult) && triggerResult.length > 0) {
        triggers = (triggerResult[0] as any)?.count || 0;
      }

      // Check for FTS indexes
      const indexResult = await this.prisma.$queryRaw`
  SELECT COUNT(*) as count FROM pragma_index_list('memory_fts')
  `;

      if (Array.isArray(indexResult) && indexResult.length > 0) {
        indexes = (indexResult[0] as any)?.count || 0;
      }

    } catch (error) {
      issues.push(`Schema verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      stats: { tables, triggers, indexes },
    };
  }

  private async createFTSTriggers(): Promise<void> {
    try {
      logInfo('Creating FTS triggers for data synchronization', {
        component: 'DatabaseContext',
      });

      // Create triggers for synchronization with long_term_memory
      await this.prisma.$executeRaw`
  CREATE TRIGGER IF NOT EXISTS memory_fts_insert_long_term
  AFTER INSERT ON long_term_memory
  BEGIN
    INSERT INTO memory_fts(rowid, content, metadata)
    VALUES (new.id, new.searchableContent, json_object(
    'memory_type', new.retentionType,
    'category_primary', new.categoryPrimary,
    'importance_score', new.importanceScore,
    'classification', new.classification,
    'created_at', new.extractionTimestamp,
    'namespace', new.namespace
    ));
  END;
  `;

      await this.prisma.$executeRaw`
  CREATE TRIGGER IF NOT EXISTS memory_fts_delete_long_term
  AFTER DELETE ON long_term_memory
  BEGIN
    DELETE FROM memory_fts WHERE rowid = old.id;
  END;
  `;

      await this.prisma.$executeRaw`
  CREATE TRIGGER IF NOT EXISTS memory_fts_update_long_term
  AFTER UPDATE ON long_term_memory
  BEGIN
    DELETE FROM memory_fts WHERE rowid = old.id;
    INSERT INTO memory_fts(rowid, content, metadata)
    VALUES (new.id, new.searchableContent, json_object(
    'memory_type', new.retentionType,
    'category_primary', new.categoryPrimary,
    'importance_score', new.importanceScore,
    'classification', new.classification,
    'created_at', new.extractionTimestamp,
    'namespace', new.namespace
    ));
  END;
  `;

      // Create triggers for synchronization with short_term_memory
      await this.prisma.$executeRaw`
  CREATE TRIGGER IF NOT EXISTS memory_fts_insert_short_term
  AFTER INSERT ON short_term_memory
  BEGIN
    INSERT INTO memory_fts(rowid, content, metadata)
    VALUES (new.id, new.searchableContent, json_object(
    'memory_type', new.retentionType,
    'category_primary', new.categoryPrimary,
    'importance_score', new.importanceScore,
    'created_at', new.createdAt,
    'namespace', new.namespace
    ));
  END;
  `;

      await this.prisma.$executeRaw`
  CREATE TRIGGER IF NOT EXISTS memory_fts_delete_short_term
  AFTER DELETE ON short_term_memory
  BEGIN
    DELETE FROM memory_fts WHERE rowid = old.id;
  END;
  `;

      await this.prisma.$executeRaw`
  CREATE TRIGGER IF NOT EXISTS memory_fts_update_short_term
  AFTER UPDATE ON short_term_memory
  BEGIN
    DELETE FROM memory_fts WHERE rowid = old.id;
    INSERT INTO memory_fts(rowid, content, metadata)
    VALUES (new.id, new.searchableContent, json_object(
    'memory_type', new.retentionType,
    'category_primary', new.categoryPrimary,
    'importance_score', new.importanceScore,
    'created_at', new.createdAt,
    'namespace', new.namespace
    ));
  END;
  `;

      logInfo('FTS triggers created successfully', {
        component: 'DatabaseContext',
      });

    } catch (error) {
      logError('Failed to create FTS triggers', {
        component: 'DatabaseContext',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private trackSlowQuery(slowQuery: { query: string; duration: number; timestamp: number }): void {
    const slowQueries = this.performanceMetrics.metadata?.slowQueries as Array<{ query: string; duration: number; timestamp: number }> || [];
    slowQueries.unshift(slowQuery);
    if (slowQueries.length > this.performanceConfig.maxSlowQueryHistory) {
      slowQueries.splice(this.performanceConfig.maxSlowQueryHistory);
    }
    this.performanceMetrics.metadata = {
      ...this.performanceMetrics.metadata,
      slowQueries,
    };
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      return; // Already started
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.healthCheck();

        // Update connection status in metadata
        const connectionCount = this.performanceMetrics.metadata?.connectionCount as number || 0;
        this.performanceMetrics.metadata = {
          ...this.performanceMetrics.metadata,
          connectionCount: connectionCount + 1,
          lastHealthCheck: new Date(),
          lastHealthStatus: health.status,
        };

        if (health.status === 'unhealthy') {
          logError('Database health check failed', {
            component: 'DatabaseContext',
            responseTime: health.responseTime,
            error: health.error,
          });
        } else {
          logInfo('Database health check passed', {
            component: 'DatabaseContext',
            status: health.status,
            responseTime: health.responseTime,
          });
        }
      } catch (error) {
        logError('Health check monitoring error', {
          component: 'DatabaseContext',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.performanceConfig.collectionInterval);

    logInfo('Started database health monitoring', {
      component: 'DatabaseContext',
      interval: this.performanceConfig.collectionInterval,
    });
  }

  /**
   * Force cleanup of health monitoring (for testing)
   */
  forceCleanupHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      logInfo('Force cleaned up health monitoring', {
        component: 'DatabaseContext',
      });
    }
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;

      logInfo('Stopped database health monitoring', {
        component: 'DatabaseContext',
      });
    }
  }

  private isConnected(): boolean {
    try {
      // Simple connectivity check - would need actual connection verification
      return true;
    } catch {
      return false;
    }
  }

}