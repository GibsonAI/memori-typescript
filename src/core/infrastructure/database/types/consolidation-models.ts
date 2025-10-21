// src/core/database/types/consolidation-models.ts

/**
 * Domain models for memory consolidation operations
 * Provides clean business objects for consolidation functionality
 */

import { MemorySearchResult } from '../../../types/models';

/**
 * Represents a potential duplicate memory candidate found during similarity analysis
 */
export interface DuplicateCandidate {
  /** Unique identifier of the potential duplicate memory */
  id: string;
  /** Content of the potential duplicate memory */
  content: string;
  /** Similarity score compared to the original content (0-1) */
  similarityScore: number;
  /** Confidence level in this being a true duplicate (0-1) */
  confidence: number;
  /** Recommended consolidation action */
  consolidationRecommendation: 'merge' | 'replace' | 'ignore';
}

/**
 * Result of a memory consolidation operation
 */
export interface ConsolidationResult {
  /** Whether the consolidation operation succeeded */
  success: boolean;
  /** Number of memories that were successfully consolidated */
  consolidatedCount: number;
  /** ID of the primary memory that was kept after consolidation */
  primaryMemoryId: string;
  /** IDs of all memories that were consolidated into the primary */
  consolidatedMemoryIds: string[];
  /** Hash for data integrity verification */
  dataIntegrityHash: string;
  /** Timestamp when consolidation was completed */
  consolidationTimestamp: Date;
  /** Token for potential rollback operations */
  rollbackToken?: string;
}

/**
 * Statistics about consolidation activities
 */
export interface ConsolidationStats {
  /** Total number of memories in the system */
  totalMemories: number;
  /** Number of identified duplicate memories */
  duplicateCount: number;
  /** Number of memories that have been consolidated */
  consolidatedMemories: number;
  /** Average consolidation ratio across all operations */
  averageConsolidationRatio: number;
  /** Timestamp of the most recent consolidation activity */
  lastConsolidationActivity?: Date;
  /** Historical trends in consolidation activities */
  consolidationTrends: ConsolidationTrend[];
}

/**
 * Trend data for consolidation activities over time
 */
export interface ConsolidationTrend {
  /** Time period for this trend data point */
  period: string;
  /** Number of consolidations in this period */
  consolidationCount: number;
  /** Average similarity score of consolidated memories */
  averageSimilarityScore: number;
  /** Average number of duplicates per consolidation */
  averageDuplicatesPerConsolidation: number;
}

/**
 * Configuration options for cleanup operations
 */
export interface CleanupOptions {
  /** Remove memories older than this many days */
  olderThanDays: number;
  /** If true, only simulate the cleanup without making changes */
  dryRun: boolean;
  /** Maximum number of memories to process in one batch */
  batchSize?: number;
}

/**
 * Result of a cleanup operation
 */
export interface CleanupResult {
  /** Number of memories successfully cleaned up */
  cleaned: number;
  /** Number of memories skipped during cleanup */
  skipped: number;
  /** Any errors that occurred during cleanup */
  errors: string[];
  /** Whether this was a dry run */
  dryRun: boolean;
}

/**
 * Configuration for duplicate detection algorithms
 */
export interface DuplicateDetectionConfig {
  /** Similarity threshold for considering memories as duplicates (0-1) */
  similarityThreshold: number;
  /** Maximum number of candidates to return */
  maxCandidates?: number;
  /** Enable fuzzy matching for content comparison */
  enableFuzzyMatching?: boolean;
  /** Custom weighting for different parts of memory content */
  contentWeights?: {
    content: number;
    summary: number;
    entities: number;
    keywords: number;
  };
}

/**
 * Extended memory search result with consolidation metadata
 */
export interface ConsolidationMemorySearchResult extends MemorySearchResult {
  /** Whether this memory is marked as a duplicate */
  isDuplicate?: boolean;
  /** ID of the original memory if this is a duplicate */
  duplicateOf?: string;
  /** Whether this memory has been consolidated */
  isConsolidated?: boolean;
  /** When this memory was consolidated */
  consolidatedAt?: Date;
  /** Number of consolidation operations this memory has undergone */
  consolidationCount?: number;
}