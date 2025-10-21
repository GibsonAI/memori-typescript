import { logInfo, logError } from '../../infrastructure/config/Logger';
import { IConsolidationRepository } from './interfaces/IConsolidationRepository';
import { ConsolidationService } from './interfaces/ConsolidationService';
import { DuplicateManager } from './DuplicateManager';
import {
  DuplicateCandidate,
  ConsolidationResult,
  ConsolidationStats,
  CleanupResult,
  DuplicateDetectionConfig,
  ConsolidationTrend,
} from './types/consolidation-models';

// Node.js crypto module for hashing
import { createHash } from 'node:crypto';
import { MemoryImportanceLevel } from '@/core/types/schemas';

/**
 * MemoryConsolidationService - Pure domain service for memory consolidation operations
 *
 * Implements ConsolidationService interface and uses IConsolidationRepository for data access
 * Extracted from DatabaseManager to follow Single Responsibility Principle
 */
export class MemoryConsolidationService implements ConsolidationService {
  private duplicateManager?: DuplicateManager;
  private namespace: string;

  constructor(
    private repository: IConsolidationRepository,
    duplicateManagerOrNamespace?: DuplicateManager | string,
    namespace?: string,
  ) {
    if (duplicateManagerOrNamespace instanceof DuplicateManager) {
      this.duplicateManager = duplicateManagerOrNamespace;
      this.namespace = namespace || 'default';
    } else {
      // Handle string namespace parameter
      this.namespace = duplicateManagerOrNamespace || 'default';
    }
  }

  /**
   * Set DuplicateManager for similarity calculations
   */
  setDuplicateManager(duplicateManager: DuplicateManager): void {
    this.duplicateManager = duplicateManager;
  }

  /**
   * Detect potential duplicate memories for given content
   */
  async detectDuplicateMemories(
    content: string,
    threshold: number = 0.7,
    config?: DuplicateDetectionConfig,
  ): Promise<DuplicateCandidate[]> {
    try {
      logInfo('Starting duplicate memory detection', {
        component: 'MemoryConsolidationService',
        contentLength: content.length,
        threshold,
        namespace: this.namespace,
        hasConfig: !!config,
      });

      // Use repository to find duplicate candidates
      const candidates = await this.repository.findDuplicateCandidates(content, threshold, config, this.namespace);

      // Convert to DuplicateCandidate format with business logic
      const duplicateCandidates: DuplicateCandidate[] = [];

      for (const candidate of candidates) {
        // Use DuplicateManager for sophisticated similarity calculation if available
        let similarityScore = 0.5; // Default score

        if (this.duplicateManager) {
          // Use DuplicateManager's sophisticated similarity algorithm
          similarityScore = this.duplicateManager.calculateContentSimilarity(content, candidate.content);
        } else {
          // Fallback to repository-based scoring (FTS/LIKE based)
          // Extract score from candidate if available (would be provided by FTS)
          similarityScore = (candidate as any).score || 0.5;
        }

        duplicateCandidates.push({
          id: candidate.id,
          content: candidate.content,
          similarityScore,
          confidence: this.calculateDuplicateConfidence(similarityScore, content, candidate.content),
          consolidationRecommendation: this.getConsolidationRecommendation(similarityScore),
        });
      }

      // Filter and sort by confidence score
      const filteredCandidates = duplicateCandidates
        .filter(candidate => candidate.confidence >= 0.5)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, config?.maxCandidates || 50);

      logInfo('Completed duplicate memory detection', {
        component: 'MemoryConsolidationService',
        namespace: this.namespace,
        totalCandidates: candidates.length,
        filteredCandidates: filteredCandidates.length,
        threshold,
      });

      return filteredCandidates;
    } catch (error) {
      logError('Error in detectDuplicateMemories', {
        component: 'MemoryConsolidationService',
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate confidence score for duplicate detection
   */
  private calculateDuplicateConfidence(similarityScore: number, content1: string, content2: string): number {
    // Base confidence from similarity score
    let confidence = similarityScore;

    // Boost confidence if content lengths are similar (indicates real duplicates vs fragments)
    const lengthRatio = Math.min(content1.length, content2.length) / Math.max(content1.length, content2.length);
    if (lengthRatio > 0.8) {
      confidence += 0.1;
    }

    // Boost confidence if both contents are substantial (not tiny fragments)
    const avgLength = (content1.length + content2.length) / 2;
    if (avgLength > 200) {
      confidence += 0.05;
    }

    // Penalize very short similar content (likely coincidental matches)
    if (avgLength < 50 && similarityScore > 0.9) {
      confidence -= 0.2;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get consolidation recommendation based on similarity score
   */
  private getConsolidationRecommendation(similarityScore: number): 'merge' | 'replace' | 'ignore' {
    if (similarityScore >= 0.9) {
      return 'merge'; // Very similar, safe to merge
    } else if (similarityScore >= 0.7) {
      return 'replace'; // Moderately similar, consider replacement
    } else {
      return 'ignore'; // Low similarity, ignore
    }
  }

  /**
   * Mark a memory as a duplicate of another memory
   */
 async markMemoryAsDuplicate(
   duplicateId: string,
   originalId: string,
   reason: string = 'automatic_detection',
 ): Promise<void> {
   try {
     // Use repository to mark memory as duplicate
     await this.repository.markMemoryAsDuplicate(duplicateId, originalId, reason, this.namespace);

     logInfo(`Marked memory ${duplicateId} as duplicate of ${originalId}`, {
       component: 'MemoryConsolidationService',
       duplicateId,
       originalId,
       reason,
       namespace: this.namespace,
     });
   } catch (error) {
     logError(`Error marking memory ${duplicateId} as duplicate of ${originalId}`, {
       component: 'MemoryConsolidationService',
       duplicateId,
       originalId,
       reason,
       namespace: this.namespace,
       error: error instanceof Error ? error.message : String(error),
     });
     throw error;
   }
 }

  /**
   * Update duplicate tracking information for memories using repository
   */
  async updateDuplicateTracking(
    updates: Array<{
      memoryId: string;
      isDuplicate?: boolean;
      duplicateOf?: string;
      consolidationReason?: string;
      markedAsDuplicateAt?: Date;
    }>,
  ): Promise<{ updated: number; errors: string[] }> {
    try {
      return await this.repository.updateDuplicateTracking(updates, this.namespace);
    } catch (error) {
      const errorMsg = `Error updating duplicate tracking: ${error instanceof Error ? error.message : String(error)}`;
      logError(errorMsg, {
        component: 'MemoryConsolidationService',
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(errorMsg);
    }
  }

  /**
   * Consolidate multiple duplicate memories into a primary memory
   */
  async consolidateMemories(
    primaryId: string,
    duplicateIds: string[],
  ): Promise<ConsolidationResult> {
    const errors: string[] = [];
    let consolidatedCount = 0;

    try {
      logInfo(`Starting consolidation of ${duplicateIds.length} duplicates into primary memory ${primaryId}`, {
        component: 'MemoryConsolidationService',
        primaryId,
        duplicateCount: duplicateIds.length,
        namespace: this.namespace,
      });

      // Use repository to perform consolidation
      const result = await this.repository.consolidateMemories(primaryId, duplicateIds, this.namespace);

      logInfo(`Successfully completed consolidation of ${result.consolidatedCount} duplicates into primary memory ${primaryId}`, {
        component: 'MemoryConsolidationService',
        primaryId,
        consolidatedCount: result.consolidatedCount,
        namespace: this.namespace,
        consolidationTimestamp: result.consolidationTimestamp,
      });

      return result;
    } catch (error) {
      const errorMsg = `Consolidation failed for primary memory ${primaryId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);

      logError(errorMsg, {
        component: 'MemoryConsolidationService',
        primaryId,
        duplicateIds,
        namespace: this.namespace,
        error: error instanceof Error ? error.stack : String(error),
      });

      return {
        success: false,
        consolidatedCount: 0,
        primaryMemoryId: primaryId,
        consolidatedMemoryIds: [],
        dataIntegrityHash: '',
        consolidationTimestamp: new Date(),
      };
    }
  }

  /**
   * Clean up old consolidated memories based on age criteria
   */
  async cleanupOldConsolidatedMemories(
    olderThanDays: number = 30,
    dryRun: boolean = false,
  ): Promise<CleanupResult> {
    try {
      logInfo(`Starting cleanup of consolidated memories older than ${olderThanDays} days`, {
        component: 'MemoryConsolidationService',
        namespace: this.namespace,
        olderThanDays,
        dryRun,
      });

      // Use repository to perform cleanup
      const result = await this.repository.cleanupConsolidatedMemories(olderThanDays, dryRun, this.namespace);

      logInfo(`Cleanup completed for namespace '${this.namespace}'`, {
        component: 'MemoryConsolidationService',
        namespace: this.namespace,
        cleaned: result.cleaned,
        skipped: result.skipped,
        errors: result.errors.length,
        olderThanDays,
        dryRun,
      });

      return {
        ...result,
        dryRun,
      };
    } catch (error) {
      const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
      logError(errorMsg, {
        component: 'MemoryConsolidationService',
        namespace: this.namespace,
        olderThanDays,
        dryRun,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        cleaned: 0,
        skipped: 0,
        errors: [errorMsg],
        dryRun,
      };
    }
  }

  /**
   * Get comprehensive consolidation analytics and statistics
   */
  async getConsolidationAnalytics(): Promise<ConsolidationStats> {
    try {
      // Use repository to get statistics
       const stats = await this.repository.getConsolidationStatistics(this.namespace);

      // Calculate trends based on current data
      const consolidationTrends: ConsolidationTrend[] = [];

      logInfo(`Retrieved consolidation analytics for namespace '${this.namespace}'`, {
        component: 'MemoryConsolidationService',
        namespace: this.namespace,
        totalMemories: stats.totalMemories,
        duplicateCount: stats.duplicateCount,
        consolidatedMemories: stats.consolidatedMemories,
      });

      return {
        ...stats,
        consolidationTrends,
      };
    } catch (error) {
      logError(`Error retrieving consolidation analytics`, {
        component: 'MemoryConsolidationService',
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate that memories can be safely consolidated
   */
  async validateConsolidationEligibility(
    primaryId: string,
    duplicateIds: string[],
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Use repository for pre-consolidation validation
      const validation = await this.repository.performPreConsolidationValidation(primaryId, duplicateIds, this.namespace);

      // Add business logic warnings
      if (duplicateIds.length > 50) {
        warnings.push('Large number of duplicates may impact performance');
      }

      if (duplicateIds.length > 100) {
        errors.push('Too many duplicates - maximum recommended is 100');
      }

      logInfo(`Consolidation eligibility validation completed`, {
        component: 'MemoryConsolidationService',
        primaryId,
        duplicateCount: duplicateIds.length,
        isValid: validation.isValid && errors.length === 0,
        errors: validation.errors.length + errors.length,
        warnings: warnings.length,
      });

      return {
        isValid: validation.isValid && errors.length === 0,
        errors: [...validation.errors, ...errors],
        warnings,
      };
    } catch (error) {
      const errorMsg = `Validation failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);

      return {
        isValid: false,
        errors,
        warnings,
      };
    }
  }


  /**
   * Helper method to calculate importance score for memory consolidation
   */
  private calculateImportanceScore(level: string): number {
    const scores = {
      [MemoryImportanceLevel.CRITICAL]: 0.9,
      [MemoryImportanceLevel.HIGH]: 0.7,
      [MemoryImportanceLevel.MEDIUM]: 0.5,
      [MemoryImportanceLevel.LOW]: 0.3,
    };
    return scores[level as MemoryImportanceLevel] || 0.5;
  }


  /**
   * Generate data integrity hash for validation
   */
  private generateDataIntegrityHash(data: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
    const content = JSON.stringify(data, Object.keys(data).sort());
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

 /**
  * Helper method to calculate weighted confidence scores from all memories
  */
 private calculateWeightedConfidenceScore(
   primaryConfidence: number,
   duplicateConfidences: number[],
 ): number {
   const primaryWeight = 0.6; // Primary memory gets 60% weight
   const totalDuplicateWeight = 0.4; // Remaining 40% distributed among duplicates
   const duplicateWeight = duplicateConfidences.length > 0 ? totalDuplicateWeight / duplicateConfidences.length : 0;

   let totalConfidenceScore = primaryConfidence * primaryWeight;
   duplicateConfidences.forEach(confidence => {
     totalConfidenceScore += confidence * duplicateWeight;
   });

   return Math.round(totalConfidenceScore * 100) / 100;
 }

  /**
   * Helper method to combine classification reasons intelligently
   */
  private combineClassificationReasons(
    primaryReason: string,
    duplicateReasons: string[],
  ): string {
    const allReasons = [primaryReason, ...duplicateReasons].filter(Boolean);

    // Remove duplicates while preserving order
    const uniqueReasons = Array.from(new Set(allReasons));

    // Combine into a single coherent explanation
    if (uniqueReasons.length === 1) {
      return uniqueReasons[0];
    }

    return `Primary classification: ${uniqueReasons[0]}. Additional context: ${uniqueReasons.slice(1).join('; ')}`;
  }

  /**
   * Helper method to check if a word is a common stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
      'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'what', 'which',
      'who', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
      'than', 'too', 'very', 'just', 'like', 'also', 'well', 'now', 'here', 'there',
    ]);

    return stopWords.has(word.toLowerCase());
  }




  /**
   * Get detailed consolidation history for a specific memory
   */
  async getConsolidationHistory(memoryId: string): Promise<{
    consolidationEvents: Array<{
      timestamp: Date;
      operation: 'marked_duplicate' | 'consolidated' | 'rollback';
      relatedMemoryIds: string[];
      reason?: string;
      rollbackToken?: string;
    }>;
    currentStatus: 'active' | 'duplicate' | 'consolidated' | 'cleaned';
  }> {
    try {
      // Get consolidated memory details from repository
      const consolidatedMemory = await this.repository.getConsolidatedMemory(memoryId, this.namespace);

      const consolidationEvents = [];
      let currentStatus: 'active' | 'duplicate' | 'consolidated' | 'cleaned' = 'active';

      if (consolidatedMemory) {
        // Determine current status based on consolidation metadata
        if (consolidatedMemory.isConsolidated) {
          currentStatus = 'consolidated';
        } else if (consolidatedMemory.isDuplicate) {
          currentStatus = 'duplicate';
        }

        // Add consolidation event if memory was consolidated
        if (consolidatedMemory.consolidatedAt) {
          consolidationEvents.push({
            timestamp: consolidatedMemory.consolidatedAt,
            operation: 'consolidated' as const,
            relatedMemoryIds: [memoryId],
            reason: 'duplicate_consolidation',
          });
        }
      }

      logInfo(`Retrieved consolidation history for memory ${memoryId}`, {
        component: 'MemoryConsolidationService',
        memoryId,
        namespace: this.namespace,
        eventsCount: consolidationEvents.length,
        currentStatus,
      });

      return {
        consolidationEvents,
        currentStatus,
      };
    } catch (error) {
      logError(`Error retrieving consolidation history for memory ${memoryId}`, {
        component: 'MemoryConsolidationService',
        memoryId,
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Preview what would happen during a consolidation operation
   */
  async previewConsolidation(
    primaryId: string,
    duplicateIds: string[],
  ): Promise<{
    estimatedResult: {
      consolidatedCount: number;
      dataIntegrityHash: string;
      contentChanges: string[];
      metadataChanges: Record<string, any>;
    };
    warnings: string[];
    recommendations: string[];
  }> {
    try {
      const warnings: string[] = [];
      const recommendations: string[] = [];

      // Validate consolidation eligibility first
      const validation = await this.validateConsolidationEligibility(primaryId, duplicateIds);

      if (!validation.isValid) {
        warnings.push(...validation.errors);
      }

      // Add business logic warnings and recommendations
      if (duplicateIds.length > 50) {
        warnings.push('Large consolidation may take significant time');
        recommendations.push('Consider consolidating in smaller batches');
      }

      if (duplicateIds.length > 0) {
        recommendations.push('Ensure backup data is available before proceeding');
        recommendations.push('Review consolidated content after operation');
      }

      // Generate preview hash based on current data
      const dataIntegrityHash = this.repository.generateDataIntegrityHash({
        primaryId,
        duplicateIds,
        timestamp: new Date(),
      });

      const contentChanges = [
        `Primary memory will be enhanced with data from ${duplicateIds.length} duplicates`,
        'Content will be merged and deduplicated',
        'Metadata will be consolidated based on quality scoring',
      ];

      const metadataChanges = {
        consolidationCount: duplicateIds.length,
        operationType: 'preview',
        estimatedImprovement: 'medium',
      };

      logInfo(`Generated consolidation preview for primary memory ${primaryId}`, {
        component: 'MemoryConsolidationService',
        primaryId,
        duplicateCount: duplicateIds.length,
        warnings: warnings.length,
        recommendations: recommendations.length,
      });

      return {
        estimatedResult: {
          consolidatedCount: duplicateIds.length,
          dataIntegrityHash,
          contentChanges,
          metadataChanges,
        },
        warnings,
        recommendations,
      };
    } catch (error) {
      logError(`Error generating consolidation preview for memory ${primaryId}`, {
        component: 'MemoryConsolidationService',
        primaryId,
        duplicateIds,
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
    * Rollback a previously completed consolidation operation with comprehensive validation
    */
   async rollbackConsolidation(
     primaryMemoryId: string,
     rollbackToken: string,
   ): Promise<{
     success: boolean;
     restoredMemories: number;
     errors: string[];
   }> {
     const errors: string[] = [];

     try {
       logInfo(`Starting comprehensive rollback of consolidation for memory ${primaryMemoryId}`, {
         component: 'MemoryConsolidationService',
         primaryMemoryId,
         rollbackToken,
         namespace: this.namespace,
       });

       // Validate rollback token exists and is valid
       if (!rollbackToken || rollbackToken.trim().length === 0) {
         errors.push('Valid rollback token is required');
         return {
           success: false,
           restoredMemories: 0,
           errors,
         };
       }

       // Get consolidated memories that need to be rolled back
       const consolidatedMemoryIds = await this.repository.getConsolidatedMemories(primaryMemoryId, this.namespace);

       if (consolidatedMemoryIds.length === 0) {
         errors.push('No consolidated memories found for rollback');
         return {
           success: false,
           restoredMemories: 0,
           errors,
         };
       }

       // Validate all memories still exist before rollback
       const validation = await this.validateConsolidationEligibility(primaryMemoryId, consolidatedMemoryIds);
       if (!validation.isValid) {
         errors.push(...validation.errors);
         errors.push('Cannot rollback - some memories are no longer eligible');
         return {
           success: false,
           restoredMemories: 0,
           errors,
         };
       }

       // Backup current state before rollback for safety
       const currentData = await this.repository.backupMemoryData([primaryMemoryId, ...consolidatedMemoryIds], this.namespace);

       // Create enhanced rollback data with validation
       const rollbackData = new Map<string, any>();
       for (const [memoryId, data] of currentData) {
         rollbackData.set(memoryId, {
           ...data,
           rollbackTimestamp: new Date(),
           rollbackToken,
           rollbackReason: 'user_requested',
           originalConsolidationState: {
             consolidatedAt: data.extractionTimestamp,
             consolidationReason: data.classificationReason,
           }
         });
       }

       // Use repository rollback method with enhanced data
       await this.repository.rollbackConsolidation(primaryMemoryId, consolidatedMemoryIds, rollbackData, this.namespace);

       // Verify rollback was successful by checking memory states
       const verification = await this.verifyRollbackSuccess(primaryMemoryId, consolidatedMemoryIds);
       if (!verification.success) {
         errors.push(...verification.errors);
         logError('Rollback verification failed', {
           component: 'MemoryConsolidationService',
           primaryMemoryId,
           consolidatedMemoryIds,
           verificationErrors: verification.errors,
         });
         return {
           success: false,
           restoredMemories: 0,
           errors,
         };
       }

       logInfo(`Successfully completed comprehensive rollback for memory ${primaryMemoryId}`, {
         component: 'MemoryConsolidationService',
         primaryMemoryId,
         restoredMemories: consolidatedMemoryIds.length,
         rollbackToken,
         namespace: this.namespace,
         verificationPassed: verification.success,
       });

       return {
         success: true,
         restoredMemories: consolidatedMemoryIds.length,
         errors: [],
       };
     } catch (error) {
       const errorMsg = `Comprehensive rollback failed for memory ${primaryMemoryId}: ${error instanceof Error ? error.message : String(error)}`;
       errors.push(errorMsg);

       logError(errorMsg, {
         component: 'MemoryConsolidationService',
         primaryMemoryId,
         rollbackToken,
         namespace: this.namespace,
         error: error instanceof Error ? error.stack : String(error),
       });

       return {
         success: false,
         restoredMemories: 0,
         errors,
       };
     }
   }

   /**
    * Verify that rollback operation completed successfully
    */
   private async verifyRollbackSuccess(primaryMemoryId: string, consolidatedMemoryIds: string[]): Promise<{ success: boolean; errors: string[] }> {
     const errors: string[] = [];

     try {
       // Check that primary memory no longer has consolidation metadata
       const primaryMemory = await this.repository.getConsolidatedMemory(primaryMemoryId, this.namespace);
       if (primaryMemory?.isConsolidated) {
         errors.push(`Primary memory ${primaryMemoryId} still shows as consolidated after rollback`);
       }

       // Check that all consolidated memories are no longer marked as duplicates
       for (const memoryId of consolidatedMemoryIds) {
         const memory = await this.repository.getConsolidatedMemory(memoryId, this.namespace);
         if (memory?.isDuplicate) {
           errors.push(`Memory ${memoryId} still shows as duplicate after rollback`);
         }
       }

       return {
         success: errors.length === 0,
         errors,
       };
     } catch (error) {
       return {
         success: false,
         errors: [`Verification failed: ${error instanceof Error ? error.message : String(error)}`],
       };
     }
   }

  /**
   * Get consolidation recommendations for optimizing memory storage
   */
  async getOptimizationRecommendations(): Promise<{
    recommendations: Array<{
      type: 'cleanup' | 'consolidation' | 'archival';
      priority: 'low' | 'medium' | 'high';
      description: string;
      estimatedBenefit: string;
      actionRequired: string[];
    }>;
    overallHealth: 'good' | 'fair' | 'poor';
    nextMaintenanceDate?: Date;
  }> {
    try {
      const recommendations = [];
      let overallHealth: 'good' | 'fair' | 'poor' = 'good';

      // Get current statistics for analysis
      const stats = await this.repository.getConsolidationStatistics(this.namespace);

      // Analyze consolidation ratio
      if (stats.totalMemories > 0) {
        const consolidationRatio = stats.consolidatedMemories / stats.totalMemories;

        if (consolidationRatio < 0.1) {
          recommendations.push({
            type: 'consolidation' as const,
            priority: 'high' as const,
            description: 'Low consolidation ratio detected - many potential duplicates exist',
            estimatedBenefit: 'Reduce storage usage by 20-30%',
            actionRequired: ['Run duplicate detection', 'Review and consolidate similar memories'],
          });
          overallHealth = 'fair';
        }

        if (consolidationRatio > 0.5) {
          recommendations.push({
            type: 'cleanup' as const,
            priority: 'medium' as const,
            description: 'High consolidation ratio - consider cleanup of old consolidated memories',
            estimatedBenefit: 'Free up storage space',
            actionRequired: ['Review memories older than 30 days', 'Archive or cleanup as appropriate'],
          });
        }
      }

      // Analyze last consolidation activity
      if (stats.lastConsolidationActivity) {
        const daysSinceLastConsolidation = (Date.now() - stats.lastConsolidationActivity.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceLastConsolidation > 7) {
          recommendations.push({
            type: 'consolidation' as const,
            priority: 'medium' as const,
            description: 'No recent consolidation activity detected',
            estimatedBenefit: 'Maintain optimal memory organization',
            actionRequired: ['Schedule regular consolidation runs', 'Monitor for new duplicates'],
          });
        }
      }

      // Default recommendation if no specific issues found
      if (recommendations.length === 0) {
        recommendations.push({
          type: 'consolidation' as const,
          priority: 'low' as const,
          description: 'System is well-maintained',
          estimatedBenefit: 'Continue regular monitoring',
          actionRequired: ['Monitor consolidation metrics', 'Schedule monthly reviews'],
        });
      }

      const nextMaintenanceDate = new Date();
      nextMaintenanceDate.setDate(nextMaintenanceDate.getDate() + 7); // Weekly maintenance

      logInfo(`Generated optimization recommendations`, {
        component: 'MemoryConsolidationService',
        namespace: this.namespace,
        recommendationCount: recommendations.length,
        overallHealth,
        nextMaintenanceDate,
      });

      return {
        recommendations,
        overallHealth,
        nextMaintenanceDate,
      };
    } catch (error) {
      logError(`Error generating optimization recommendations`, {
        component: 'MemoryConsolidationService',
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}