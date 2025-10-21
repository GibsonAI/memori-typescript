// src/core/database/interfaces/ConsolidationService.ts

import {
  DuplicateCandidate,
  ConsolidationResult,
  ConsolidationStats,
  CleanupResult,
  DuplicateDetectionConfig,
} from '../types/consolidation-models';

/**
 * Business-focused service contract for memory consolidation operations
 * Provides high-level consolidation functionality without infrastructure concerns
 */
export interface ConsolidationService {
  /**
   * Detect potential duplicate memories for given content
   * @param content - Content to analyze for duplicates
   * @param threshold - Similarity threshold for duplicate detection (0-1)
   * @param config - Optional configuration for detection algorithm
   * @returns Promise resolving to array of duplicate candidates with recommendations
   */
  detectDuplicateMemories(
    content: string,
    threshold?: number,
    config?: DuplicateDetectionConfig,
  ): Promise<DuplicateCandidate[]>;

  /**
   * Consolidate multiple duplicate memories into a primary memory
   * @param primaryId - ID of the primary memory to keep after consolidation
   * @param duplicateIds - Array of IDs of duplicate memories to consolidate
   * @returns Promise resolving to consolidation operation result
   */
  consolidateMemories(
    primaryId: string,
    duplicateIds: string[],
  ): Promise<ConsolidationResult>;

  /**
   * Mark a specific memory as a duplicate of another memory
   * @param duplicateId - ID of the memory being marked as duplicate
   * @param originalId - ID of the original memory
   * @param reason - Optional reason for marking as duplicate
   * @returns Promise that resolves when the operation is complete
   */
  markMemoryAsDuplicate(
    duplicateId: string,
    originalId: string,
    reason?: string,
  ): Promise<void>;

  /**
   * Clean up old consolidated memories based on age criteria
   * @param olderThanDays - Remove memories older than this many days (default: 30)
   * @param dryRun - If true, only simulate the cleanup (default: false)
   * @returns Promise resolving to cleanup operation result
   */
  cleanupOldConsolidatedMemories(
    olderThanDays?: number,
    dryRun?: boolean,
  ): Promise<CleanupResult>;

  /**
   * Get comprehensive consolidation analytics and statistics
   * @returns Promise resolving to current consolidation statistics
   */
  getConsolidationAnalytics(): Promise<ConsolidationStats>;

  /**
   * Validate that memories can be safely consolidated
   * @param primaryId - ID of the primary memory
   * @param duplicateIds - Array of duplicate memory IDs to validate
   * @returns Promise resolving to validation result with any errors
   */
  validateConsolidationEligibility(
    primaryId: string,
    duplicateIds: string[],
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }>;

  /**
   * Get detailed consolidation history for a specific memory
   * @param memoryId - ID of the memory to get history for
   * @returns Promise resolving to consolidation history data
   */
  getConsolidationHistory(memoryId: string): Promise<{
    consolidationEvents: Array<{
      timestamp: Date;
      operation: 'marked_duplicate' | 'consolidated' | 'rollback';
      relatedMemoryIds: string[];
      reason?: string;
      rollbackToken?: string;
    }>;
    currentStatus: 'active' | 'duplicate' | 'consolidated' | 'cleaned';
  }>;

  /**
   * Preview what would happen during a consolidation operation
   * @param primaryId - ID of the primary memory
   * @param duplicateIds - Array of duplicate memory IDs
   * @returns Promise resolving to preview of consolidation results
   */
  previewConsolidation(
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
  }>;

  /**
   * Rollback a previously completed consolidation operation
   * @param primaryMemoryId - ID of the primary memory to rollback
   * @param rollbackToken - Token from the original consolidation for verification
   * @returns Promise resolving to rollback result
   */
  rollbackConsolidation(
    primaryMemoryId: string,
    rollbackToken: string,
  ): Promise<{
    success: boolean;
    restoredMemories: number;
    errors: string[];
  }>;

  /**
   * Get consolidation recommendations for optimizing memory storage
   * @returns Promise resolving to optimization recommendations
   */
  getOptimizationRecommendations(): Promise<{
    recommendations: Array<{
      type: 'cleanup' | 'consolidation' | 'archival';
      priority: 'low' | 'medium' | 'high';
      description: string;
      estimatedBenefit: string;
      actionRequired: string[];
    }>;
    overallHealth: 'good' | 'fair' | 'poor';
    nextMaintenanceDate?: Date;
  }>;
}