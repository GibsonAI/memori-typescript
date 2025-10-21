// src/core/agents/ConsciousAgent.ts
import { DatabaseManager } from '../../infrastructure/database/DatabaseManager';
import { logInfo, logError, logDebug } from '../../infrastructure/config/Logger';
import { MemoryProcessingState } from './MemoryProcessingStateManager';

export interface ConsciousMemory {
  id: string;
  content: string;
  summary: string;
  classification: string;
  importance: string;
  topic?: string;
  entities: string[];
  keywords: string[];
  confidenceScore: number;
  classificationReason: string;
}

export class ConsciousAgent {
  private dbManager: DatabaseManager;
  private namespace: string;
  private processedMemoryIds: Set<string> = new Set();

  constructor(dbManager: DatabaseManager, namespace: string) {
    this.dbManager = dbManager;
    this.namespace = namespace;
  }

  /**
   * Initialize existing conscious memories on startup
   */
  async run_conscious_ingest(): Promise<void> {
    logInfo('Starting conscious memory ingestion...', {
      component: 'ConsciousAgent',
      namespace: this.namespace,
    });

    try {
      // Get all conscious-info memories that haven't been processed yet
      const consciousMemories = await this.getUnprocessedConsciousMemories();

      if (consciousMemories.length === 0) {
        logInfo('No unprocessed conscious memories found', {
          component: 'ConsciousAgent',
          namespace: this.namespace,
        });
        return;
      }

      logInfo(`Found ${consciousMemories.length} unprocessed conscious memories`, {
        component: 'ConsciousAgent',
        namespace: this.namespace,
        memoryCount: consciousMemories.length,
      });

      // Process each conscious memory
      for (const memory of consciousMemories) {
        await this.processConsciousMemory(memory);
      }

      logInfo('Conscious memory ingestion completed', {
        component: 'ConsciousAgent',
        namespace: this.namespace,
      });
    } catch (error) {
      logError('Error during conscious memory ingestion:', {
        component: 'ConsciousAgent',
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Initialize context from existing conscious memories
   */
  async initialize_existing_conscious_memories(): Promise<ConsciousMemory[]> {
    try {
      const memories = await this.getConsciousMemoriesFromShortTerm();
      logInfo(`Initialized ${memories.length} existing conscious memories`, {
        component: 'ConsciousAgent',
        namespace: this.namespace,
        memoryCount: memories.length,
      });
      return memories;
    } catch (error) {
      logError('Error initializing existing conscious memories:', {
        component: 'ConsciousAgent',
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Check for new conscious memories and process them
   */
  async check_for_context_updates(): Promise<ConsciousMemory[]> {
    try {
      const newMemories = await this.getNewConsciousMemories();
      const processedMemories: ConsciousMemory[] = [];

      for (const memory of newMemories) {
        const processed = await this.processConsciousMemory(memory);
        if (processed) {
          processedMemories.push(processed);
        }
      }

      if (processedMemories.length > 0) {
        logInfo(`Processed ${processedMemories.length} new conscious memories`, {
          component: 'ConsciousAgent',
          namespace: this.namespace,
          memoryCount: processedMemories.length,
        });
      }

      return processedMemories;
    } catch (error) {
      logError('Error checking for context updates:', {
        component: 'ConsciousAgent',
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get unprocessed conscious memories from long-term storage
   */
  private async getUnprocessedConsciousMemories(): Promise<ConsciousMemory[]> {
    const memories = await this.dbManager.getUnprocessedConsciousMemories();
    return memories as ConsciousMemory[];
  }

  /**
   * Get new conscious memories that need processing
   */
  private async getNewConsciousMemories(): Promise<ConsciousMemory[]> {
    const memories = await this.dbManager.getNewConsciousMemories();
    return memories as ConsciousMemory[];
  }

  /**
    * Process a single conscious memory
    */
  private async processConsciousMemory(memory: ConsciousMemory): Promise<ConsciousMemory | null> {
    try {
      // Check if this memory has already been processed
      if (this.processedMemoryIds.has(memory.id)) {
        return null;
      }

      // Initialize state tracking for conscious processing
      try {
        await this.dbManager.transitionMemoryState(
          memory.id,
          MemoryProcessingState.CONSCIOUS_PROCESSING,
          {
            reason: 'Starting conscious memory processing',
            agentId: 'ConsciousAgent',
            metadata: {
              namespace: this.namespace,
              classification: memory.classification,
              importance: memory.importance,
            },
          },
        );
      } catch (stateError) {
        logDebug(`State tracking failed for memory ${memory.id}, continuing processing`, {
          component: 'ConsciousAgent',
          namespace: this.namespace,
          memoryId: memory.id,
          error: stateError instanceof Error ? stateError.message : String(stateError),
        });
      }

      // Copy memory to short-term storage for immediate availability
      await this.copyToShortTermMemory(memory);

      // Mark as processed to avoid duplicates
      this.processedMemoryIds.add(memory.id);

      // Update state to processed
      try {
        await this.dbManager.transitionMemoryState(
          memory.id,
          MemoryProcessingState.CONSCIOUS_PROCESSED,
          {
            reason: 'Conscious memory processing completed successfully',
            agentId: 'ConsciousAgent',
            metadata: {
              namespace: this.namespace,
              shortTermStorage: true,
            },
          },
        );
      } catch (stateError) {
        logDebug(`Failed to update state for processed memory ${memory.id}`, {
          component: 'ConsciousAgent',
          namespace: this.namespace,
          memoryId: memory.id,
          error: stateError instanceof Error ? stateError.message : String(stateError),
        });
      }

      logDebug(`Processed conscious memory: ${memory.summary}`, {
        component: 'ConsciousAgent',
        namespace: this.namespace,
        memoryId: memory.id,
      });
      return memory;
    } catch (error) {
      // Update state to failed
      try {
        await this.dbManager.transitionMemoryState(
          memory.id,
          MemoryProcessingState.FAILED,
          {
            reason: 'Conscious memory processing failed',
            agentId: 'ConsciousAgent',
            errorMessage: error instanceof Error ? error.message : String(error),
            metadata: {
              namespace: this.namespace,
              errorType: 'processing_failure',
            },
          },
        );
      } catch (stateError) {
        logDebug(`Failed to update state for failed memory ${memory.id}`, {
          component: 'ConsciousAgent',
          namespace: this.namespace,
          memoryId: memory.id,
          error: stateError instanceof Error ? stateError.message : String(stateError),
        });
      }

      logError(`Error processing conscious memory ${memory.id}:`, {
        component: 'ConsciousAgent',
        namespace: this.namespace,
        memoryId: memory.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Copy conscious memory to short-term storage
   */
  private async copyToShortTermMemory(memory: ConsciousMemory): Promise<void> {
    try {
      // Create short-term memory entry from conscious memory
      const shortTermData = {
        chatId: memory.id, // Using memory ID as chat ID for tracking
        processedData: {
          content: memory.content,
          summary: memory.summary,
          classification: memory.classification,
          importance: memory.importance,
          topic: memory.topic,
          entities: memory.entities,
          keywords: memory.keywords,
          confidenceScore: memory.confidenceScore,
          classificationReason: memory.classificationReason,
          consciousMemory: true, // Mark as conscious memory
        },
        importanceScore: this.calculateImportanceScore(memory.importance),
        categoryPrimary: memory.classification,
        retentionType: 'short_term',
        namespace: this.namespace,
        searchableContent: memory.content,
        summary: memory.summary,
        isPermanentContext: true, // Conscious memories are permanent context
      };

      await this.dbManager.storeConsciousMemoryInShortTerm(shortTermData, this.namespace);
    } catch (error) {
      logError('Error copying conscious memory to short-term storage:', {
        component: 'ConsciousAgent',
        namespace: this.namespace,
        memoryId: memory.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get conscious memories currently in short-term storage
   */
  private async getConsciousMemoriesFromShortTerm(): Promise<ConsciousMemory[]> {
    const memories = await this.dbManager.getConsciousMemoriesFromShortTerm(this.namespace);
    return memories as ConsciousMemory[];
  }

  /**
   * Calculate importance score for conscious memory
   */
  private calculateImportanceScore(importance: string): number {
    const scores = {
      'critical': 0.9,
      'high': 0.7,
      'medium': 0.5,
      'low': 0.3,
    };
    return scores[importance as keyof typeof scores] || 0.5;
  }

  /**
    * Consolidate duplicate conscious memories with enhanced error handling and statistics
    */
  async consolidateDuplicates(options?: {
    namespace?: string;
    similarityThreshold?: number;
    dryRun?: boolean;
    batchSize?: number;
    enableProgressTracking?: boolean;
  }): Promise<{
    totalProcessed: number;
    duplicatesFound: number;
    consolidated: number;
    errors: string[];
    skipped: number;
    processingTime: number;
    memoryUsage: { before: number; after: number; peak: number };
    consolidationStats: {
      groupsProcessed: number;
      totalDuplicates: number;
      averageSimilarity: number;
      safetyChecksPassed: number;
      safetyChecksFailed: number;
    };
  }> {
    const namespace = options?.namespace || this.namespace;
    const similarityThreshold = options?.similarityThreshold || 0.7;
    const dryRun = options?.dryRun || false;
    const batchSize = options?.batchSize || 10;
    const enableProgressTracking = options?.enableProgressTracking !== false;

    const startTime = Date.now();
    let memoryUsage = { before: 0, after: 0, peak: 0 };

    // Track memory usage if available
    if (typeof process !== 'undefined' && process.memoryUsage) {
      memoryUsage.before = process.memoryUsage().heapUsed;
    }

    try {
      logInfo(`Starting enhanced conscious memory consolidation in namespace: ${namespace}`, {
        component: 'ConsciousAgent',
        similarityThreshold,
        dryRun,
        batchSize,
        enableProgressTracking,
        namespace,
      });

      // Initialize consolidation statistics
      const consolidationStats = {
        groupsProcessed: 0,
        totalDuplicates: 0,
        averageSimilarity: 0,
        safetyChecksPassed: 0,
        safetyChecksFailed: 0,
      };

      // Get all conscious memories for analysis
      const consciousMemories = await this.dbManager.getProcessedConsciousMemories(namespace);
      let peakMemory = memoryUsage.before;

      if (consciousMemories.length === 0) {
        logInfo('No conscious memories found for consolidation', {
          component: 'ConsciousAgent',
          namespace,
        });
        return {
          totalProcessed: 0,
          duplicatesFound: 0,
          consolidated: 0,
          errors: [],
          skipped: 0,
          processingTime: Date.now() - startTime,
          memoryUsage,
          consolidationStats,
        };
      }

      logInfo(`Found ${consciousMemories.length} conscious memories to analyze for duplicates`, {
        component: 'ConsciousAgent',
        namespace,
        memoryCount: consciousMemories.length,
      });

      const duplicatesFound: Array<{
        primary: ConsciousMemory;
        duplicates: ConsciousMemory[];
        similarity: number;
        safetyCheckPassed: boolean;
        safetyCheckReason?: string;
      }> = [];

      const processedIds = new Set<string>();
      const errors: string[] = [];
      let skipped = 0;
      let totalSimilarity = 0;

      // Find potential duplicates by comparing each memory with others
      for (let i = 0; i < consciousMemories.length; i++) {
        const memory = consciousMemories[i];
        if (processedIds.has(memory.id)) {
          continue; // Already processed as a duplicate
        }

        try {
          // Track progress for large batches
          if (enableProgressTracking && i % Math.max(1, Math.floor(consciousMemories.length / 10)) === 0) {
            const progress = Math.round((i / consciousMemories.length) * 100);
            logDebug(`Consolidation progress: ${progress}% (${i}/${consciousMemories.length})`, {
              component: 'ConsciousAgent',
              namespace,
              progress,
              processed: i,
              total: consciousMemories.length,
            });
          }

          // Find potential duplicates for this memory using ConsolidationService
          const consolidationService = this.dbManager.getConsolidationService();
          const duplicateCandidates = await consolidationService.detectDuplicateMemories(
            memory.content + ' ' + memory.summary,
            similarityThreshold,
          );

          // Get actual memory objects for the duplicate candidates
          const consciousDuplicates: ConsciousMemory[] = [];
          for (const candidate of duplicateCandidates) {
            if (candidate.id !== memory.id && candidate.confidence >= similarityThreshold) {
              try {
                // Fetch the actual memory from database
                const memoryData = await this.dbManager.getPrismaClient().longTermMemory.findUnique({
                  where: { id: candidate.id },
                  select: {
                    id: true,
                    searchableContent: true,
                    summary: true,
                    classification: true,
                    memoryImportance: true,
                    topic: true,
                    entitiesJson: true,
                    keywordsJson: true,
                    confidenceScore: true,
                    classificationReason: true,
                  },
                });

                if (memoryData && memoryData.classification === 'conscious-info') {
                  consciousDuplicates.push({
                    id: memoryData.id,
                    content: memoryData.searchableContent || '',
                    summary: memoryData.summary,
                    classification: memoryData.classification,
                    importance: memoryData.memoryImportance,
                    topic: memoryData.topic || undefined,
                    entities: (memoryData.entitiesJson as string[]) || [],
                    keywords: (memoryData.keywordsJson as string[]) || [],
                    confidenceScore: memoryData.confidenceScore,
                    classificationReason: memoryData.classificationReason || '',
                  });
                }
              } catch (error) {
                logDebug(`Failed to fetch duplicate memory ${candidate.id}`, {
                  component: 'ConsciousAgent',
                  namespace,
                  memoryId: candidate.id,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }

          if (consciousDuplicates.length > 0) {
            // Calculate average similarity for these duplicates using DuplicateManager's algorithm
            const similarities = consciousDuplicates.map(duplicate => {
              // Use the similarity score from the candidate detection
              const candidate = duplicateCandidates.find(c => c.id === duplicate.id);
              return candidate ? candidate.similarityScore : 0.5;
            });

            const averageSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

            // Perform safety checks
            const safetyCheck = await this.performSafetyChecks(memory, consciousDuplicates, namespace);

            if (safetyCheck.passed) {
              consolidationStats.safetyChecksPassed++;

              if (averageSimilarity >= similarityThreshold) {
                duplicatesFound.push({
                  primary: memory,
                  duplicates: consciousDuplicates,
                  similarity: averageSimilarity,
                  safetyCheckPassed: true,
                });

                totalSimilarity += averageSimilarity;

                // Mark these duplicates as processed
                consciousDuplicates.forEach(duplicate => processedIds.add(duplicate.id));
              }
            } else {
              consolidationStats.safetyChecksFailed++;
              skipped++;

              logDebug(`Skipped consolidation group due to safety check failure: ${safetyCheck.reason}`, {
                component: 'ConsciousAgent',
                namespace,
                primaryId: memory.id,
                reason: safetyCheck.reason,
              });
            }
          }

          // Track peak memory usage
          if (typeof process !== 'undefined' && process.memoryUsage) {
            const currentMemory = process.memoryUsage().heapUsed;
            if (currentMemory > peakMemory) {
              peakMemory = currentMemory;
            }
          }

        } catch (error) {
          const errorMessage = `Error processing memory ${memory.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMessage);

          logError(errorMessage, {
            component: 'ConsciousAgent',
            namespace,
            memoryId: memory.id,
            error: error instanceof Error ? error.stack : String(error),
          });
        }
      }

      logInfo(`Found ${duplicatesFound.length} groups of potential duplicate memories`, {
        component: 'ConsciousAgent',
        namespace,
        duplicateGroups: duplicatesFound.length,
        skipped,
        safetyChecksPassed: consolidationStats.safetyChecksPassed,
        safetyChecksFailed: consolidationStats.safetyChecksFailed,
      });

      let consolidated = 0;
      consolidationStats.groupsProcessed = duplicatesFound.length;
      consolidationStats.totalDuplicates = duplicatesFound.reduce((sum, group) => sum + group.duplicates.length, 0);

      if (consolidationStats.totalDuplicates > 0) {
        consolidationStats.averageSimilarity = totalSimilarity / duplicatesFound.length;
      }

      // Get consolidation service for direct use
      const consolidationService = this.dbManager.getConsolidationService();

      // Process each group of duplicates in batches
      const batches = this.createBatches(duplicatesFound, batchSize);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];

        logDebug(`Processing consolidation batch ${batchIndex + 1}/${batches.length}`, {
          component: 'ConsciousAgent',
          namespace,
          batchIndex: batchIndex + 1,
          totalBatches: batches.length,
          groupsInBatch: batch.length,
        });

        const batchPromises = batch.map(async (group) => {
          try {
            return await this.processConsolidationGroup(group, namespace, dryRun, consolidationStats, consolidationService);
          } catch (error) {
            const errorMessage = `Error consolidating group with primary ${group.primary.id}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMessage);
            return null;
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);

        // Process batch results
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            consolidated += result.value.consolidated;
            errors.push(...result.value.errors);
          }
        }

        // Update memory usage tracking
        if (typeof process !== 'undefined' && process.memoryUsage) {
          const currentMemory = process.memoryUsage().heapUsed;
          if (currentMemory > peakMemory) {
            peakMemory = currentMemory;
          }
        }
      }

      // Final memory usage tracking
      if (typeof process !== 'undefined' && process.memoryUsage) {
        memoryUsage.after = process.memoryUsage().heapUsed;
        memoryUsage.peak = peakMemory;
      }

      const processingTime = Date.now() - startTime;

      logInfo('Enhanced consolidation completed successfully', {
        component: 'ConsciousAgent',
        namespace,
        totalProcessed: consolidationStats.groupsProcessed,
        duplicatesFound: consolidationStats.totalDuplicates,
        consolidated,
        skipped,
        errors: errors.length,
        processingTime: `${processingTime}ms`,
        memoryUsage: {
          before: `${Math.round(memoryUsage.before / 1024 / 1024)}MB`,
          after: `${Math.round(memoryUsage.after / 1024 / 1024)}MB`,
          peak: `${Math.round(memoryUsage.peak / 1024 / 1024)}MB`,
        },
        consolidationStats,
      });

      return {
        totalProcessed: consolidationStats.groupsProcessed,
        duplicatesFound: consolidationStats.totalDuplicates,
        consolidated,
        errors,
        skipped,
        processingTime,
        memoryUsage,
        consolidationStats,
      };

    } catch (error) {
      const errorMessage = `Error during conscious memory consolidation: ${error instanceof Error ? error.message : String(error)}`;
      logError(errorMessage, {
        component: 'ConsciousAgent',
        namespace,
        error: error instanceof Error ? error.stack : String(error),
      });
      throw new Error(errorMessage);
    }
  }

  /**
   * Clear processed memory tracking (for testing or reset)
   */
  clearProcessedMemoryTracking(): void {
    this.processedMemoryIds.clear();
  }

  /**
   * Get count of processed memories
   */
  getProcessedMemoryCount(): number {
    return this.processedMemoryIds.size;
  }

  /**
   * Get comprehensive consolidation health report
   */
  async getConsolidationHealthReport(namespace?: string): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    totalMemories: number;
    consolidatedMemories: number;
    failedConsolidations: number;
    averageConsolidationTime: number;
    lastConsolidationActivity?: Date;
    recommendations: string[];
    recentErrors: string[];
  }> {
    const targetNamespace = namespace || this.namespace;

    try {
      logInfo('Generating consolidation health report', {
        component: 'ConsciousAgent',
        namespace: targetNamespace,
      });

      // Get consolidation statistics from database
      const consolidationAnalytics = await this.dbManager.getConsolidationService().getConsolidationAnalytics();
      const consolidationStats = {
        totalMemories: consolidationAnalytics.totalMemories,
        potentialDuplicates: consolidationAnalytics.duplicateCount,
        consolidatedMemories: consolidationAnalytics.consolidatedMemories,
        consolidationRatio: consolidationAnalytics.averageConsolidationRatio,
        lastConsolidation: consolidationAnalytics.lastConsolidationActivity,
      };
      const processingMetrics = await this.dbManager.getProcessingMetrics();

      // Get recent consolidation activity
      const recentActivity = await this.dbManager.getPrismaClient().longTermMemory.findMany({
        where: {
          namespace: targetNamespace,
          processedData: {
            path: ['consolidationReason'],
            not: null,
          } as any,
        },
        orderBy: { extractionTimestamp: 'desc' },
        take: 100,
        select: {
          id: true,
          extractionTimestamp: true,
          processedData: true,
        },
      });

      // Analyze recent activity for patterns
      const recentErrors: string[] = [];
      const consolidationTimes: number[] = [];
      let failedConsolidations = 0;

      recentActivity.forEach(activity => {
        const processedData = activity.processedData as any;
        if (processedData?.consolidationFailure) {
          recentErrors.push(`Memory ${activity.id}: ${processedData.consolidationFailure}`);
          failedConsolidations++;
        }

        if (processedData?.consolidationStartTime && processedData?.consolidationEndTime) {
          const startTime = new Date(processedData.consolidationStartTime).getTime();
          const endTime = new Date(processedData.consolidationEndTime).getTime();
          consolidationTimes.push(endTime - startTime);
        }
      });

      // Calculate average consolidation time
      const averageConsolidationTime = consolidationTimes.length > 0
        ? consolidationTimes.reduce((a, b) => a + b, 0) / consolidationTimes.length
        : 0;

      // Generate recommendations based on analysis
      const recommendations: string[] = [];

      if (failedConsolidations > recentActivity.length * 0.1) {
        recommendations.push('High failure rate detected - review consolidation parameters and memory quality');
      }

      if (averageConsolidationTime > 30000) { // 30 seconds
        recommendations.push('Consolidation operations are taking too long - consider reducing batch sizes');
      }

      if (consolidationStats.potentialDuplicates > consolidationStats.totalMemories * 0.3) {
        recommendations.push('High number of potential duplicates - consider running consolidation more frequently');
      }

      if (recentActivity.length === 0) {
        recommendations.push('No recent consolidation activity - system may need initialization');
      }

      // Determine overall health status
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';

      if (failedConsolidations > 5 || recentErrors.length > 10) {
        status = 'critical';
      } else if (failedConsolidations > 2 || averageConsolidationTime > 20000) {
        status = 'warning';
      }

      const report = {
        status,
        totalMemories: consolidationStats.totalMemories,
        consolidatedMemories: consolidationStats.consolidatedMemories,
        failedConsolidations,
        averageConsolidationTime: Math.round(averageConsolidationTime),
        lastConsolidationActivity: consolidationStats.lastConsolidation,
        recommendations,
        recentErrors: recentErrors.slice(0, 5), // Limit to recent 5 errors
      };

      logInfo('Generated consolidation health report', {
        component: 'ConsciousAgent',
        namespace: targetNamespace,
        ...report,
      });

      return report;
    } catch (error) {
      logError('Error generating consolidation health report', {
        component: 'ConsciousAgent',
        namespace: targetNamespace,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        status: 'critical',
        totalMemories: 0,
        consolidatedMemories: 0,
        failedConsolidations: 0,
        averageConsolidationTime: 0,
        recommendations: ['Failed to generate health report - check system logs'],
        recentErrors: [`Health report generation failed: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Validate consolidation configuration and readiness
   */
  async validateConsolidationReadiness(namespace?: string): Promise<{
    ready: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const targetNamespace = namespace || this.namespace;
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      logInfo('Validating consolidation readiness', {
        component: 'ConsciousAgent',
        namespace: targetNamespace,
      });

      // Check database connectivity
      try {
        await this.dbManager.getDatabaseStats(targetNamespace);
      } catch (error) {
        issues.push(`Database connectivity issue: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Check for minimum memory threshold
      const stats = await this.dbManager.getDatabaseStats(targetNamespace);
      if (stats.totalMemories < 10) {
        recommendations.push('System has fewer than 10 memories - consolidation may not be beneficial yet');
      }

      // Check for conscious memories availability
      const consciousStats = await this.dbManager.getConsciousProcessingStats(targetNamespace);
      if (consciousStats.total === 0) {
        issues.push('No conscious memories found for consolidation');
      } else if (consciousStats.unprocessed > consciousStats.total * 0.5) {
        recommendations.push(`${consciousStats.unprocessed} unprocessed conscious memories - consider running conscious processing first`);
      }

      // Check system resources and performance
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memoryUsage = process.memoryUsage();
        const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

        if (memoryUsagePercent > 80) {
          recommendations.push(`High memory usage (${memoryUsagePercent.toFixed(1)}%) - consider freeing memory before consolidation`);
        }
      }

      // Check for recent consolidation failures
      const healthReport = await this.getConsolidationHealthReport(targetNamespace);
      if (healthReport.status === 'critical') {
        issues.push('System health is critical - address existing issues before consolidation');
      }

      const ready = issues.length === 0;

      logInfo('Consolidation readiness validation completed', {
        component: 'ConsciousAgent',
        namespace: targetNamespace,
        ready,
        issuesCount: issues.length,
        recommendationsCount: recommendations.length,
      });

      return { ready, issues, recommendations };
    } catch (error) {
      logError('Error validating consolidation readiness', {
        component: 'ConsciousAgent',
        namespace: targetNamespace,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        ready: false,
        issues: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
        recommendations: ['Manual system check required'],
      };
    }
  }

  /**
    * Perform enhanced safety checks before consolidation with comprehensive validation
    */
  private async performSafetyChecks(
    primaryMemory: ConsciousMemory,
    duplicateMemories: ConsciousMemory[],
    namespace: string,
  ): Promise<{ passed: boolean; reason?: string }> {
    try {
      // Safety Check 1: Ensure no self-consolidation
      if (duplicateMemories.some(dup => dup.id === primaryMemory.id)) {
        return { passed: false, reason: 'Primary memory cannot be in duplicate list' };
      }

      // Safety Check 2: Check namespace consistency
      const allMemoryIds = [primaryMemory.id, ...duplicateMemories.map(d => d.id)];
      for (const memoryId of allMemoryIds) {
        const memory = await this.dbManager.getPrismaClient().longTermMemory.findUnique({
          where: { id: memoryId },
          select: { namespace: true },
        });

        if (!memory) {
          return { passed: false, reason: `Memory ${memoryId} not found` };
        }

        if (memory.namespace !== namespace) {
          return { passed: false, reason: `Memory ${memoryId} is not in namespace ${namespace}` };
        }
      }

      // Safety Check 3: Verify all memories still exist
      const existingMemories = await this.dbManager.getPrismaClient().longTermMemory.findMany({
        where: {
          id: { in: allMemoryIds },
          namespace,
        },
        select: { id: true },
      });

      if (existingMemories.length !== allMemoryIds.length) {
        const foundIds = existingMemories.map(m => m.id);
        const missingIds = allMemoryIds.filter(id => !foundIds.includes(id));
        return { passed: false, reason: `Some memories no longer exist: ${missingIds.join(', ')}` };
      }

      // Safety Check 4: Check for circular consolidation references
      for (const duplicate of duplicateMemories) {
        const duplicateData = await this.dbManager.getPrismaClient().longTermMemory.findUnique({
          where: { id: duplicate.id },
          select: {
            processedData: true,
            searchableContent: true,
          },
        });

        if (duplicateData?.processedData &&
            (duplicateData.processedData as Record<string, unknown>)?.consolidatedInto === primaryMemory.id) {
          return { passed: false, reason: `Circular consolidation detected for memory ${duplicate.id}` };
        }
      }

      // Enhanced Safety Check 5: Check memory importance compatibility
      const primaryImportance = await this.getMemoryImportance(primaryMemory.id);
      const duplicateImportances = await Promise.all(
        duplicateMemories.map(dup => this.getMemoryImportance(dup.id))
      );

      const importanceMismatch = duplicateImportances.some(imp =>
        Math.abs(this.importanceScoreToNumber(primaryImportance) - this.importanceScoreToNumber(imp)) > 0.3
      );

      if (importanceMismatch) {
        return { passed: false, reason: 'Significant importance level mismatch between memories' };
      }

      // Enhanced Safety Check 6: Check for recent consolidation activity
      const recentConsolidationCheck = await this.checkRecentConsolidationActivity(allMemoryIds, namespace);
      if (!recentConsolidationCheck.allowed) {
        return { passed: false, reason: recentConsolidationCheck.reason };
      }

      // Enhanced Safety Check 7: Validate memory content integrity
      const contentValidation = await this.validateMemoryContentIntegrity([primaryMemory, ...duplicateMemories]);
      if (!contentValidation.isValid) {
        return { passed: false, reason: `Content integrity issue: ${contentValidation.reason}` };
      }

      // Enhanced Safety Check 8: Check consolidation size limits
      if (duplicateMemories.length > 25) {
        return { passed: false, reason: `Too many duplicates (${duplicateMemories.length}) - maximum recommended is 25 for quality consolidation` };
      }

      // Enhanced Safety Check 9: Validate memory classifications compatibility
      const classificationCheck = await this.validateClassificationCompatibility(primaryMemory, duplicateMemories);
      if (!classificationCheck.compatible) {
        return { passed: false, reason: `Incompatible classifications: ${classificationCheck.reason}` };
      }

      return { passed: true };
    } catch (error) {
      logError('Error performing enhanced safety checks', {
        component: 'ConsciousAgent',
        namespace,
        primaryId: primaryMemory.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { passed: false, reason: `Enhanced safety check error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Get memory importance level from database
   */
  private async getMemoryImportance(memoryId: string): Promise<string> {
    try {
      const memory = await this.dbManager.getPrismaClient().longTermMemory.findUnique({
        where: { id: memoryId },
        select: { memoryImportance: true },
      });
      return memory?.memoryImportance || 'medium';
    } catch (error) {
      logError('Error getting memory importance', {
        component: 'ConsciousAgent',
        memoryId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'medium';
    }
  }

  /**
   * Convert importance level to numeric score for comparison
   */
  private importanceScoreToNumber(importance: string): number {
    const scores = {
      'critical': 0.9,
      'high': 0.7,
      'medium': 0.5,
      'low': 0.3,
    };
    return scores[importance as keyof typeof scores] || 0.5;
  }

  /**
   * Check for recent consolidation activity that might indicate issues
   */
  private async checkRecentConsolidationActivity(
    memoryIds: string[],
    namespace: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Check for recent consolidation failures
      const recentFailures = await this.dbManager.getPrismaClient().longTermMemory.findMany({
        where: {
          id: { in: memoryIds },
          namespace,
          processedData: {
            path: ['consolidationFailure'],
            not: null,
          } as any,
          extractionTimestamp: {
            gte: oneHourAgo,
          },
        },
        select: { id: true, processedData: true },
      });

      if (recentFailures.length > 0) {
        return {
          allowed: false,
          reason: `Recent consolidation failures detected for ${recentFailures.length} memories in the last hour`,
        };
      }

      // Check for excessive consolidation attempts (more than 3 in last hour)
      const recentConsolidations = await this.dbManager.getPrismaClient().longTermMemory.findMany({
        where: {
          id: { in: memoryIds },
          namespace,
          processedData: {
            path: ['consolidatedAt'],
            gte: oneHourAgo,
          } as any,
        },
        select: { id: true },
      });

      if (recentConsolidations.length >= 3) {
        return {
          allowed: false,
          reason: `Excessive consolidation activity: ${recentConsolidations.length} consolidations in the last hour`,
        };
      }

      return { allowed: true };
    } catch (error) {
      logError('Error checking recent consolidation activity', {
        component: 'ConsciousAgent',
        memoryIds,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      return { allowed: false, reason: 'Failed to check consolidation activity' };
    }
  }

  /**
   * Validate memory content integrity
   */
  private async validateMemoryContentIntegrity(
    memories: ConsciousMemory[],
  ): Promise<{ isValid: boolean; reason?: string }> {
    try {
      for (const memory of memories) {
        // Check for empty or very short content
        if (!memory.content || memory.content.trim().length < 10) {
          return { isValid: false, reason: `Memory ${memory.id} has insufficient content` };
        }

        // Check for suspicious content patterns
        const suspiciousPatterns = [
          /test.*test.*test/,
          /lorem.*ipsum/,
          /placeholder.*content/,
        ];

        const lowerContent = memory.content.toLowerCase();
        if (suspiciousPatterns.some(pattern => pattern.test(lowerContent))) {
          return { isValid: false, reason: `Memory ${memory.id} contains suspicious test/placeholder content` };
        }

        // Check for reasonable content length
        if (memory.content.length > 50000) {
          return { isValid: false, reason: `Memory ${memory.id} content is too large (${memory.content.length} characters)` };
        }
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        reason: `Content integrity validation error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Validate classification compatibility between memories
   */
  private async validateClassificationCompatibility(
    primaryMemory: ConsciousMemory,
    duplicateMemories: ConsciousMemory[],
  ): Promise<{ compatible: boolean; reason?: string }> {
    try {
      // Check if all memories have the same base classification
      const allClassifications = [primaryMemory.classification, ...duplicateMemories.map(d => d.classification)];

      // For conscious memories, they should all be 'conscious-info' or related
      const nonConsciousClassifications = allClassifications.filter(cls => !cls.includes('conscious'));
      if (nonConsciousClassifications.length > 0) {
        return {
          compatible: false,
          reason: `Non-conscious classifications found: ${nonConsciousClassifications.join(', ')}`,
        };
      }

      // Check for contradictory classifications within conscious memories
      const consciousTypes = allClassifications.filter(cls => cls.includes('conscious'));
      const uniqueConsciousTypes = [...new Set(consciousTypes)];

      if (uniqueConsciousTypes.length > 2) {
        return {
          compatible: false,
          reason: `Too many different conscious memory types: ${uniqueConsciousTypes.join(', ')}`,
        };
      }

      return { compatible: true };
    } catch (error) {
      return {
        compatible: false,
        reason: `Classification compatibility check error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
    * Create batches from an array for processing
    */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
      * Process a single consolidation group
      */
   private async processConsolidationGroup(
     group: {
       primary: ConsciousMemory;
       duplicates: ConsciousMemory[];
       similarity: number;
       safetyCheckPassed: boolean;
     },
     namespace: string,
     dryRun: boolean,
     _consolidationStats: {
       groupsProcessed: number;
       totalDuplicates: number;
       averageSimilarity: number;
       safetyChecksPassed: number;
       safetyChecksFailed: number;
     },
     consolidationService: any,
   ): Promise<{ consolidated: number; errors: string[] }> {
    const errors: string[] = [];

    // Initialize state tracking for consolidation process
    const primaryMemoryId = group.primary.id;
    const duplicateIds = group.duplicates.map(d => d.id);

    try {
      // Set primary memory to consolidation processing
      await this.dbManager.transitionMemoryState(
        primaryMemoryId,
        MemoryProcessingState.CONSOLIDATION_PROCESSING,
        {
          reason: 'Starting memory consolidation',
          agentId: 'ConsciousAgent',
          metadata: {
            namespace,
            duplicateCount: duplicateIds.length,
            similarity: group.similarity,
            dryRun,
          },
        },
      );

      // Set all duplicates to consolidation processing
      for (const duplicateId of duplicateIds) {
        await this.dbManager.transitionMemoryState(
          duplicateId,
          MemoryProcessingState.CONSOLIDATION_PROCESSING,
          {
            reason: 'Memory marked for consolidation',
            agentId: 'ConsciousAgent',
            metadata: {
              namespace,
              consolidatedInto: primaryMemoryId,
              similarity: group.similarity,
            },
          },
        );
      }

      if (dryRun) {
        logInfo(`DRY RUN: Would consolidate ${group.duplicates.length} duplicates into primary memory ${group.primary.id}`, {
          component: 'ConsciousAgent',
          namespace,
          primaryId: group.primary.id,
          duplicateCount: group.duplicates.length,
          similarity: group.similarity,
        });

        logDebug(`  Similarity: ${(group.similarity * 100).toFixed(1)}%`, {
          component: 'ConsciousAgent',
          namespace,
          primaryId: group.primary.id,
        });

        logDebug(`  Primary: ${group.primary.summary.substring(0, 100)}...`, {
          component: 'ConsciousAgent',
          namespace,
          primaryId: group.primary.id,
        });

        group.duplicates.forEach((dup, idx) => {
          logDebug(`  Duplicate ${idx + 1}: ${dup.summary.substring(0, 100)}...`, {
            component: 'ConsciousAgent',
            namespace,
            primaryId: group.primary.id,
            duplicateId: dup.id,
          });
        });

        return { consolidated: 1, errors: [] };
      } else {
        // Actually consolidate the duplicates using ConsolidationService directly
        const consolidationResult = await consolidationService.consolidateMemories(
          group.primary.id,
          group.duplicates.map(d => d.id),
        );

        if (consolidationResult.consolidated > 0) {
          logInfo(`Consolidated ${consolidationResult.consolidated} duplicates into memory ${group.primary.id}`, {
            component: 'ConsciousAgent',
            namespace,
            primaryId: group.primary.id,
            consolidatedCount: consolidationResult.consolidated,
          });
        }

        if (consolidationResult.errors.length > 0) {
          errors.push(...consolidationResult.errors);
        }

        return { consolidated: consolidationResult.consolidated, errors };
      }
    } catch (error) {
      const errorMessage = `Error consolidating group with primary ${group.primary.id}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMessage);

      logError(errorMessage, {
        component: 'ConsciousAgent',
        namespace,
        primaryId: group.primary.id,
        error: error instanceof Error ? error.stack : String(error),
      });

      return { consolidated: 0, errors };
    }
  }
}