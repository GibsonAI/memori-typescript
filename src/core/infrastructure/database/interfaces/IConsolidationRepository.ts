// src/core/database/interfaces/IConsolidationRepository.ts

import { MemorySearchResult } from '../../../types/models';
import {
  ConsolidationResult,
  ConsolidationStats,
  CleanupResult,
  DuplicateDetectionConfig,
  ConsolidationMemorySearchResult,
} from '../types/consolidation-models';

/**
 * Data access abstraction layer for memory consolidation operations
 * Provides repository pattern interface for consolidation data operations
 */
export interface IConsolidationRepository {
  /**
    * Find potential duplicate memory candidates based on content similarity
    * @param content - Content to find duplicates for
    * @param threshold - Similarity threshold (0-1) for considering duplicates
    * @param config - Optional configuration for duplicate detection algorithm
    * @param namespace - Namespace to search within (for test isolation)
    * @returns Promise resolving to array of potential duplicate candidates
    */
   findDuplicateCandidates(
     content: string,
     threshold: number,
     config?: DuplicateDetectionConfig,
     namespace?: string,
   ): Promise<MemorySearchResult[]>;

   /**
    * Mark a memory as a duplicate of another memory
    * @param duplicateId - ID of the memory being marked as duplicate
    * @param originalId - ID of the original memory
    * @param consolidationReason - Reason for marking as duplicate
    * @param namespace - Namespace for the operation (for test isolation)
    * @returns Promise that resolves when the operation is complete
    */
   markMemoryAsDuplicate(
     duplicateId: string,
     originalId: string,
     consolidationReason?: string,
     namespace?: string,
   ): Promise<void>;

   /**
    * Consolidate multiple duplicate memories into a primary memory
    * @param primaryId - ID of the primary memory to keep
    * @param duplicateIds - Array of IDs of duplicate memories to consolidate
    * @param namespace - Namespace for the operation (for test isolation)
    * @returns Promise resolving to consolidation result
    */
   consolidateMemories(
     primaryId: string,
     duplicateIds: string[],
     namespace?: string,
   ): Promise<ConsolidationResult>;

   /**
    * Get consolidation statistics for the current namespace
    * @param namespace - Namespace to get statistics for (for test isolation)
    * @returns Promise resolving to consolidation statistics
    */
   getConsolidationStatistics(namespace?: string): Promise<ConsolidationStats>;

   /**
    * Clean up old consolidated memories based on age criteria
    * @param olderThanDays - Remove memories older than this many days
    * @param dryRun - If true, only simulate the cleanup without making changes
    * @param namespace - Namespace to clean up in (for test isolation)
    * @returns Promise resolving to cleanup operation result
    */
   cleanupConsolidatedMemories(
     olderThanDays: number,
     dryRun: boolean,
     namespace?: string,
   ): Promise<CleanupResult>;

   /**
    * Get detailed information about a specific consolidated memory
    * @param memoryId - ID of the memory to retrieve
    * @param namespace - Namespace to search in (for test isolation)
    * @returns Promise resolving to memory with consolidation metadata
    */
   getConsolidatedMemory(memoryId: string, namespace?: string): Promise<ConsolidationMemorySearchResult | null>;

   /**
    * Get all memories that were consolidated into a primary memory
    * @param primaryMemoryId - ID of the primary memory
    * @param namespace - Namespace to search in (for test isolation)
    * @returns Promise resolving to array of consolidated memory IDs
    */
   getConsolidatedMemories(primaryMemoryId: string, namespace?: string): Promise<string[]>;

   /**
    * Update duplicate tracking information for multiple memories
    * @param updates - Array of duplicate tracking updates to apply
    * @param namespace - Namespace for the operation (for test isolation)
    * @returns Promise resolving to update operation result
    */
   updateDuplicateTracking(updates: Array<{
     memoryId: string;
     isDuplicate?: boolean;
     duplicateOf?: string;
     consolidationReason?: string;
     markedAsDuplicateAt?: Date;
   }>, namespace?: string): Promise<{ updated: number; errors: string[] }>;

   /**
    * Perform pre-consolidation validation to ensure data integrity
    * @param primaryMemoryId - ID of the primary memory
    * @param duplicateIds - Array of duplicate memory IDs
    * @param namespace - Namespace for the operation (for test isolation)
    * @returns Promise resolving to validation result
    */
   performPreConsolidationValidation(
     primaryMemoryId: string,
     duplicateIds: string[],
     namespace?: string,
   ): Promise<{ isValid: boolean; errors: string[] }>;

   /**
    * Backup memory data for potential rollback operations
    * @param memoryIds - Array of memory IDs to backup
    * @param namespace - Namespace to backup from (for test isolation)
    * @returns Promise resolving to map of memory ID to backup data
    */
   backupMemoryData(memoryIds: string[], namespace?: string): Promise<Map<string, any>>;

   /**
    * Rollback a consolidation operation using backup data
    * @param primaryMemoryId - ID of the primary memory to rollback
    * @param duplicateIds - Array of duplicate memory IDs to rollback
    * @param originalData - Backup data for rollback
    * @param namespace - Namespace for the operation (for test isolation)
    * @returns Promise that resolves when rollback is complete
    */
   rollbackConsolidation(
     primaryMemoryId: string,
     duplicateIds: string[],
     originalData: Map<string, any>,
     namespace?: string,
   ): Promise<void>;

   /**
    * Generate data integrity hash for validation
    * @param data - Data object to generate hash for
    * @returns String hash of the data
    */
   generateDataIntegrityHash(data: any): string;
}