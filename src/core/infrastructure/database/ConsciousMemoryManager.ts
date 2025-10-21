/**
 * ConsciousMemoryManager - Dedicated Conscious Memory Operations Manager
 *
 * This class handles all conscious memory operations extracted from DatabaseManager.
 * It provides comprehensive conscious memory management with proper validation,
 * state tracking integration, and namespace-based filtering.
 */

import { MemoryImportanceLevel, MemoryClassification } from '../../types/schemas';
import { logInfo, logError } from '../../infrastructure/config/Logger';

import { DatabaseContext } from './DatabaseContext';
import { MemoryManager } from './MemoryManager';
import { ConsciousMemoryData, ShortTermMemoryData } from './types';
import { sanitizeNamespace, sanitizeString, ValidationError, containsDangerousPatterns, SanitizationError } from '../config/SanitizationUtils';

/**
 * ConsciousMemoryManager configuration interface
 */
export interface ConsciousMemoryManagerConfig {
  enableValidation?: boolean;
  enableStateTracking?: boolean;
  defaultNamespace?: string;
  maxBatchSize?: number;
  consciousMemoryRetentionDays?: number;
}

/**
 * Options for processing conscious memory batches
 */
export interface ProcessBatchOptions {
  dryRun?: boolean;
  skipValidation?: boolean;
  forceProcess?: boolean;
}

/**
 * Options for cleanup operations
 */
export interface CleanupOptions {
  dryRun?: boolean;
  olderThanDays?: number;
  batchSize?: number;
}

/**
 * Timeline query options
 */
export interface TimelineOptions {
  limit?: number;
  offset?: number;
  includeProcessed?: boolean;
  includeUnprocessed?: boolean;
}

/**
 * Dedicated manager for conscious memory operations
 */
export class ConsciousMemoryManager {
  private databaseContext: DatabaseContext;
  private memoryManager: MemoryManager;
  private config: Required<ConsciousMemoryManagerConfig>;

  constructor(
    databaseContext: DatabaseContext,
    memoryManager: MemoryManager,
    config: ConsciousMemoryManagerConfig = {},
  ) {
    this.databaseContext = databaseContext;
    this.memoryManager = memoryManager;

    this.config = {
      enableValidation: config.enableValidation ?? true,
      enableStateTracking: config.enableStateTracking ?? true,
      defaultNamespace: config.defaultNamespace ?? 'default',
      maxBatchSize: config.maxBatchSize ?? 100,
      consciousMemoryRetentionDays: config.consciousMemoryRetentionDays ?? 90,
    };

    logInfo('ConsciousMemoryManager initialized', {
      component: 'ConsciousMemoryManager',
      enableValidation: this.config.enableValidation,
      enableStateTracking: this.config.enableStateTracking,
      defaultNamespace: this.config.defaultNamespace,
      maxBatchSize: this.config.maxBatchSize,
    });
  }

  /**
   * Get unprocessed conscious memories for a namespace
   */
  async getUnprocessedConsciousMemories(namespace: string = this.config.defaultNamespace): Promise<ConsciousMemoryData[]> {
    const startTime = Date.now();

    try {
      logInfo('Retrieving unprocessed conscious memories', {
        component: 'ConsciousMemoryManager',
        namespace,
      });

      // Sanitize namespace
      const sanitizedNamespace = sanitizeNamespace(namespace, {
        fieldName: 'namespace',
      });

      // Get long-term memories with "conscious-info" classification that haven't been processed yet
      const memories = await this.databaseContext.getPrismaClient().longTermMemory.findMany({
        where: {
          namespace: sanitizedNamespace,
          categoryPrimary: 'conscious-info',
          consciousProcessed: false,
        },
        orderBy: { createdAt: 'desc' },
        take: 50, // Limit to prevent overwhelming the system
      });

      const results: ConsciousMemoryData[] = memories.map((memory: any) => ({
        id: memory.id,
        content: memory.searchableContent,
        summary: memory.summary,
        classification: memory.classification as unknown as MemoryClassification,
        importance: memory.memoryImportance as unknown as MemoryImportanceLevel,
        topic: memory.topic,
        entities: (memory.entitiesJson as unknown[]) as string[] || [],
        keywords: (memory.keywordsJson as unknown[]) as string[] || [],
        confidenceScore: memory.confidenceScore,
        classificationReason: memory.classificationReason || '',
      }));

      logInfo('Successfully retrieved unprocessed conscious memories', {
        component: 'ConsciousMemoryManager',
        namespace: sanitizedNamespace,
        count: results.length,
        duration: Date.now() - startTime,
      });

      return results;

    } catch (error) {
      logError('Failed to retrieve unprocessed conscious memories', {
        component: 'ConsciousMemoryManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get new conscious memories since a specific date
   */
  async getNewConsciousMemories(
    since: Date = new Date(Date.now() - 24 * 60 * 60 * 1000),
    namespace: string = this.config.defaultNamespace,
  ): Promise<ConsciousMemoryData[]> {
    const startTime = Date.now();

    try {
      logInfo('Retrieving new conscious memories', {
        component: 'ConsciousMemoryManager',
        namespace,
        since: since.toISOString(),
      });

      // Sanitize namespace
      const sanitizedNamespace = sanitizeNamespace(namespace, {
        fieldName: 'namespace',
      });

      // Get conscious memories created since the specified time that haven't been processed
      const memories = await this.databaseContext.getPrismaClient().longTermMemory.findMany({
        where: {
          namespace: sanitizedNamespace,
          categoryPrimary: 'conscious-info',
          createdAt: {
            gte: since,
          },
          consciousProcessed: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      const results: ConsciousMemoryData[] = memories.map((memory: any) => ({
        id: memory.id,
        content: memory.searchableContent,
        summary: memory.summary,
        classification: memory.classification as unknown as MemoryClassification,
        importance: memory.memoryImportance as unknown as MemoryImportanceLevel,
        topic: memory.topic,
        entities: (memory.entitiesJson as unknown[]) as string[] || [],
        keywords: (memory.keywordsJson as unknown[]) as string[] || [],
        confidenceScore: memory.confidenceScore,
        classificationReason: memory.classificationReason || '',
      }));

      logInfo('Successfully retrieved new conscious memories', {
        component: 'ConsciousMemoryManager',
        namespace: sanitizedNamespace,
        count: results.length,
        since: since.toISOString(),
        duration: Date.now() - startTime,
      });

      return results;

    } catch (error) {
      logError('Failed to retrieve new conscious memories', {
        component: 'ConsciousMemoryManager',
        namespace,
        since: since.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Store conscious memory in short-term storage
   */
  async storeConsciousMemoryInShortTerm(
    memoryData: ShortTermMemoryData,
    namespace: string = this.config.defaultNamespace,
  ): Promise<string> {
    const startTime = Date.now();

    try {
      logInfo('Storing conscious memory in short-term storage', {
        component: 'ConsciousMemoryManager',
        chatId: memoryData.chatId,
        namespace,
        category: memoryData.categoryPrimary,
      });

      // Validate input if enabled
      if (this.config.enableValidation) {
        this.validateShortTermMemoryData(memoryData);
      }

      // Sanitize namespace
      const sanitizedNamespace = sanitizeNamespace(namespace, {
        fieldName: 'namespace',
      });

      const result = await this.databaseContext.getPrismaClient().shortTermMemory.create({
        data: {
          chatId: memoryData.chatId,
          processedData: memoryData.processedData as any,
          importanceScore: memoryData.importanceScore,
          categoryPrimary: memoryData.categoryPrimary,
          retentionType: memoryData.retentionType,
          namespace: sanitizedNamespace,
          searchableContent: memoryData.searchableContent,
          summary: memoryData.summary,
          isPermanentContext: memoryData.isPermanentContext,
        },
      });

      logInfo('Successfully stored conscious memory in short-term storage', {
        component: 'ConsciousMemoryManager',
        memoryId: result.id,
        chatId: memoryData.chatId,
        namespace: sanitizedNamespace,
        duration: Date.now() - startTime,
      });

      return result.id;

    } catch (error) {
      logError('Failed to store conscious memory in short-term storage', {
        component: 'ConsciousMemoryManager',
        chatId: memoryData.chatId,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get conscious memories from short-term storage
   */
  async getConsciousMemoriesFromShortTerm(
    namespace: string = this.config.defaultNamespace,
  ): Promise<ConsciousMemoryData[]> {
    const startTime = Date.now();

    try {
      logInfo('Retrieving conscious memories from short-term storage', {
        component: 'ConsciousMemoryManager',
        namespace,
      });

      // Sanitize namespace
      const sanitizedNamespace = sanitizeNamespace(namespace, {
        fieldName: 'namespace',
      });

      const memories = await this.databaseContext.getPrismaClient().shortTermMemory.findMany({
        where: {
          namespace: sanitizedNamespace,
          isPermanentContext: true, // Only get conscious/permanent memories
        },
        orderBy: { createdAt: 'desc' },
      });

      const results: ConsciousMemoryData[] = memories.map((memory: any) => ({
        id: memory.id,
        content: memory.searchableContent,
        summary: memory.summary,
        classification: memory.categoryPrimary as unknown as MemoryClassification,
        importance: this.getImportanceLevel(memory.importanceScore) as unknown as MemoryImportanceLevel,
        topic: (memory.processedData as Record<string, unknown>)?.topic as string,
        entities: (memory.processedData as Record<string, unknown>)?.entities as string[] || [],
        keywords: (memory.processedData as Record<string, unknown>)?.keywords as string[] || [],
        confidenceScore: (memory.processedData as Record<string, unknown>)?.confidenceScore as number || 0.8,
        classificationReason: (memory.processedData as Record<string, unknown>)?.classificationReason as string || '',
      }));

      logInfo('Successfully retrieved conscious memories from short-term storage', {
        component: 'ConsciousMemoryManager',
        namespace: sanitizedNamespace,
        count: results.length,
        duration: Date.now() - startTime,
      });

      return results;

    } catch (error) {
      logError('Failed to retrieve conscious memories from short-term storage', {
        component: 'ConsciousMemoryManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mark a conscious memory as processed
   */
  async markConsciousMemoryAsProcessed(memoryId: string): Promise<void> {
    const startTime = Date.now();

    try {
      logInfo('Marking conscious memory as processed', {
        component: 'ConsciousMemoryManager',
        memoryId,
      });

      // Sanitize memory ID
      const sanitizedMemoryId = sanitizeString(memoryId, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      await this.databaseContext.getPrismaClient().longTermMemory.update({
        where: { id: sanitizedMemoryId },
        data: { consciousProcessed: true },
      });

      logInfo('Successfully marked conscious memory as processed', {
        component: 'ConsciousMemoryManager',
        memoryId: sanitizedMemoryId,
        duration: Date.now() - startTime,
      });

    } catch (error) {
      logError('Failed to mark conscious memory as processed', {
        component: 'ConsciousMemoryManager',
        memoryId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mark multiple conscious memories as processed
   */
  async markMultipleMemoriesAsProcessed(memoryIds: string[]): Promise<void> {
    const startTime = Date.now();

    try {
      logInfo('Marking multiple conscious memories as processed', {
        component: 'ConsciousMemoryManager',
        count: memoryIds.length,
      });

      // Validate input
      if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
        throw new ValidationError(
          'Memory IDs array must not be empty',
          'memoryIds',
          memoryIds,
          'array_validation',
        );
      }

      // Sanitize memory IDs
      const sanitizedMemoryIds = memoryIds.map(id =>
        sanitizeString(id, {
          fieldName: 'memoryId',
          maxLength: 100,
          allowNewlines: false,
        }),
      );

      await this.databaseContext.getPrismaClient().longTermMemory.updateMany({
        where: { id: { in: sanitizedMemoryIds } },
        data: { consciousProcessed: true },
      });

      logInfo('Successfully marked multiple conscious memories as processed', {
        component: 'ConsciousMemoryManager',
        count: sanitizedMemoryIds.length,
        duration: Date.now() - startTime,
      });

    } catch (error) {
      logError('Failed to mark multiple conscious memories as processed', {
        component: 'ConsciousMemoryManager',
        memoryIds,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get processed conscious memories for a namespace
   */
  async getProcessedConsciousMemories(namespace: string = this.config.defaultNamespace): Promise<ConsciousMemoryData[]> {
    const startTime = Date.now();

    try {
      logInfo('Retrieving processed conscious memories', {
        component: 'ConsciousMemoryManager',
        namespace,
      });

      // Sanitize namespace
      const sanitizedNamespace = sanitizeNamespace(namespace, {
        fieldName: 'namespace',
      });

      const memories = await this.databaseContext.getPrismaClient().longTermMemory.findMany({
        where: {
          namespace: sanitizedNamespace,
          categoryPrimary: 'conscious-info',
          consciousProcessed: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const results: ConsciousMemoryData[] = memories.map((memory: any) => ({
        id: memory.id,
        content: memory.searchableContent,
        summary: memory.summary,
        classification: memory.classification as unknown as MemoryClassification,
        importance: memory.memoryImportance as unknown as MemoryImportanceLevel,
        topic: memory.topic,
        entities: (memory.entitiesJson as unknown[]) as string[] || [],
        keywords: (memory.keywordsJson as unknown[]) as string[] || [],
        confidenceScore: memory.confidenceScore,
        classificationReason: memory.classificationReason || '',
        processedAt: memory.extractionTimestamp,
      }));

      logInfo('Successfully retrieved processed conscious memories', {
        component: 'ConsciousMemoryManager',
        namespace: sanitizedNamespace,
        count: results.length,
        duration: Date.now() - startTime,
      });

      return results;

    } catch (error) {
      logError('Failed to retrieve processed conscious memories', {
        component: 'ConsciousMemoryManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get conscious memory processing statistics
   */
  async getConsciousProcessingStats(namespace: string = this.config.defaultNamespace): Promise<{
    total: number;
    processed: number;
    unprocessed: number;
  }> {
    const startTime = Date.now();

    try {
      logInfo('Retrieving conscious memory processing stats', {
        component: 'ConsciousMemoryManager',
        namespace,
      });

      // Sanitize namespace
      const sanitizedNamespace = sanitizeNamespace(namespace, {
        fieldName: 'namespace',
      });

      const [total, processed, unprocessed] = await Promise.all([
        this.databaseContext.getPrismaClient().longTermMemory.count({
          where: { namespace: sanitizedNamespace, categoryPrimary: 'conscious-info' },
        }),
        this.databaseContext.getPrismaClient().longTermMemory.count({
          where: { namespace: sanitizedNamespace, categoryPrimary: 'conscious-info', consciousProcessed: true },
        }),
        this.databaseContext.getPrismaClient().longTermMemory.count({
          where: { namespace: sanitizedNamespace, categoryPrimary: 'conscious-info', consciousProcessed: false },
        }),
      ]);

      const stats = { total, processed, unprocessed };

      logInfo('Successfully retrieved conscious memory processing stats', {
        component: 'ConsciousMemoryManager',
        namespace: sanitizedNamespace,
        ...stats,
        duration: Date.now() - startTime,
      });

      return stats;

    } catch (error) {
      logError('Failed to retrieve conscious memory processing stats', {
        component: 'ConsciousMemoryManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Process a batch of conscious memories
   */
  async processConsciousMemoryBatch(
    memoryIds: string[],
    options: ProcessBatchOptions = {},
  ): Promise<{ processed: number; errors: string[] }> {
    const startTime = Date.now();
    const errors: string[] = [];
    let processed = 0;

    try {
      logInfo('Processing conscious memory batch', {
        component: 'ConsciousMemoryManager',
        count: memoryIds.length,
        dryRun: options.dryRun,
      });

      // Validate input
      if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
        throw new ValidationError(
          'Memory IDs array must not be empty',
          'memoryIds',
          memoryIds,
          'array_validation',
        );
      }

      if (memoryIds.length > this.config.maxBatchSize) {
        throw new ValidationError(
          `Batch size exceeds maximum of ${this.config.maxBatchSize}`,
          'memoryIds',
          memoryIds.length,
          'batch_size_validation',
        );
      }

      // Sanitize memory IDs
      const sanitizedMemoryIds = memoryIds.map(id =>
        sanitizeString(id, {
          fieldName: 'memoryId',
          maxLength: 100,
          allowNewlines: false,
        }),
      );

      if (options.dryRun) {
        logInfo('DRY RUN: Would process conscious memory batch', {
          component: 'ConsciousMemoryManager',
          count: sanitizedMemoryIds.length,
          options,
        });
        return { processed: sanitizedMemoryIds.length, errors: [] };
      }

      // Validate memories exist and are conscious memories
      if (!options.skipValidation && this.config.enableValidation) {
        await this.validateConsciousMemoryBatch(sanitizedMemoryIds);
      }

      // Mark memories as processed
      await this.markMultipleMemoriesAsProcessed(sanitizedMemoryIds);
      processed = sanitizedMemoryIds.length;

      logInfo('Successfully processed conscious memory batch', {
        component: 'ConsciousMemoryManager',
        processed,
        errors: errors.length,
        duration: Date.now() - startTime,
      });

      return { processed, errors };

    } catch (error) {
      const errorMsg = `Failed to process conscious memory batch: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);

      logError(errorMsg, {
        component: 'ConsciousMemoryManager',
        memoryIds,
        options,
        error: error instanceof Error ? error.stack : String(error),
      });

      return { processed, errors };
    }
  }

  /**
   * Clean up old processed conscious memories
   */
  async cleanupProcessedConsciousMemories(
    olderThanDays: number = this.config.consciousMemoryRetentionDays,
    namespace?: string,
  ): Promise<{ cleaned: number; errors: string[]; skipped: number }> {
    const startTime = Date.now();
    const errors: string[] = [];
    let cleaned = 0;
    let skipped = 0;

    try {
      logInfo('Cleaning up processed conscious memories', {
        component: 'ConsciousMemoryManager',
        olderThanDays,
        namespace,
      });

      // Sanitize namespace
      const sanitizedNamespace = namespace
        ? sanitizeNamespace(namespace, { fieldName: 'namespace' })
        : this.config.defaultNamespace;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Find old processed conscious memories
      const oldMemories = await this.databaseContext.getPrismaClient().longTermMemory.findMany({
        where: {
          namespace: sanitizedNamespace,
          categoryPrimary: 'conscious-info',
          consciousProcessed: true,
          createdAt: { lt: cutoffDate },
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      logInfo('Found processed conscious memories for cleanup', {
        component: 'ConsciousMemoryManager',
        count: oldMemories.length,
        cutoffDate: cutoffDate.toISOString(),
      });

      // Clean up each memory
      for (const memory of oldMemories) {
        try {
          const ageInDays = Math.floor((Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24));

          // Double-check age before cleanup
          if (ageInDays >= olderThanDays) {
            await this.databaseContext.getPrismaClient().longTermMemory.delete({
              where: { id: memory.id },
            });
            cleaned++;

            logInfo('Cleaned up old conscious memory', {
              component: 'ConsciousMemoryManager',
              memoryId: memory.id,
              ageInDays,
            });
          } else {
            skipped++;
          }
        } catch (error) {
          const errorMsg = `Failed to cleanup memory ${memory.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          skipped++;

          logError(errorMsg, {
            component: 'ConsciousMemoryManager',
            memoryId: memory.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logInfo('Conscious memory cleanup completed', {
        component: 'ConsciousMemoryManager',
        cleaned,
        skipped,
        errors: errors.length,
        olderThanDays,
        namespace: sanitizedNamespace,
        duration: Date.now() - startTime,
      });

      return { cleaned, errors, skipped };

    } catch (error) {
      const errorMsg = `Failed to cleanup conscious memories: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);

      logError(errorMsg, {
        component: 'ConsciousMemoryManager',
        olderThanDays,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });

      return { cleaned, errors, skipped };
    }
  }

  /**
   * Get conscious memory timeline
   */
  async getConsciousMemoryTimeline(
    namespace?: string,
    options: TimelineOptions = {},
  ): Promise<ConsciousMemoryData[]> {
    const startTime = Date.now();

    try {
      logInfo('Retrieving conscious memory timeline', {
        component: 'ConsciousMemoryManager',
        namespace,
        options,
      });

      // Sanitize namespace
      const sanitizedNamespace = namespace
        ? sanitizeNamespace(namespace, { fieldName: 'namespace' })
        : this.config.defaultNamespace;

      // Build where clause based on options
      const whereClause: any = {
        namespace: sanitizedNamespace,
        categoryPrimary: 'conscious-info',
      };

      if (options.includeProcessed !== true && options.includeUnprocessed !== false) {
        // Default: only unprocessed
        whereClause.consciousProcessed = false;
      } else if (options.includeProcessed === true && options.includeUnprocessed === false) {
        // Only processed
        whereClause.consciousProcessed = true;
      } else if (options.includeProcessed === false && options.includeUnprocessed === true) {
        // Only unprocessed
        whereClause.consciousProcessed = false;
      }
      // If both are true, include all

      const limit = Math.min(options.limit || 100, 1000);
      const offset = options.offset || 0;

      const memories = await this.databaseContext.getPrismaClient().longTermMemory.findMany({
        where: whereClause,
        take: limit,
        skip: offset,
        orderBy: [
          { consciousProcessed: 'asc' }, // Unprocessed first
          { createdAt: 'desc' }, // Then by creation date
        ],
      });

      const results: ConsciousMemoryData[] = memories.map((memory: any) => ({
        id: memory.id,
        content: memory.searchableContent,
        summary: memory.summary,
        classification: memory.classification as unknown as MemoryClassification,
        importance: memory.memoryImportance as unknown as MemoryImportanceLevel,
        topic: memory.topic,
        entities: (memory.entitiesJson as unknown[]) as string[] || [],
        keywords: (memory.keywordsJson as unknown[]) as string[] || [],
        confidenceScore: memory.confidenceScore,
        classificationReason: memory.classificationReason || '',
        processedAt: memory.consciousProcessed ? memory.extractionTimestamp : undefined,
        isConsciousContext: true,
      }));

      logInfo('Successfully retrieved conscious memory timeline', {
        component: 'ConsciousMemoryManager',
        namespace: sanitizedNamespace,
        count: results.length,
        includeProcessed: options.includeProcessed,
        includeUnprocessed: options.includeUnprocessed,
        duration: Date.now() - startTime,
      });

      return results;

    } catch (error) {
      logError('Failed to retrieve conscious memory timeline', {
        component: 'ConsciousMemoryManager',
        namespace,
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate short-term memory data
   */
  private validateShortTermMemoryData(memoryData: ShortTermMemoryData): void {
    if (!memoryData.chatId || typeof memoryData.chatId !== 'string') {
      throw new ValidationError(
        'Chat ID is required and must be a string',
        'chatId',
        memoryData.chatId,
        'required_field',
      );
    }

    if (!memoryData.categoryPrimary || typeof memoryData.categoryPrimary !== 'string') {
      throw new ValidationError(
        'Category primary is required and must be a string',
        'categoryPrimary',
        memoryData.categoryPrimary,
        'required_field',
      );
    }

    if (memoryData.importanceScore < 0 || memoryData.importanceScore > 1) {
      throw new ValidationError(
        'Importance score must be between 0 and 1',
        'importanceScore',
        memoryData.importanceScore,
        'range_validation',
      );
    }

    // Skip dangerous pattern validation for LLM-generated conscious memory content
    // This content comes from trusted LLM providers and has been processed by ConsciousAgent
    // The strict security checks are more appropriate for user inputs, not AI-generated content
  }

  /**
   * Validate that memories in a batch are valid conscious memories
   */
  private async validateConsciousMemoryBatch(memoryIds: string[]): Promise<void> {
    const memories = await this.databaseContext.getPrismaClient().longTermMemory.findMany({
      where: {
        id: { in: memoryIds },
        categoryPrimary: 'conscious-info',
      },
      select: { id: true },
    });

    if (memories.length !== memoryIds.length) {
      const foundIds = memories.map(m => m.id);
      const missingIds = memoryIds.filter(id => !foundIds.includes(id));
      throw new ValidationError(
        `Some memories are not valid conscious memories: ${missingIds.join(', ')}`,
        'memoryIds',
        missingIds,
        'batch_validation',
      );
    }
  }

  /**
   * Get importance level from score
   */
  private getImportanceLevel(score: number): string {
    if (score >= 0.8) return MemoryImportanceLevel.CRITICAL;
    if (score >= 0.6) return MemoryImportanceLevel.HIGH;
    if (score >= 0.4) return MemoryImportanceLevel.MEDIUM;
    return MemoryImportanceLevel.LOW;
  }

  /**
   * Get database context for advanced operations
   */
  getDatabaseContext(): DatabaseContext {
    return this.databaseContext;
  }

  /**
   * Get memory manager for long-term operations
   */
  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }

  /**
   * Get configuration
   */
  getConfig(): Required<ConsciousMemoryManagerConfig> {
    return { ...this.config };
  }
}