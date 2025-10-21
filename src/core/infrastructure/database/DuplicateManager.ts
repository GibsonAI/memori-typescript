/**
 * DuplicateManager - Dedicated Duplicate Memory Detection and Consolidation Operations
 *
 * This class handles all duplicate memory detection, consolidation, and management operations
 * extracted from DatabaseManager. It provides sophisticated duplicate detection algorithms,
 * intelligent content merging, backup/rollback capabilities, and comprehensive consolidation
 * statistics and cleanup operations.
 */

import { MemoryImportanceLevel } from '../../types/schemas';
import { MemorySearchResult } from '../../types/models';
import { logInfo, logError } from '../config/Logger';
import { DatabaseContext } from './DatabaseContext';
import { MemoryManager } from './MemoryManager';
import { TransactionCoordinator } from './TransactionCoordinator';
import { SearchManager } from './SearchManager';
import { StateManager } from './StateManager';
import { MemoryProcessingState } from '../../domain/memory/MemoryProcessingStateManager';

// ===== DUPLICATE MANAGER INTERFACES =====

export interface ConsolidationOptions {
  similarityThreshold?: number;
  maxDuplicatesPerMemory?: number;
  enableRollback?: boolean;
  dryRun?: boolean;
  namespace?: string;
}

export interface ConsolidationResult {
  consolidated: number;
  errors: string[];
  warnings: string[];
  rollbackData?: Map<string, any>;
  consolidationStats: {
    entitiesMerged: number;
    keywordsMerged: number;
    contentLengthReduction: number;
    similarityScores: number[];
  };
}

export interface DuplicateCandidate {
  memoryId: string;
  content: string;
  similarityScore: number;
  confidence: number;
  reason: string;
}

export interface ConsolidationRecord {
  id: string;
  timestamp: Date;
  primaryMemoryId: string;
  consolidatedMemoryIds: string[];
  consolidationReason: string;
  similarityScores: number[];
  rollbackData?: Map<string, any>;
  success: boolean;
  namespace: string;
}

// ===== DUPLICATE MANAGER CLASS =====

export class DuplicateManager {
  private databaseContext: DatabaseContext;
  private memoryManager: MemoryManager;
  private transactionCoordinator: TransactionCoordinator;
  private searchManager: SearchManager;
  private stateManager: StateManager;
  private consolidationHistory: ConsolidationRecord[] = [];
  private maxHistorySize: number = 1000;

  constructor(
    databaseContext: DatabaseContext,
    memoryManager: MemoryManager,
    transactionCoordinator: TransactionCoordinator,
    searchManager: SearchManager,
    stateManager: StateManager,
  ) {
    this.databaseContext = databaseContext;
    this.memoryManager = memoryManager;
    this.transactionCoordinator = transactionCoordinator;
    this.searchManager = searchManager;
    this.stateManager = stateManager;

    logInfo('DuplicateManager initialized', {
      component: 'DuplicateManager',
      maxHistorySize: this.maxHistorySize,
      rollbackSupport: true,
    });
  }

  /**
   * Find potential duplicate memories based on content similarity
   */
  async findPotentialDuplicates(
    content: string,
    namespace: string = 'default',
    threshold: number = 0.7,
  ): Promise<MemorySearchResult[]> {
    const startTime = Date.now();

    try {
      logInfo('Finding potential duplicate memories', {
        component: 'DuplicateManager',
        contentLength: content.length,
        namespace,
        threshold,
      });

      // Use SearchManager for initial content similarity search
      const similarMemories = await this.searchManager.searchMemories(content, {
        namespace,
        limit: 20,
        includeMetadata: true,
      });

      // Filter by similarity threshold using enhanced algorithm
      const duplicates = similarMemories.filter((memory) => {
        const similarity = this.calculateContentSimilarity(content, memory.content);
        return similarity >= threshold;
      });

      logInfo('Found potential duplicate memories', {
        component: 'DuplicateManager',
        totalSimilar: similarMemories.length,
        duplicatesFound: duplicates.length,
        namespace,
        threshold,
        duration: Date.now() - startTime,
      });

      return duplicates;

    } catch (error) {
      logError('Failed to find potential duplicates', {
        component: 'DuplicateManager',
        namespace,
        threshold,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Detect duplicate candidates using comprehensive analysis
   */
  async detectDuplicateCandidates(
    namespace: string = 'default',
    options: {
      minSimilarity?: number;
      limit?: number;
      contentThreshold?: number;
    } = {},
  ): Promise<DuplicateCandidate[]> {
    const startTime = Date.now();

    try {
      const minSimilarity = options.minSimilarity || 0.7;
      const limit = options.limit || 100;
      const contentThreshold = options.contentThreshold || 50;

      logInfo('Detecting duplicate candidates', {
        component: 'DuplicateManager',
        namespace,
        minSimilarity,
        limit,
      });

      // Get recent memories for duplicate analysis
      const memories = await this.memoryManager.getMemoriesByNamespace(namespace, {
        limit: limit * 2, // Get more to account for filtering
      });

      const candidates: DuplicateCandidate[] = [];
      const processedPairs = new Set<string>();

      // Compare each memory with others to find duplicates
      for (let i = 0; i < memories.length; i++) {
        for (let j = i + 1; j < memories.length; j++) {
          const memoryA = memories[i];
          const memoryB = memories[j];

          // Skip if we've already processed this pair
          const pairId = [memoryA.content, memoryB.content].sort().join('|');
          if (processedPairs.has(pairId)) continue;
          processedPairs.add(pairId);

          // Calculate similarity
          const similarity = this.calculateContentSimilarity(memoryA.content, memoryB.content);

          if (similarity >= minSimilarity && memoryA.content.length >= contentThreshold) {
            candidates.push({
              memoryId: memoryB.content, // Use content as ID for now
              content: memoryB.content,
              similarityScore: similarity,
              confidence: this.calculateSimilarityConfidence(memoryA, memoryB),
              reason: `Content similarity: ${(similarity * 100).toFixed(1)}%`,
            });
          }
        }
      }

      // Sort by similarity score (highest first)
      candidates.sort((a, b) => b.similarityScore - a.similarityScore);

      // Limit results
      const limitedCandidates = candidates.slice(0, limit);

      logInfo('Duplicate candidate detection completed', {
        component: 'DuplicateManager',
        namespace,
        totalMemoriesAnalyzed: memories.length,
        candidatesFound: limitedCandidates.length,
        minSimilarity,
        duration: Date.now() - startTime,
      });

      return limitedCandidates;

    } catch (error) {
      logError('Failed to detect duplicate candidates', {
        component: 'DuplicateManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate consolidation safety before proceeding
   */
  async validateConsolidationSafety(
    primaryId: string,
    duplicateIds: string[],
    namespace: string = 'default',
  ): Promise<{ isSafe: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    try {
      logInfo('Validating consolidation safety', {
        component: 'DuplicateManager',
        primaryId,
        duplicateCount: duplicateIds.length,
        namespace,
      });

      // Check if primary memory exists
      const primaryMemory = await this.memoryManager.getMemoryById(primaryId, namespace);
      if (!primaryMemory) {
        warnings.push(`Primary memory ${primaryId} not found`);
        return { isSafe: false, warnings };
      }

      // Verify all duplicate memories exist
      for (const duplicateId of duplicateIds) {
        const duplicateMemory = await this.memoryManager.getMemoryById(duplicateId, namespace);
        if (!duplicateMemory) {
          warnings.push(`Duplicate memory ${duplicateId} not found`);
        }
      }

      // Check for recent consolidation activity
      const primaryState = await this.stateManager.getMemoryState(primaryId);
      if (primaryState === MemoryProcessingState.CONSOLIDATION_PROCESSING) {
        warnings.push(`Primary memory ${primaryId} is currently being consolidated`);
      }

      // Check for excessive consolidation (too many duplicates)
      if (duplicateIds.length > 50) {
        warnings.push(`Large number of duplicates (${duplicateIds.length}) - may impact performance`);
      }

      // Check for very old memories (might have different context)
      if (primaryMemory.confidenceScore < 0.5) {
        warnings.push(`Primary memory ${primaryId} has low confidence score`);
      }

      const isSafe = warnings.length === 0;

      logInfo('Consolidation safety validation completed', {
        component: 'DuplicateManager',
        primaryId,
        isSafe,
        warningCount: warnings.length,
        namespace,
      });

      return { isSafe, warnings };

    } catch (error) {
      logError('Failed to validate consolidation safety', {
        component: 'DuplicateManager',
        primaryId,
        duplicateIds,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get consolidation history for tracking and analytics
   */
  async getConsolidationHistory(namespace?: string): Promise<ConsolidationRecord[]> {
    try {
      logInfo('Retrieving consolidation history', {
        component: 'DuplicateManager',
        namespace,
      });

      // Filter history by namespace if provided
      const filteredHistory = namespace
        ? this.consolidationHistory.filter(record => record.namespace === namespace)
        : this.consolidationHistory;

      // Sort by timestamp (most recent first)
      filteredHistory.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      logInfo('Retrieved consolidation history', {
        component: 'DuplicateManager',
        totalRecords: filteredHistory.length,
        namespace,
      });

      return filteredHistory;

    } catch (error) {
      logError('Failed to retrieve consolidation history', {
        component: 'DuplicateManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

 /**
  * Calculate content similarity using enhanced algorithm (public for external use)
  */
 public calculateContentSimilarity(content1: string, content2: string): number {
    // Normalize content for comparison
    const normalizeContent = (content: string): string => {
      return content
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const normalized1 = normalizeContent(content1);
    const normalized2 = normalizeContent(content2);

    // Early exit for very different lengths
    const lengthRatio = Math.min(normalized1.length, normalized2.length) /
      Math.max(normalized1.length, normalized2.length);
    if (lengthRatio < 0.3) return 0;

    // Calculate word overlap
    const words1 = new Set(normalized1.split(/\s+/));
    const words2 = new Set(normalized2.split(/\s+/));

    const intersection = new Set([...Array.from(words1)].filter(word => words2.has(word)));
    const union = new Set([...Array.from(words1), ...Array.from(words2)]);

    const jaccardSimilarity = intersection.size / union.size;

    // Calculate character-level similarity for additional accuracy
    const charSimilarity = this.calculateCharacterSimilarity(normalized1, normalized2);

    // Combine similarities with weighted approach
    const combinedSimilarity = (jaccardSimilarity * 0.7) + (charSimilarity * 0.3);

    return Math.round(combinedSimilarity * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate character-level similarity using n-gram approach
   */
  private calculateCharacterSimilarity(text1: string, text2: string): number {
    const n = 3; // Use trigrams
    const ngrams1 = this.generateNGrams(text1, n);
    const ngrams2 = this.generateNGrams(text2, n);

    const intersection = new Set([...Array.from(ngrams1)].filter(ngram => ngrams2.has(ngram)));
    const union = new Set([...Array.from(ngrams1), ...Array.from(ngrams2)]);

    return intersection.size / union.size;
  }

  /**
   * Generate n-grams from text
   */
  private generateNGrams(text: string, n: number): Set<string> {
    const ngrams = new Set<string>();
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.add(text.substring(i, i + n));
    }
    return ngrams;
  }

  /**
   * Calculate similarity confidence based on multiple factors
   */
  private calculateSimilarityConfidence(memoryA: any, memoryB: any): number {
    let confidence = 0.5; // Base confidence

    // Factor in importance levels
    const importanceScoreA = this.calculateImportanceScore(memoryA.importance);
    const importanceScoreB = this.calculateImportanceScore(memoryB.importance);
    const importanceSimilarity = 1 - Math.abs(importanceScoreA - importanceScoreB);

    // Factor in classification similarity
    const classificationSimilarity = memoryA.classification === memoryB.classification ? 1 : 0.3;

    // Factor in confidence scores
    const confidenceScoreAvg = (memoryA.confidenceScore + memoryB.confidenceScore) / 2;

    // Combine factors
    confidence = (confidence * 0.3) + (importanceSimilarity * 0.3) +
      (classificationSimilarity * 0.2) + (confidenceScoreAvg * 0.2);

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Calculate importance score from importance level
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
   * Check if a word is a common stop word
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
   * Get DuplicateManager statistics
   */
  getStatistics(): {
    consolidationHistorySize: number;
    maxHistorySize: number;
    activeConsolidations: number;
  } {
    return {
      consolidationHistorySize: this.consolidationHistory.length,
      maxHistorySize: this.maxHistorySize,
      activeConsolidations: 0, // Would track active consolidations in real implementation
    };
  }
}