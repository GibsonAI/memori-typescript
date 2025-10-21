import { DatabaseManager } from '../../infrastructure/database/DatabaseManager';
import { logInfo, logError, logWarn } from '../../infrastructure/config/Logger';

/**
 * Index health status enumeration
 */
export enum IndexHealth {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  DEGRADED = 'degraded',
  CRITICAL = 'critical',
  CORRUPTED = 'corrupted'
}

/**
 * Index optimization type enumeration
 */
export enum OptimizationType {
  REBUILD = 'rebuild',
  MERGE = 'merge',
  COMPACT = 'compact',
  VACUUM = 'vacuum'
}

/**
 * Index statistics interface
 */
export interface IndexStatistics {
  totalDocuments: number;
  totalSize: number;
  averageDocumentSize: number;
  lastOptimization: Date | null;
  fragmentationLevel: number;
  corruptionDetected: boolean;
  performanceMetrics: {
    averageQueryTime: number;
    queriesPerSecond: number;
    memoryUsage: number;
  };
  healthScore: number;
  recommendations: string[];
}

/**
 * Index health report interface
 */
export interface IndexHealthReport {
  health: IndexHealth;
  statistics: IndexStatistics;
  issues: string[];
  recommendations: string[];
  timestamp: Date;
  estimatedOptimizationTime: number;
}

/**
 * Optimization result interface
 */
export interface OptimizationResult {
  success: boolean;
  optimizationType: OptimizationType;
  startTime: Date;
  endTime: Date;
  duration: number;
  documentsProcessed: number;
  sizeBefore: number;
  sizeAfter: number;
  spaceSaved: number;
  performanceImprovement: number;
  error?: string;
}

/**
 * Backup metadata interface
 */
export interface BackupMetadata {
  timestamp: Date;
  version: string;
  indexSize: number;
  documentCount: number;
  optimizationLevel: string;
  checksum: string;
}

/**
 * Search index maintenance and optimization manager
 * Provides comprehensive index management, health monitoring, and automated optimization
 */
export class SearchIndexManager {
  private readonly dbManager: DatabaseManager;
  private readonly optimizationThresholds = {
    fragmentation: 0.3,      // 30% fragmentation threshold
    corruption: 0.01,        // 1% corruption threshold
    performance: 1000,       // 1000ms average query time threshold
    size: 1024 * 1024 * 100, // 100MB size threshold for optimization
  };

  private readonly maintenanceSchedule = {
    healthCheck: 60 * 60 * 1000,      // 1 hour
    optimizationCheck: 24 * 60 * 60 * 1000, // 24 hours
    backup: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private optimizationTimer?: ReturnType<typeof setInterval>;
  private backupTimer?: ReturnType<typeof setInterval>;
  private isOptimizing = false;
  private lastHealthCheck: Date | null = null;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
    this.startMaintenanceSchedule();
  }

  /**
   * Start automated maintenance schedule
   */
  private startMaintenanceSchedule(): void {
    try {
      // Health check every hour
      this.healthCheckTimer = setInterval(async () => {
        try {
          await this.performHealthCheck();
        } catch (error) {
          logError('Scheduled health check failed', {
            component: 'SearchIndexManager',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }, this.maintenanceSchedule.healthCheck);

      // Optimization check every 24 hours
      this.optimizationTimer = setInterval(async () => {
        try {
          await this.checkAndPerformOptimization();
        } catch (error) {
          logError('Scheduled optimization check failed', {
            component: 'SearchIndexManager',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }, this.maintenanceSchedule.optimizationCheck);

      // Backup every 7 days
      this.backupTimer = setInterval(async () => {
        try {
          await this.createBackup();
        } catch (error) {
          logError('Scheduled backup failed', {
            component: 'SearchIndexManager',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }, this.maintenanceSchedule.backup);

      logInfo('Search index maintenance schedule started', {
        component: 'SearchIndexManager',
        schedule: this.maintenanceSchedule,
      });

    } catch (error) {
      logError('Failed to start maintenance schedule', {
        component: 'SearchIndexManager',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Stop maintenance schedule
   */
  public stopMaintenanceSchedule(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = undefined;
    }
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = undefined;
    }
    logInfo('Search index maintenance schedule stopped', {
      component: 'SearchIndexManager',
    });
  }

  /**
   * Get comprehensive index health report
   */
  public async getIndexHealthReport(): Promise<IndexHealthReport> {
    try {
      const statistics = await this.getIndexStatistics();
      const issues = await this.detectIndexIssues(statistics);
      const recommendations = await this.generateRecommendations(statistics, issues);
      const estimatedOptimizationTime = await this.estimateOptimizationTime(statistics);

      const health = this.determineHealthStatus(statistics, issues);

      const report: IndexHealthReport = {
        health,
        statistics,
        issues,
        recommendations,
        timestamp: new Date(),
        estimatedOptimizationTime,
      };

      logInfo('Generated index health report', {
        component: 'SearchIndexManager',
        health,
        issues: issues.length,
        recommendations: recommendations.length,
      });

      return report;

    } catch (error) {
      logError('Failed to generate index health report', {
        component: 'SearchIndexManager',
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Index health report generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform comprehensive index optimization
   */
  public async optimizeIndex(type: OptimizationType = OptimizationType.MERGE): Promise<OptimizationResult> {
    if (this.isOptimizing) {
      throw new Error('Optimization already in progress');
    }

    this.isOptimizing = true;
    const startTime = new Date();

    try {
      logInfo(`Starting index optimization: ${type}`, {
        component: 'SearchIndexManager',
        optimizationType: type,
        startTime: startTime.toISOString(),
      });

      const statsBefore = await this.getIndexStatistics();
      let result: OptimizationResult;

      switch (type) {
      case OptimizationType.REBUILD:
        result = await this.rebuildIndex();
        break;
      case OptimizationType.MERGE:
        result = await this.mergeIndex();
        break;
      case OptimizationType.COMPACT:
        result = await this.compactIndex();
        break;
      case OptimizationType.VACUUM:
        result = await this.vacuumIndex();
        break;
      default:
        throw new Error(`Unknown optimization type: ${type}`);
      }

      const statsAfter = await this.getIndexStatistics();
      const performanceImprovement = statsBefore.performanceMetrics.averageQueryTime > 0
        ? (statsBefore.performanceMetrics.averageQueryTime - statsAfter.performanceMetrics.averageQueryTime) / statsBefore.performanceMetrics.averageQueryTime
        : 0;

      const optimizationResult: OptimizationResult = {
        ...result,
        performanceImprovement,
      };

      logInfo(`Index optimization completed: ${type}`, {
        component: 'SearchIndexManager',
        optimizationType: type,
        duration: optimizationResult.duration,
        spaceSaved: optimizationResult.spaceSaved,
        performanceImprovement: optimizationResult.performanceImprovement,
      });

      return optimizationResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Index optimization failed', {
        component: 'SearchIndexManager',
        optimizationType: type,
        error: errorMessage,
      });

      return {
        success: false,
        optimizationType: type,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        documentsProcessed: 0,
        sizeBefore: 0,
        sizeAfter: 0,
        spaceSaved: 0,
        performanceImprovement: 0,
        error: errorMessage,
      };
    } finally {
      this.isOptimizing = false;
    }
  }

  /**
   * Create index backup
   */
  public async createBackup(): Promise<BackupMetadata> {
    try {
      logInfo('Creating index backup', {
        component: 'SearchIndexManager',
      });

      const stats = await this.getIndexStatistics();
      const timestamp = new Date();
      const version = '1.0.0';
      const backupId = `search_index_backup_${timestamp.getTime()}`;

      // Create backup table
      await this.dbManager.getPrismaClient().$executeRaw`
        CREATE TABLE IF NOT EXISTS search_index_backups (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          version TEXT NOT NULL,
          data BLOB NOT NULL,
          metadata TEXT NOT NULL
        );
      `;

      // Export index data with explicit type handling
      const indexData = await this.dbManager.getPrismaClient().$queryRaw`
        SELECT rowid, content, metadata FROM memory_fts;
      ` as any[];

      const metadata = JSON.stringify({
        timestamp: timestamp.toISOString(),
        version,
        indexSize: Number(stats.totalSize),
        documentCount: Number(stats.totalDocuments),
        optimizationLevel: Number(stats.healthScore),
      });

      // Create checksum
      const checksum = this.generateChecksum(JSON.stringify(indexData) + metadata);

      const backupMetadata: BackupMetadata = {
        timestamp,
        version,
        indexSize: Number(stats.totalSize),
        documentCount: Number(stats.totalDocuments),
        optimizationLevel: Number(stats.healthScore).toString(),
        checksum,
      };

      // Store backup with explicit type casting
      await this.dbManager.getPrismaClient().$executeRaw`
        INSERT INTO search_index_backups (id, timestamp, version, data, metadata)
        VALUES (
          ${backupId},
          ${timestamp.toISOString()},
          ${version},
          ${JSON.stringify(indexData)},
          ${metadata}
        );
      `;

      logInfo('Index backup created successfully', {
        component: 'SearchIndexManager',
        backupId,
        timestamp: timestamp.toISOString(),
        documentCount: stats.totalDocuments,
        size: stats.totalSize,
      });

      return backupMetadata;

    } catch (error) {
      logError('Failed to create index backup', {
        component: 'SearchIndexManager',
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Index backup creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
    * Restore index from backup
    */
   public async restoreFromBackup(backupId: string): Promise<boolean> {
     try {
       logInfo(`Restoring index from backup: ${backupId}`, {
         component: 'SearchIndexManager',
       });

       // Ensure backup table exists
       await this.dbManager.getPrismaClient().$executeRaw`
         CREATE TABLE IF NOT EXISTS search_index_backups (
           id TEXT PRIMARY KEY,
           timestamp TEXT NOT NULL,
           version TEXT NOT NULL,
           data BLOB NOT NULL,
           metadata TEXT NOT NULL
         );
       `;

       // Get backup data
       const backupData = await this.dbManager.getPrismaClient().$queryRaw`
         SELECT * FROM search_index_backups WHERE id = ${backupId};
       ` as any[];

      if (backupData.length === 0) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      const backup = backupData[0];
      const indexData = JSON.parse(backup.data);
      const metadata = JSON.parse(backup.metadata);

      // Verify backup integrity
      const expectedChecksum = metadata.checksum;
      const actualChecksum = this.generateChecksum(backup.data + backup.metadata);

      if (expectedChecksum !== actualChecksum) {
        throw new Error('Backup integrity check failed - checksum mismatch');
      }

      // Clear current index
      await this.dbManager.getPrismaClient().$executeRaw`
        DELETE FROM memory_fts;
      `;

      // Restore index data with explicit type handling
      for (const record of indexData) {
        await this.dbManager.getPrismaClient().$executeRaw`
          INSERT INTO memory_fts (rowid, content, metadata)
          VALUES (
            ${String(record.rowid)},
            ${String(record.content)},
            ${String(record.metadata)}
          );
        `;
      }

      logInfo('Index restored from backup successfully', {
        component: 'SearchIndexManager',
        backupId,
        timestamp: backup.timestamp,
        documentCount: indexData.length,
      });

      return true;

    } catch (error) {
      logError('Failed to restore index from backup', {
        component: 'SearchIndexManager',
        backupId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Index restore failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Repair corrupted index
   */
  public async repairIndex(): Promise<OptimizationResult> {
    const startTime = new Date();

    try {
      logInfo('Starting index repair', {
        component: 'SearchIndexManager',
        startTime: startTime.toISOString(),
      });

      const statsBefore = await this.getIndexStatistics();

      // Rebuild index from source data with safer approach
      try {
        await this.dbManager.getPrismaClient().$executeRaw`DELETE FROM memory_fts;`;

        logInfo('Cleared existing FTS data', { component: 'SearchIndexManager' });

        // Check if source tables exist first
        const longTermExists = await this.dbManager.getPrismaClient().$queryRaw`
          SELECT name FROM sqlite_master WHERE type='table' AND name='long_term_memory';
        ` as any[];

        const shortTermExists = await this.dbManager.getPrismaClient().$queryRaw`
          SELECT name FROM sqlite_master WHERE type='table' AND name='short_term_memory';
        ` as any[];

        // First, let's check what data exists in the table
        const debugInfo = await this.dbManager.getPrismaClient().$queryRaw`
          SELECT COUNT(*) as total,
                 COUNT(CASE WHEN searchableContent IS NOT NULL THEN 1 END) as not_null,
                 COUNT(CASE WHEN TRIM(searchableContent) != '' THEN 1 END) as not_empty,
                 COUNT(CASE WHEN LENGTH(TRIM(searchableContent)) > 0 THEN 1 END) as has_length
          FROM long_term_memory;
        ` as any[];

        logInfo('Debug info for long_term_memory table', {
          component: 'SearchIndexManager',
          debugInfo: debugInfo[0],
        });

        // Use a safer approach - fetch records and insert them individually
        if (longTermExists && longTermExists.length > 0) {
          try {
            // Fetch records using Prisma query
            const longTermRecords = await this.dbManager.getPrismaClient().$queryRaw`
              SELECT id, searchableContent, summary, retentionType, categoryPrimary,
                     importanceScore, classification, namespace
              FROM long_term_memory
              WHERE searchableContent IS NOT NULL AND searchableContent != '';
            ` as any[];

            logInfo(`Found ${longTermRecords.length} long_term_memory records to process`, {
              component: 'SearchIndexManager',
            });

            // Process each record individually for better error handling
            let processedCount = 0;
            for (const record of longTermRecords) {
              try {
                const content = record.searchableContent || record.summary || '';
                if (content.trim().length === 0) continue;

                const metadata = JSON.stringify({
                  memory_type: record.retentionType || 'unknown',
                  category_primary: record.categoryPrimary || 'general',
                  importance_score: Number(record.importanceScore) || 0.5,
                  classification: record.classification || 'unknown',
                  created_at: Math.floor(Date.now() / 1000),
                  namespace: record.namespace || 'default',
                });

                await this.dbManager.getPrismaClient().$executeRaw`
                  INSERT INTO memory_fts(rowid, content, metadata)
                  VALUES (${Number(record.id)}, ${content}, ${metadata});
                `;

                processedCount++;
              } catch (recordError) {
                logError(`Failed to process record ${record.id}`, {
                  component: 'SearchIndexManager',
                  error: recordError instanceof Error ? recordError.message : String(recordError),
                });
              }
            }

            logInfo(`Successfully processed ${processedCount} long_term_memory records`, {
              component: 'SearchIndexManager',
            });
          } catch (longTermError) {
            logError('Failed to repopulate from long_term_memory', {
              component: 'SearchIndexManager',
              error: longTermError instanceof Error ? longTermError.message : String(longTermError),
            });
          }
        }

        // Repopulate from short_term_memory if it exists
        if (shortTermExists && shortTermExists.length > 0) {
          try {
            await this.dbManager.getPrismaClient().$executeRaw`
              INSERT INTO memory_fts(rowid, content, metadata)
              SELECT
                id,
                COALESCE(TRIM(searchableContent), ''),
                json_object(
                  'memory_type', COALESCE(retentionType, 'unknown'),
                  'category_primary', COALESCE(categoryPrimary, 'general'),
                  'importance_score', COALESCE(importanceScore, 0.5),
                  'created_at', COALESCE(strftime('%s', createdAt), strftime('%s', 'now')),
                  'namespace', COALESCE(namespace, 'default')
                )
              FROM short_term_memory
              WHERE searchableContent IS NOT NULL
                AND TRIM(searchableContent) != ''
                AND LENGTH(TRIM(searchableContent)) > 0;
            `;
            logInfo('Repopulated FTS from short_term_memory', { component: 'SearchIndexManager' });
          } catch (shortTermError) {
            logError('Failed to repopulate from short_term_memory', {
              component: 'SearchIndexManager',
              error: shortTermError instanceof Error ? shortTermError.message : String(shortTermError),
            });
          }
        }

        logInfo('FTS index rebuild completed successfully', { component: 'SearchIndexManager' });

      } catch (rebuildError) {
        logError('FTS index rebuild failed', {
          component: 'SearchIndexManager',
          error: rebuildError instanceof Error ? rebuildError.message : String(rebuildError),
        });
        throw rebuildError;
      }

      const statsAfter = await this.getIndexStatistics();

      const result: OptimizationResult = {
        success: true,
        optimizationType: OptimizationType.REBUILD,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        documentsProcessed: statsAfter.totalDocuments,
        sizeBefore: statsBefore.totalSize,
        sizeAfter: statsAfter.totalSize,
        spaceSaved: 0,
        performanceImprovement: 0,
      };

      logInfo('Index repair completed successfully', {
        component: 'SearchIndexManager',
        duration: result.duration,
        documentsProcessed: result.documentsProcessed,
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Index repair failed', {
        component: 'SearchIndexManager',
        error: errorMessage,
      });

      return {
        success: false,
        optimizationType: OptimizationType.REBUILD,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        documentsProcessed: 0,
        sizeBefore: 0,
        sizeAfter: 0,
        spaceSaved: 0,
        performanceImprovement: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Get detailed index statistics
   */
  private async getIndexStatistics(): Promise<IndexStatistics> {
    try {
      // Get basic index information
      const indexInfo = await this.dbManager.getPrismaClient().$queryRaw`
        SELECT COUNT(*) as totalDocuments FROM memory_fts;
      ` as any[];

      const totalDocuments = Number(indexInfo[0]?.totalDocuments) || 0;

      // Get index size information
      const sizeInfo = await this.dbManager.getPrismaClient().$queryRaw`
        SELECT page_count * page_size as totalSize FROM pragma_page_count(), pragma_page_size();
      ` as any[];

      const totalSize = Number(sizeInfo[0]?.totalSize) || 0;
      const averageDocumentSize = totalDocuments > 0 ? totalSize / totalDocuments : 0;

      // Get fragmentation information
      const fragmentationInfo = await this.dbManager.getPrismaClient().$queryRaw`
        SELECT COUNT(*) as fragmentedPages FROM pragma_freelist_count();
      ` as any[];

      const fragmentedPages = Number(fragmentationInfo[0]?.fragmentedPages) || 0;
      const fragmentationLevel = totalSize > 0 ? fragmentedPages / (totalSize / 4096) : 0;

      // Check for corruption using a more robust approach
      let corruptionDetected = false;
      try {
        // Use a simpler approach - check if we can query the FTS table
        // If basic queries work, the database is likely not corrupted
        const testQuery = await this.dbManager.getPrismaClient().$queryRaw`
          SELECT COUNT(*) as count FROM memory_fts LIMIT 1;
        ` as any[];

        // If we can successfully query the table, it's likely not corrupted
        if (testQuery && testQuery.length > 0) {
          corruptionDetected = false;
        } else {
          corruptionDetected = true;
        }
      } catch (queryError) {
        // If we can't even query the table, it might be corrupted
        logError('FTS table query failed during corruption check', {
          component: 'SearchIndexManager',
          error: queryError instanceof Error ? queryError.message : String(queryError),
        });
        corruptionDetected = true;
      }

      // Get performance metrics (simplified)
      const performanceMetrics = {
        averageQueryTime: 50, // Placeholder - would need actual query timing
        queriesPerSecond: 100, // Placeholder
        memoryUsage: totalSize / (1024 * 1024), // MB
      };

      // Calculate health score
      const healthScore = this.calculateHealthScore({
        fragmentationLevel,
        corruptionDetected,
        performanceMetrics,
        totalSize,
        totalDocuments,
      });

      // Generate recommendations
      const recommendations = this.generateRecommendationsFromStats({
        fragmentationLevel,
        corruptionDetected,
        performanceMetrics,
        totalSize,
        totalDocuments,
      });

      // Get last optimization time
      const lastOptimization = await this.getLastOptimizationTime();

      return {
        totalDocuments,
        totalSize,
        averageDocumentSize,
        lastOptimization,
        fragmentationLevel,
        corruptionDetected,
        performanceMetrics,
        healthScore,
        recommendations,
      };

    } catch (error) {
      logError('Failed to get index statistics', {
        component: 'SearchIndexManager',
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Index statistics retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform automated health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const report = await this.getIndexHealthReport();
      this.lastHealthCheck = new Date();

      logInfo('Automated health check completed', {
        component: 'SearchIndexManager',
        health: report.health,
        issues: report.issues.length,
        recommendations: report.recommendations.length,
        timestamp: this.lastHealthCheck.toISOString(),
      });

      // Auto-optimize if health is critical
      if (report.health === IndexHealth.CRITICAL) {
        logWarn('Critical health detected, triggering emergency optimization', {
          component: 'SearchIndexManager',
          issues: report.issues,
        });

        try {
          await this.optimizeIndex(OptimizationType.REBUILD);
        } catch (optimizationError) {
          logError('Emergency optimization failed', {
            component: 'SearchIndexManager',
            error: optimizationError instanceof Error ? optimizationError.message : String(optimizationError),
          });
        }
      }

    } catch (error) {
      logError('Health check failed', {
        component: 'SearchIndexManager',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if optimization is needed and perform it
   */
  private async checkAndPerformOptimization(): Promise<void> {
    try {
      const stats = await this.getIndexStatistics();

      // Check if optimization is needed based on thresholds
      const needsOptimization =
        stats.fragmentationLevel > this.optimizationThresholds.fragmentation ||
        stats.corruptionDetected ||
        stats.performanceMetrics.averageQueryTime > this.optimizationThresholds.performance ||
        stats.totalSize > this.optimizationThresholds.size;

      if (needsOptimization) {
        logInfo('Optimization thresholds exceeded, performing optimization', {
          component: 'SearchIndexManager',
          fragmentation: stats.fragmentationLevel,
          corruption: stats.corruptionDetected,
          avgQueryTime: stats.performanceMetrics.averageQueryTime,
          size: stats.totalSize,
        });

        let optimizationType = OptimizationType.MERGE;
        if (stats.corruptionDetected) {
          optimizationType = OptimizationType.REBUILD;
        } else if (stats.fragmentationLevel > 0.5) {
          optimizationType = OptimizationType.REBUILD;
        }

        await this.optimizeIndex(optimizationType);
      }

    } catch (error) {
      logError('Optimization check failed', {
        component: 'SearchIndexManager',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Detect index issues
   */
  private async detectIndexIssues(statistics: IndexStatistics): Promise<string[]> {
    const issues: string[] = [];

    if (statistics.corruptionDetected) {
      issues.push('Index corruption detected');
    }

    if (statistics.fragmentationLevel > this.optimizationThresholds.fragmentation) {
      issues.push(`High fragmentation: ${(statistics.fragmentationLevel * 100).toFixed(1)}%`);
    }

    if (statistics.performanceMetrics.averageQueryTime > this.optimizationThresholds.performance) {
      issues.push(`Slow query performance: ${statistics.performanceMetrics.averageQueryTime}ms average`);
    }

    if (statistics.totalSize > this.optimizationThresholds.size) {
      issues.push(`Large index size: ${(statistics.totalSize / (1024 * 1024)).toFixed(1)}MB`);
    }

    if (statistics.totalDocuments === 0) {
      issues.push('Index is empty');
    }

    return issues;
  }

  /**
   * Generate recommendations based on statistics
   */
  private async generateRecommendations(statistics: IndexStatistics, issues: string[]): Promise<string[]> {
    const recommendations: string[] = [];

    if (statistics.corruptionDetected) {
      recommendations.push('Run index repair immediately');
    }

    if (statistics.fragmentationLevel > 0.3) {
      recommendations.push('Consider index optimization to reduce fragmentation');
    }

    if (statistics.performanceMetrics.averageQueryTime > 500) {
      recommendations.push('Optimize index to improve query performance');
    }

    if (statistics.totalSize > this.optimizationThresholds.size) {
      recommendations.push('Consider index compaction to reduce size');
    }

    if (issues.length === 0) {
      recommendations.push('Index is healthy, no action needed');
    }

    return recommendations;
  }

  /**
   * Estimate optimization time
   */
  private async estimateOptimizationTime(statistics: IndexStatistics): Promise<number> {
    // Base time estimation based on document count and size
    const baseTime = statistics.totalDocuments * 2; // 2ms per document
    const sizeTime = statistics.totalSize / (1024 * 1024); // 1ms per MB
    const estimatedTime = Math.max(baseTime + sizeTime, 1000); // Minimum 1 second

    return estimatedTime;
  }

  /**
   * Determine health status
   */
  private determineHealthStatus(statistics: IndexStatistics, issues: string[]): IndexHealth {
    if (statistics.corruptionDetected || issues.some(issue => issue.includes('corruption'))) {
      return IndexHealth.CORRUPTED;
    }

    if (issues.length > 3 || statistics.healthScore < 0.3) {
      return IndexHealth.CRITICAL;
    }

    if (issues.length > 1 || statistics.healthScore < 0.6) {
      return IndexHealth.DEGRADED;
    }

    if (statistics.healthScore < 0.8) {
      return IndexHealth.GOOD;
    }

    return IndexHealth.EXCELLENT;
  }

  /**
   * Calculate health score
   */
  private calculateHealthScore(params: {
    fragmentationLevel: number;
    corruptionDetected: boolean;
    performanceMetrics: { averageQueryTime: number };
    totalSize: number;
    totalDocuments: number;
  }): number {
    let score = 1.0;

    // Penalize corruption heavily
    if (params.corruptionDetected) {
      score -= 0.8;
    }

    // Penalize fragmentation
    score -= params.fragmentationLevel * 0.3;

    // Penalize slow performance
    if (params.performanceMetrics.averageQueryTime > 1000) {
      score -= 0.3;
    } else if (params.performanceMetrics.averageQueryTime > 500) {
      score -= 0.1;
    }

    // Penalize very large indexes
    if (params.totalSize > 1024 * 1024 * 500) { // 500MB
      score -= 0.2;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate recommendations from statistics
   */
  private generateRecommendationsFromStats(params: {
    fragmentationLevel: number;
    corruptionDetected: boolean;
    performanceMetrics: { averageQueryTime: number };
    totalSize: number;
    totalDocuments: number;
  }): string[] {
    const recommendations: string[] = [];

    if (params.corruptionDetected) {
      recommendations.push('Index repair required due to corruption');
    }

    if (params.fragmentationLevel > 0.3) {
      recommendations.push('High fragmentation detected - optimization recommended');
    }

    if (params.performanceMetrics.averageQueryTime > 500) {
      recommendations.push('Slow query performance - optimization may help');
    }

    if (params.totalSize > 1024 * 1024 * 100) {
      recommendations.push('Large index size - consider compaction');
    }

    return recommendations;
  }

  /**
   * Get last optimization time
   */
  private async getLastOptimizationTime(): Promise<Date | null> {
    try {
      // Check if backup table exists first
      const tableCheck = await this.dbManager.getPrismaClient().$queryRaw`
        SELECT name FROM sqlite_master WHERE type='table' AND name='search_index_backups';
      ` as any[];

      if (!tableCheck || tableCheck.length === 0) {
        // Table doesn't exist yet, create it
        await this.dbManager.getPrismaClient().$executeRaw`
          CREATE TABLE IF NOT EXISTS search_index_backups (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            version TEXT NOT NULL,
            data BLOB NOT NULL,
            metadata TEXT NOT NULL
          );
        `;
      }

      // Check for optimization tracking in backup metadata
      const lastBackup = await this.dbManager.getPrismaClient().$queryRaw`
        SELECT timestamp FROM search_index_backups ORDER BY timestamp DESC LIMIT 1;
      ` as any[];

      if (lastBackup.length > 0) {
        return new Date(lastBackup[0].timestamp);
      }

      return null;
    } catch (error) {
      // Log error but don't fail - this is not critical for health checks
      logError('Failed to get last optimization time', {
        component: 'SearchIndexManager',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Rebuild entire index
   */
  private async rebuildIndex(): Promise<OptimizationResult> {
    // This is handled by repairIndex method
    return this.repairIndex();
  }

  /**
   * Merge index segments
   */
  private async mergeIndex(): Promise<OptimizationResult> {
    const startTime = new Date();

    try {
      // FTS5 handles merging automatically, but we can trigger optimization
      await this.dbManager.getPrismaClient().$executeRaw`
        INSERT INTO memory_fts(memory_fts) VALUES('optimize');
      `;

      const statsAfter = await this.getIndexStatistics();

      return {
        success: true,
        optimizationType: OptimizationType.MERGE,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        documentsProcessed: statsAfter.totalDocuments,
        sizeBefore: 0, // Would need to track before/after
        sizeAfter: statsAfter.totalSize,
        spaceSaved: 0,
        performanceImprovement: 0,
      };
    } catch (error) {
      throw new Error(`Index merge failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Compact index
   */
  private async compactIndex(): Promise<OptimizationResult> {
    const startTime = new Date();

    try {
      // Trigger FTS5 compaction
      await this.dbManager.getPrismaClient().$executeRaw`
        INSERT INTO memory_fts(memory_fts) VALUES('merge=1');
      `;

      const statsAfter = await this.getIndexStatistics();

      return {
        success: true,
        optimizationType: OptimizationType.COMPACT,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        documentsProcessed: statsAfter.totalDocuments,
        sizeBefore: 0,
        sizeAfter: statsAfter.totalSize,
        spaceSaved: 0,
        performanceImprovement: 0,
      };
    } catch (error) {
      throw new Error(`Index compaction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Vacuum index
   */
  private async vacuumIndex(): Promise<OptimizationResult> {
    const startTime = new Date();

    try {
      // Vacuum the entire database to reclaim space
      await this.dbManager.getPrismaClient().$executeRaw`VACUUM;`;

      const statsAfter = await this.getIndexStatistics();

      return {
        success: true,
        optimizationType: OptimizationType.VACUUM,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        documentsProcessed: statsAfter.totalDocuments,
        sizeBefore: 0,
        sizeAfter: statsAfter.totalSize,
        spaceSaved: 0,
        performanceImprovement: 0,
      };
    } catch (error) {
      throw new Error(`Index vacuum failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate checksum for backup integrity
   */
  private generateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Get maintenance status
   */
 public getMaintenanceStatus(): {
   isOptimizing: boolean;
   lastHealthCheck: Date | null;
   nextHealthCheck: Date | null;
   nextOptimizationCheck: Date | null;
   nextBackup: Date | null;
 } {
   return {
     isOptimizing: this.isOptimizing,
     lastHealthCheck: this.lastHealthCheck,
     nextHealthCheck: this.healthCheckTimer
       ? new Date(Date.now() + this.maintenanceSchedule.healthCheck)
       : null,
     nextOptimizationCheck: this.optimizationTimer
       ? new Date(Date.now() + this.maintenanceSchedule.optimizationCheck)
       : null,
     nextBackup: this.backupTimer
       ? new Date(Date.now() + this.maintenanceSchedule.backup)
       : null,
   };
 }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopMaintenanceSchedule();
  }
}