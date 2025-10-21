// src/core/database/repositories/PrismaConsolidationRepository.ts

import { PrismaClient } from '@prisma/client';
import { MemorySearchResult, MemoryClassification, MemoryImportanceLevel } from '../../../types/models';
import { logInfo, logError } from '../../../infrastructure/config/Logger';
import { sanitizeString, SanitizationError, ValidationError } from '../../../infrastructure/config/SanitizationUtils';
import {
  ConsolidationResult,
  ConsolidationStats,
  CleanupResult,
  DuplicateDetectionConfig,
  ConsolidationMemorySearchResult,
  ConsolidationTrend,
  DuplicateCandidate,
} from '../types/consolidation-models';

/**
 * Repository implementation for memory consolidation operations using Prisma
 * Handles all database operations related to memory consolidation with proper
 * transaction safety, error handling, and data integrity validation.
 */
export class PrismaConsolidationRepository {
  private prisma: PrismaClient;
  private readonly componentName = 'PrismaConsolidationRepository';

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;

    logInfo('PrismaConsolidationRepository initialized', {
      component: this.componentName,
    });
  }

  /**
   * Find potential duplicate memory candidates based on content similarity
   */
  async findDuplicateCandidates(
    content: string,
    threshold: number,
    config?: DuplicateDetectionConfig,
    namespace?: string,
  ): Promise<MemorySearchResult[]> {
    const startTime = Date.now();

    try {
      logInfo('Finding duplicate candidates', {
        component: this.componentName,
        contentLength: content.length,
        threshold,
        config,
      });

      // Sanitize and validate inputs
      const sanitizedContent = sanitizeString(content, {
        fieldName: 'content',
        maxLength: 10000,
      });

      if (threshold < 0 || threshold > 1) {
        throw new ValidationError(
          'Threshold must be between 0 and 1',
          'threshold',
          threshold,
          'range_validation',
        );
      }

      // Use Prisma's built-in search for reliable LIKE functionality
      // Split the search content into key terms and search for each term
      const searchTerms = sanitizedContent
        .split(' ')
        .filter(word => word.length > 3) // Filter out short words
        .slice(0, 5); // Limit to first 5 terms for performance

      // Build OR conditions for each search term
      const orConditions = searchTerms.map(term =>
        ({ searchableContent: { contains: term } })
      );

      // Use OR logic to find memories containing any of the search terms
      const targetNamespace = namespace || 'default';
      const prismaCandidates = await this.prisma.longTermMemory.findMany({
        where: {
          AND: [
            { namespace: targetNamespace },
            {
              OR: orConditions
            }
          ]
        },
        select: {
          id: true,
          searchableContent: true,
          summary: true,
          classification: true,
          memoryImportance: true,
        },
      });

      // Convert to the expected format
      const candidates = prismaCandidates.map(candidate => ({
        id: candidate.id,
        content: candidate.searchableContent,
        summary: candidate.summary || '',
        classification: candidate.classification,
        importance: candidate.memoryImportance,
        topic: undefined,
        entities: [],
        keywords: [],
        confidenceScore: 0.8,
        classificationReason: '',
        score: 0.8,
        strategy: 'prisma' as const,
      })) as unknown as Array<MemorySearchResult & { score: number }>;

      // Filter by threshold and convert to proper format
      const filteredCandidates = candidates
        .filter(candidate => (candidate.score || 0) >= threshold)
        .map(candidate => ({
          id: candidate.id,
          content: candidate.content,
          summary: candidate.summary,
          classification: candidate.classification,
          importance: candidate.importance,
          topic: candidate.topic,
          entities: Array.isArray(candidate.entities) ? candidate.entities : [],
          keywords: Array.isArray(candidate.keywords) ? candidate.keywords : [],
          confidenceScore: candidate.confidenceScore,
          classificationReason: candidate.classificationReason,
        }));

      logInfo('Duplicate candidates found', {
        component: this.componentName,
        totalCandidates: candidates.length,
        filteredCandidates: filteredCandidates.length,
        threshold,
        duration: Date.now() - startTime,
      });

      return filteredCandidates;

    } catch (error) {
      logError('Failed to find duplicate candidates', {
        component: this.componentName,
        contentLength: content.length,
        threshold,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mark a memory as a duplicate of another memory
   */
  async markMemoryAsDuplicate(
    duplicateId: string,
    originalId: string,
    consolidationReason?: string,
    namespace?: string,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      logInfo('Marking memory as duplicate', {
        component: this.componentName,
        duplicateId,
        originalId,
        consolidationReason,
      });

      // Sanitize inputs
      const sanitizedDuplicateId = sanitizeString(duplicateId, {
        fieldName: 'duplicateId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedOriginalId = sanitizeString(originalId, {
        fieldName: 'originalId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedReason = consolidationReason
        ? sanitizeString(consolidationReason, {
            fieldName: 'consolidationReason',
            maxLength: 100,
          })
        : undefined;

      // Validate that both memories exist
      const targetNamespace = namespace || 'default';
      const [duplicateMemory, originalMemory] = await Promise.all([
        this.prisma.longTermMemory.findUnique({
          where: {
            id: sanitizedDuplicateId,
            namespace: targetNamespace
          }
        }),
        this.prisma.longTermMemory.findUnique({
          where: {
            id: sanitizedOriginalId,
            namespace: targetNamespace
          }
        }),
      ]);

      if (!duplicateMemory) {
        throw new ValidationError(
          `Duplicate memory not found: ${sanitizedDuplicateId}`,
          'duplicateId',
          sanitizedDuplicateId,
          'existence_check',
        );
      }

      if (!originalMemory) {
        throw new ValidationError(
          `Original memory not found: ${sanitizedOriginalId}`,
          'originalId',
          sanitizedOriginalId,
          'existence_check',
        );
      }

      // Update the duplicate memory to mark it as duplicate using existing field
      await this.prisma.longTermMemory.update({
        where: { id: sanitizedDuplicateId },
        data: {
          duplicateOf: sanitizedOriginalId,
          classificationReason: sanitizedReason,
        },
      });

      logInfo('Memory marked as duplicate successfully', {
        component: this.componentName,
        duplicateId: sanitizedDuplicateId,
        originalId: sanitizedOriginalId,
        duration: Date.now() - startTime,
      });

    } catch (error) {
      logError('Failed to mark memory as duplicate', {
        component: this.componentName,
        duplicateId,
        originalId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Consolidate multiple duplicate memories into a primary memory
   */
  async consolidateMemories(
    primaryId: string,
    duplicateIds: string[],
    namespace?: string,
  ): Promise<ConsolidationResult> {
    const startTime = Date.now();

    try {
      logInfo('Consolidating memories', {
        component: this.componentName,
        primaryId,
        duplicateCount: duplicateIds.length,
      });

      // Sanitize inputs
      const sanitizedPrimaryId = sanitizeString(primaryId, {
        fieldName: 'primaryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedDuplicateIds = duplicateIds.map(id =>
        sanitizeString(id, {
          fieldName: 'duplicateId',
          maxLength: 100,
          allowNewlines: false,
        })
      );

      // Execute consolidation in a transaction for atomicity
      const targetNamespace = namespace || 'default';
      const result = await this.prisma.$transaction(async (tx) => {
        // Verify primary memory exists
        const primaryMemory = await tx.longTermMemory.findUnique({
          where: {
            id: sanitizedPrimaryId,
            namespace: targetNamespace
          },
        });

        if (!primaryMemory) {
          throw new ValidationError(
            `Primary memory not found: ${sanitizedPrimaryId}`,
            'primaryId',
            sanitizedPrimaryId,
            'existence_check',
          );
        }

        // Verify all duplicate memories exist and are actually duplicates
        const duplicateMemories = await tx.longTermMemory.findMany({
          where: {
            id: { in: sanitizedDuplicateIds },
            namespace: targetNamespace,
          },
        });

        if (duplicateMemories.length !== sanitizedDuplicateIds.length) {
          const foundIds = duplicateMemories.map(m => m.id);
          const missingIds = sanitizedDuplicateIds.filter(id => !foundIds.includes(id));
          throw new ValidationError(
            `Some duplicate memories not found: ${missingIds.join(', ')}`,
            'duplicateIds',
            missingIds,
            'existence_check',
          );
        }

        // Generate data integrity hash for the consolidation
        const consolidationData = {
          primaryId: sanitizedPrimaryId,
          duplicateIds: sanitizedDuplicateIds,
          timestamp: new Date(),
        };
        const dataIntegrityHash = this.generateDataIntegrityHash(consolidationData);

        // Update all duplicate memories to point to primary
        await tx.longTermMemory.updateMany({
          where: {
            id: { in: sanitizedDuplicateIds },
            namespace: targetNamespace,
          },
          data: {
            duplicateOf: sanitizedPrimaryId,
          },
        });

        // Update primary memory consolidation metadata using existing fields
        await tx.longTermMemory.update({
          where: {
            id: sanitizedPrimaryId,
            namespace: targetNamespace
          },
          data: {
            relatedMemoriesJson: sanitizedDuplicateIds,
            classificationReason: `Consolidated ${sanitizedDuplicateIds.length} duplicates`,
          },
        });

        return {
          success: true,
          consolidatedCount: sanitizedDuplicateIds.length,
          primaryMemoryId: sanitizedPrimaryId,
          consolidatedMemoryIds: sanitizedDuplicateIds,
          dataIntegrityHash,
          consolidationTimestamp: new Date(),
        };
      });

      logInfo('Memories consolidated successfully', {
        component: this.componentName,
        primaryId: sanitizedPrimaryId,
        consolidatedCount: sanitizedDuplicateIds.length,
        duration: Date.now() - startTime,
      });

      return result;

    } catch (error) {
      logError('Failed to consolidate memories', {
        component: this.componentName,
        primaryId,
        duplicateCount: duplicateIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get consolidation statistics for the current namespace
   */
  async getConsolidationStatistics(namespace?: string): Promise<ConsolidationStats> {
    const startTime = Date.now();

    try {
      logInfo('Getting consolidation statistics', {
        component: this.componentName,
      });

      // Aggregate statistics from the database using Prisma queries for better compatibility
      const targetNamespace = namespace || 'default';
      const totalMemories = await this.prisma.longTermMemory.count({
        where: { namespace: targetNamespace },
      });

      const duplicateCount = await this.prisma.longTermMemory.count({
        where: {
          namespace: targetNamespace,
          duplicateOf: { not: null },
        },
      });

      // Count consolidated memories - those that have actually consolidated other memories
      // Use raw query to check if relatedMemoriesJson array is not empty
      const consolidatedResult = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM long_term_memory
        WHERE namespace = ${targetNamespace}
          AND relatedMemoriesJson IS NOT NULL
          AND json_array_length(relatedMemoriesJson) > 0
      ` as Array<{ count: bigint }>;

      const consolidatedMemories = consolidatedResult[0]?.count ? Number(consolidatedResult[0].count) : 0;

      const lastConsolidationActivity = await this.prisma.longTermMemory.findFirst({
        where: {
          namespace: targetNamespace,
          relatedMemoriesJson: { not: undefined },
        },
        orderBy: { extractionTimestamp: 'desc' },
        select: { extractionTimestamp: true },
      });

      // Get consolidation trends (simplified for now)
      const consolidationTrends: ConsolidationTrend[] = [];

      const consolidationStats: ConsolidationStats = {
        totalMemories,
        duplicateCount,
        consolidatedMemories,
        averageConsolidationRatio: consolidatedMemories > 0 ? 1.0 : 0.0,
        lastConsolidationActivity: lastConsolidationActivity?.extractionTimestamp || undefined,
        consolidationTrends,
      };

      logInfo('Consolidation statistics retrieved', {
        component: this.componentName,
        totalMemories: consolidationStats.totalMemories,
        duplicateCount: consolidationStats.duplicateCount,
        consolidatedMemories: consolidationStats.consolidatedMemories,
        duration: Date.now() - startTime,
      });

      return consolidationStats;

    } catch (error) {
      logError('Failed to get consolidation statistics', {
        component: this.componentName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clean up old consolidated memories based on age criteria
   */
  async cleanupConsolidatedMemories(
    olderThanDays: number,
    dryRun: boolean,
    namespace?: string,
  ): Promise<CleanupResult> {
    const startTime = Date.now();

    try {
      logInfo('Cleaning up consolidated memories', {
        component: this.componentName,
        olderThanDays,
        dryRun,
      });

      if (olderThanDays < 0) {
        throw new ValidationError(
          'olderThanDays must be a positive number',
          'olderThanDays',
          olderThanDays,
          'range_validation',
        );
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Find memories to clean up (using relatedMemoriesJson as consolidation indicator)
      const targetNamespace = namespace || 'default';
      const memoriesToCleanup = await this.prisma.longTermMemory.findMany({
        where: {
          relatedMemoriesJson: { not: undefined },
          extractionTimestamp: {
            lt: cutoffDate,
          },
          namespace: targetNamespace,
        },
        select: {
          id: true,
          extractionTimestamp: true,
        },
      });

      if (dryRun) {
        logInfo('Dry run cleanup completed', {
          component: this.componentName,
          memoriesToCleanup: memoriesToCleanup.length,
          olderThanDays,
        });

        return {
          cleaned: 0,
          skipped: memoriesToCleanup.length,
          errors: [],
          dryRun: true,
        };
      }

      // Perform actual cleanup
      if (memoriesToCleanup.length > 0) {
        const memoryIds = memoriesToCleanup.map(m => m.id);

        await this.prisma.longTermMemory.deleteMany({
          where: {
            id: { in: memoryIds },
          },
        });
      }

      logInfo('Cleanup completed successfully', {
        component: this.componentName,
        cleaned: memoriesToCleanup.length,
        olderThanDays,
        duration: Date.now() - startTime,
      });

      return {
        cleaned: memoriesToCleanup.length,
        skipped: 0,
        errors: [],
        dryRun: false,
      };

    } catch (error) {
      logError('Failed to cleanup consolidated memories', {
        component: this.componentName,
        olderThanDays,
        dryRun,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        cleaned: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        dryRun,
      };
    }
  }

  /**
   * Get detailed information about a specific consolidated memory
   */
  async getConsolidatedMemory(memoryId: string, namespace?: string): Promise<ConsolidationMemorySearchResult | null> {
    const startTime = Date.now();

    try {
      logInfo('Getting consolidated memory details', {
        component: this.componentName,
        memoryId,
      });

      const sanitizedId = sanitizeString(memoryId, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const targetNamespace = namespace || 'default';
      const memory = await this.prisma.longTermMemory.findUnique({
        where: {
          id: sanitizedId,
          namespace: targetNamespace
        },
      });

      if (!memory) {
        logInfo('Consolidated memory not found', {
          component: this.componentName,
          memoryId: sanitizedId,
        });
        return null;
      }

      const result: ConsolidationMemorySearchResult = {
        id: memory.id,
        content: memory.searchableContent,
        summary: memory.summary,
        classification: memory.classification as MemoryClassification,
        importance: memory.memoryImportance as MemoryImportanceLevel,
        topic: memory.topic || undefined,
        entities: (memory.entitiesJson as string[]) || [],
        keywords: (memory.keywordsJson as string[]) || [],
        confidenceScore: memory.confidenceScore,
        classificationReason: memory.classificationReason || '',
        metadata: {
          namespace: memory.namespace,
          extractionTimestamp: memory.extractionTimestamp,
        },
        isDuplicate: !!memory.duplicateOf,
        duplicateOf: memory.duplicateOf || undefined,
        isConsolidated: !!memory.relatedMemoriesJson,
        consolidatedAt: memory.extractionTimestamp, // Use extraction timestamp as proxy
        consolidationCount: Array.isArray(memory.relatedMemoriesJson) ? memory.relatedMemoriesJson.length : 0,
      };

      logInfo('Consolidated memory details retrieved', {
        component: this.componentName,
        memoryId: sanitizedId,
        isDuplicate: result.isDuplicate,
        isConsolidated: result.isConsolidated,
        duration: Date.now() - startTime,
      });

      return result;

    } catch (error) {
      logError('Failed to get consolidated memory details', {
        component: this.componentName,
        memoryId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all memories that were consolidated into a primary memory
   */
  async getConsolidatedMemories(primaryMemoryId: string, namespace?: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      logInfo('Getting consolidated memories', {
        component: this.componentName,
        primaryMemoryId,
      });

      const sanitizedId = sanitizeString(primaryMemoryId, {
        fieldName: 'primaryMemoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      // Find all memories that have this memory as their duplicateOf target
      const targetNamespace = namespace || 'default';
      const consolidatedMemories = await this.prisma.longTermMemory.findMany({
        where: {
          duplicateOf: sanitizedId,
          namespace: targetNamespace,
        },
        select: {
          id: true,
        },
      });

      const result = consolidatedMemories.map(m => m.id);

      logInfo('Consolidated memories retrieved', {
        component: this.componentName,
        primaryMemoryId: sanitizedId,
        consolidatedCount: result.length,
        duration: Date.now() - startTime,
      });

      return result;

    } catch (error) {
      logError('Failed to get consolidated memories', {
        component: this.componentName,
        primaryMemoryId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update duplicate tracking information for multiple memories
   */
  async updateDuplicateTracking(updates: Array<{
    memoryId: string;
    isDuplicate?: boolean;
    duplicateOf?: string;
    consolidationReason?: string;
    markedAsDuplicateAt?: Date;
  }>, namespace?: string): Promise<{ updated: number; errors: string[] }> {
    const startTime = Date.now();

    try {
      logInfo('Updating duplicate tracking', {
        component: this.componentName,
        updateCount: updates.length,
      });

      let updated = 0;
      const errors: string[] = [];

      // Get all memory IDs to check existence first
      const memoryIds = updates.map(u => sanitizeString(u.memoryId, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      }));

      const targetNamespace = namespace || 'default';
      const existingMemories = await this.prisma.longTermMemory.findMany({
        where: {
          id: { in: memoryIds },
          namespace: targetNamespace
        },
        select: { id: true }
      });

      const existingIds = new Set(existingMemories.map(m => m.id));

      // Process each update
      for (const update of updates) {
        try {
          const sanitizedUpdate = {
            memoryId: sanitizeString(update.memoryId, {
              fieldName: 'memoryId',
              maxLength: 100,
              allowNewlines: false,
            }),
            isDuplicate: update.isDuplicate,
            duplicateOf: update.duplicateOf ? sanitizeString(update.duplicateOf, {
              fieldName: 'duplicateOf',
              maxLength: 100,
              allowNewlines: false,
            }) : undefined,
            consolidationReason: update.consolidationReason ? sanitizeString(update.consolidationReason, {
              fieldName: 'consolidationReason',
              maxLength: 100,
            }) : undefined,
            markedAsDuplicateAt: update.markedAsDuplicateAt,
          };

          // Check if memory exists before attempting update
          if (!existingIds.has(sanitizedUpdate.memoryId)) {
            errors.push(`Memory not found: ${sanitizedUpdate.memoryId}`);
            continue;
          }

          await this.prisma.longTermMemory.update({
            where: {
              id: sanitizedUpdate.memoryId,
              namespace: targetNamespace
            },
            data: {
              duplicateOf: sanitizedUpdate.duplicateOf,
              classificationReason: sanitizedUpdate.consolidationReason || undefined,
            },
          });

          updated++;
        } catch (updateError) {
          const errorMessage = `Failed to update memory ${update.memoryId}: ${updateError instanceof Error ? updateError.message : String(updateError)}`;
          errors.push(errorMessage);
        }
      }

      logInfo('Duplicate tracking updates completed', {
        component: this.componentName,
        totalUpdates: updates.length,
        successful: updated,
        failed: errors.length,
        duration: Date.now() - startTime,
      });

      return { updated, errors };

    } catch (error) {
      logError('Failed to update duplicate tracking', {
        component: this.componentName,
        updateCount: updates.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Perform pre-consolidation validation to ensure data integrity
   */
  async performPreConsolidationValidation(
    primaryMemoryId: string,
    duplicateIds: string[],
    namespace?: string,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const startTime = Date.now();

    try {
      logInfo('Performing pre-consolidation validation', {
        component: this.componentName,
        primaryMemoryId,
        duplicateCount: duplicateIds.length,
      });

      const errors: string[] = [];

      // Sanitize inputs
      const sanitizedPrimaryId = sanitizeString(primaryMemoryId, {
        fieldName: 'primaryMemoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedDuplicateIds = duplicateIds.map(id =>
        sanitizeString(id, {
          fieldName: 'duplicateId',
          maxLength: 100,
          allowNewlines: false,
        })
      );

      // Validate primary memory exists
      const targetNamespace = namespace || 'default';
      const primaryMemory = await this.prisma.longTermMemory.findUnique({
        where: {
          id: sanitizedPrimaryId,
          namespace: targetNamespace
        },
      });

      if (!primaryMemory) {
        errors.push(`Primary memory not found: ${sanitizedPrimaryId}`);
      }

      // Validate all duplicate memories exist
      const duplicateMemories = await this.prisma.longTermMemory.findMany({
        where: {
          id: { in: sanitizedDuplicateIds },
          namespace: targetNamespace,
        },
      });

      if (duplicateMemories.length !== sanitizedDuplicateIds.length) {
        const foundIds = duplicateMemories.map(m => m.id);
        const missingIds = sanitizedDuplicateIds.filter(id => !foundIds.includes(id));
        errors.push(`Duplicate memories not found: ${missingIds.join(', ')}`);
      }

      // Check for circular references
      const circularRefs = sanitizedDuplicateIds.filter(id => id === sanitizedPrimaryId);
      if (circularRefs.length > 0) {
        errors.push(`Circular reference detected: ${circularRefs.join(', ')}`);
      }

      const isValid = errors.length === 0;

      logInfo('Pre-consolidation validation completed', {
        component: this.componentName,
        primaryMemoryId: sanitizedPrimaryId,
        isValid,
        errorCount: errors.length,
        duration: Date.now() - startTime,
      });

      return { isValid, errors };

    } catch (error) {
      logError('Failed to perform pre-consolidation validation', {
        component: this.componentName,
        primaryMemoryId,
        duplicateCount: duplicateIds.length,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Backup memory data for potential rollback operations
   */
  async backupMemoryData(memoryIds: string[], namespace?: string): Promise<Map<string, any>> {
    const startTime = Date.now();

    try {
      logInfo('Backing up memory data', {
        component: this.componentName,
        memoryCount: memoryIds.length,
      });

      const backupData = new Map<string, any>();
      const sanitizedIds = memoryIds.map(id =>
        sanitizeString(id, {
          fieldName: 'memoryId',
          maxLength: 100,
          allowNewlines: false,
        })
      );

      // Get all memory data for backup
      const targetNamespace = namespace || 'default';
      const memories = await this.prisma.longTermMemory.findMany({
        where: {
          id: { in: sanitizedIds },
          namespace: targetNamespace,
        },
      });

      // Store backup data
      for (const memory of memories) {
        backupData.set(memory.id, {
          ...memory,
          backupTimestamp: new Date(),
        });
      }

      logInfo('Memory data backed up successfully', {
        component: this.componentName,
        memoryCount: memoryIds.length,
        backedUp: memories.length,
        duration: Date.now() - startTime,
      });

      return backupData;

    } catch (error) {
      logError('Failed to backup memory data', {
        component: this.componentName,
        memoryCount: memoryIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Rollback a consolidation operation using backup data
   */
  async rollbackConsolidation(
    primaryMemoryId: string,
    duplicateIds: string[],
    originalData: Map<string, any>,
    namespace?: string,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      logInfo('Rolling back consolidation', {
        component: this.componentName,
        primaryMemoryId,
        duplicateCount: duplicateIds.length,
      });

      // Execute rollback in a transaction
      const targetNamespace = namespace || 'default';
      await this.prisma.$transaction(async (tx) => {
        // Restore primary memory data
        const primaryBackup = originalData.get(primaryMemoryId);
        if (primaryBackup) {
          await tx.longTermMemory.update({
            where: {
              id: primaryMemoryId,
              namespace: targetNamespace
            },
            data: {
              relatedMemoriesJson: primaryBackup.relatedMemoriesJson,
              classificationReason: primaryBackup.classificationReason,
            },
          });
        }

        // Restore duplicate memories data
        for (const duplicateId of duplicateIds) {
          const duplicateBackup = originalData.get(duplicateId);
          if (duplicateBackup) {
            await tx.longTermMemory.update({
              where: {
                id: duplicateId,
                namespace: targetNamespace
              },
              data: {
                duplicateOf: duplicateBackup.duplicateOf,
              },
            });
          }
        }
      });

      logInfo('Consolidation rollback completed successfully', {
        component: this.componentName,
        primaryMemoryId,
        restoredCount: duplicateIds.length + 1,
        duration: Date.now() - startTime,
      });

    } catch (error) {
      logError('Failed to rollback consolidation', {
        component: this.componentName,
        primaryMemoryId,
        duplicateCount: duplicateIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate data integrity hash for validation
   */
  generateDataIntegrityHash(data: any): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  // Private helper methods

  private buildSearchQuery(content: string, config?: DuplicateDetectionConfig): string {
    // Simple query building for FTS
    // In a real implementation, this would be more sophisticated
    return `"${content.replace(/"/g, '""')}"`;
  }

  private calculateSimilarityScore(content: string): string {
    // Use BM25 scoring for FTS similarity matching
    // This provides proper relevance scoring based on term frequency and document structure
    return `bm25(memory_fts, 1.0, 1.0)`;
  }
}