import { CategoryHierarchyManager, CategoryNode } from './CategoryHierarchyManager';

/**
 * Configuration for category-based relevance scoring
 */
export interface CategoryRelevanceConfig {
  hierarchyWeight: number;
  exactMatchWeight: number;
  partialMatchWeight: number;
  depthWeight: number;
  inheritanceWeight: number;
  contextWeight: number;
  temporalWeight: number;
  frequencyWeight: number;
  enableCaching: boolean;
  maxCacheSize: number;
}

/**
 * Category relevance scoring factors
 */
export interface CategoryRelevanceFactors {
  hierarchyMatch: boolean;
  exactCategoryMatch: boolean;
  partialCategoryMatch: boolean;
  depthLevel: number;
  inheritanceLevel: number;
  contextSimilarity: number;
  temporalRelevance: number;
  categoryFrequency: number;
}

/**
 * Category relevance scoring result
 */
export interface CategoryRelevanceResult {
  score: number;
  factors: CategoryRelevanceFactors;
  explanation: string[];
  categoryMatches: Array<{
    category: string;
    matchType: 'exact' | 'partial' | 'hierarchical' | 'inherited';
    contribution: number;
  }>;
}

/**
 * Memory context for relevance calculation
 */
export interface MemoryContext {
  categories: string[];
  content: string;
  timestamp: Date;
  importance: number;
  accessCount?: number;
  lastAccessed?: Date;
}

/**
 * Query context for relevance calculation
 */
export interface QueryContext {
  categories: string[];
  text: string;
  timestamp: Date;
  userPreferences?: string[];
  searchHistory?: string[];
}

/**
 * Enhanced relevance scoring system based on category matching with hierarchy support,
 * context awareness, and configurable weighting factors
 */
export class CategoryBasedRelevance {
  private config: CategoryRelevanceConfig;
  private hierarchyManager: CategoryHierarchyManager;
  private relevanceCache: Map<string, CategoryRelevanceResult> = new Map();

  // Default category weights for different match types
  private readonly defaultCategoryWeights = {
    exact: 1.0,
    partial: 0.7,
    hierarchical: 0.8,
    inherited: 0.6,
    contextual: 0.5,
  };

  // Importance levels for temporal relevance
  private readonly importanceLevels = {
    critical: 1.0,
    high: 0.8,
    medium: 0.6,
    low: 0.4,
  };

  constructor(
    hierarchyManager: CategoryHierarchyManager,
    config: Partial<CategoryRelevanceConfig> = {}
  ) {
    this.hierarchyManager = hierarchyManager;
    this.config = {
      hierarchyWeight: 0.2,
      exactMatchWeight: 0.3,
      partialMatchWeight: 0.2,
      depthWeight: 0.1,
      inheritanceWeight: 0.15,
      contextWeight: 0.15,
      temporalWeight: 0.1,
      frequencyWeight: 0.05,
      enableCaching: true,
      maxCacheSize: 1000,
      ...config,
    };
  }

  /**
   * Calculate relevance score between memory and query contexts
   */
  calculateRelevance(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): CategoryRelevanceResult {
    const cacheKey = this.generateCacheKey(memoryContext, queryContext);
    const cached = this.relevanceCache.get(cacheKey);

    if (cached && this.config.enableCaching) {
      return cached;
    }

    const factors = this.calculateRelevanceFactors(memoryContext, queryContext);
    const score = this.computeRelevanceScore(factors);
    const explanation = this.generateExplanation(factors);
    const categoryMatches = this.analyzeCategoryMatches(memoryContext, queryContext);

    const result: CategoryRelevanceResult = {
      score: Math.max(0, Math.min(1, score)),
      factors,
      explanation,
      categoryMatches,
    };

    if (this.config.enableCaching) {
      this.addToCache(cacheKey, result);
    }

    return result;
  }

  /**
   * Calculate relevance for multiple memories against a query
   */
  calculateBatchRelevance(
    memories: MemoryContext[],
    queryContext: QueryContext
  ): CategoryRelevanceResult[] {
    return memories.map(memory => this.calculateRelevance(memory, queryContext));
  }

  /**
   * Calculate category-specific relevance score
   */
  calculateCategoryRelevance(
    memoryCategories: string[],
    queryCategories: string[]
  ): number {
    if (memoryCategories.length === 0 || queryCategories.length === 0) {
      return 0;
    }

    let totalScore = 0;
    let matchCount = 0;

    for (const memoryCat of memoryCategories) {
      for (const queryCat of queryCategories) {
        const matchScore = this.calculateCategoryMatchScore(memoryCat, queryCat);
        if (matchScore > 0) {
          totalScore += matchScore;
          matchCount++;
        }
      }
    }

    return matchCount > 0 ? totalScore / matchCount : 0;
  }

  /**
   * Update relevance configuration
   */
  updateConfig(newConfig: Partial<CategoryRelevanceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.clearCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; enabled: boolean } {
    return {
      size: this.relevanceCache.size,
      enabled: this.config.enableCaching,
    };
  }

  /**
   * Clear the relevance cache
   */
  clearCache(): void {
    this.relevanceCache.clear();
  }

  /**
   * Calculate all relevance factors
   */
  private calculateRelevanceFactors(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): CategoryRelevanceFactors {
    return {
      hierarchyMatch: this.calculateHierarchyMatch(memoryContext, queryContext),
      exactCategoryMatch: this.calculateExactCategoryMatch(memoryContext, queryContext),
      partialCategoryMatch: this.calculatePartialCategoryMatch(memoryContext, queryContext),
      depthLevel: this.calculateDepthLevel(memoryContext, queryContext),
      inheritanceLevel: this.calculateInheritanceLevel(memoryContext, queryContext),
      contextSimilarity: this.calculateContextSimilarity(memoryContext, queryContext),
      temporalRelevance: this.calculateTemporalRelevance(memoryContext, queryContext),
      categoryFrequency: this.calculateCategoryFrequency(memoryContext, queryContext),
    };
  }

  /**
   * Calculate hierarchy-based matching score
   */
  private calculateHierarchyMatch(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): boolean {
    for (const memoryCat of memoryContext.categories) {
      for (const queryCat of queryContext.categories) {
        if (this.hierarchyManager.isDescendantOf(memoryCat, queryCat) ||
            this.hierarchyManager.isDescendantOf(queryCat, memoryCat)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Calculate exact category matching score
   */
  private calculateExactCategoryMatch(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): boolean {
    const memoryCats = new Set(memoryContext.categories.map(c => c.toLowerCase()));
    const queryCats = new Set(queryContext.categories.map(c => c.toLowerCase()));

    for (const memoryCat of memoryCats) {
      if (queryCats.has(memoryCat)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Calculate partial category matching score
   */
  private calculatePartialCategoryMatch(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): boolean {
    for (const memoryCat of memoryContext.categories) {
      for (const queryCat of queryContext.categories) {
        const memoryLower = memoryCat.toLowerCase();
        const queryLower = queryCat.toLowerCase();

        if (memoryLower.includes(queryLower) || queryLower.includes(memoryLower)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Calculate depth level factor
   */
  private calculateDepthLevel(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): number {
    let totalDepth = 0;
    let categoryCount = 0;

    for (const category of [...memoryContext.categories, ...queryContext.categories]) {
      const depth = this.hierarchyManager.getDepth(category);
      if (depth >= 0) {
        totalDepth += depth;
        categoryCount++;
      }
    }

    return categoryCount > 0 ? totalDepth / categoryCount : 0;
  }

  /**
   * Calculate inheritance level factor
   */
  private calculateInheritanceLevel(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): number {
    let maxInheritance = 0;

    for (const memoryCat of memoryContext.categories) {
      for (const queryCat of queryContext.categories) {
        const inheritanceLevel = this.calculateCategoryInheritanceLevel(memoryCat, queryCat);
        maxInheritance = Math.max(maxInheritance, inheritanceLevel);
      }
    }

    return maxInheritance;
  }

  /**
   * Calculate category inheritance level between two categories
   */
  private calculateCategoryInheritanceLevel(category1: string, category2: string): number {
    const ancestors1 = this.hierarchyManager.getAncestors(category1);
    const ancestors2 = this.hierarchyManager.getAncestors(category2);

    // Find the longest common inheritance chain
    let maxCommonLength = 0;
    for (const ancestor1 of ancestors1) {
      for (const ancestor2 of ancestors2) {
        if (ancestor1.id === ancestor2.id) {
          const inheritanceLevel = Math.min(ancestor1.depth, ancestor2.depth);
          maxCommonLength = Math.max(maxCommonLength, inheritanceLevel);
        }
      }
    }

    return maxCommonLength;
  }

  /**
   * Calculate context similarity between memory and query
   */
  private calculateContextSimilarity(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): number {
    const memoryText = memoryContext.content.toLowerCase();
    const queryText = queryContext.text.toLowerCase();

    // Simple text similarity based on word overlap
    const memoryWords = new Set(memoryText.split(/\s+/).filter(word => word.length > 2));
    const queryWords = new Set(queryText.split(/\s+/).filter(word => word.length > 2));

    const intersection = new Set([...memoryWords].filter(word => queryWords.has(word)));
    const union = new Set([...memoryWords, ...queryWords]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Calculate temporal relevance based on memory age and query time
   */
  private calculateTemporalRelevance(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): number {
    const now = queryContext.timestamp;
    const memoryAge = now.getTime() - memoryContext.timestamp.getTime();
    const ageInDays = memoryAge / (1000 * 60 * 60 * 24);

    // Recent memories are more relevant
    const recencyScore = Math.exp(-ageInDays / 30); // Decay over 30 days

    // Boost score based on memory importance
    const importanceScore = typeof memoryContext.importance === 'string'
      ? this.importanceLevels[memoryContext.importance as keyof typeof this.importanceLevels] || 0.6
      : 0.6;

    return (recencyScore + importanceScore) / 2;
  }

  /**
   * Calculate category frequency factor
   */
  private calculateCategoryFrequency(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): number {
    // This would typically be based on historical data
    // For now, return a simple frequency-based score
    const uniqueCategories = new Set([...memoryContext.categories, ...queryContext.categories]);
    return Math.min(uniqueCategories.size / 10, 1.0); // Normalize to 0-1
  }

  /**
   * Compute final relevance score from factors
   */
  private computeRelevanceScore(factors: CategoryRelevanceFactors): number {
    let score = 0;

    // Hierarchy match contribution
    if (factors.hierarchyMatch) {
      score += this.config.hierarchyWeight * 0.8;
    }

    // Exact match contribution
    if (factors.exactCategoryMatch) {
      score += this.config.exactMatchWeight * 1.0;
    }

    // Partial match contribution
    if (factors.partialCategoryMatch) {
      score += this.config.partialMatchWeight * 0.6;
    }

    // Depth level contribution (closer to root = higher score)
    const depthScore = Math.max(0, 1 - (factors.depthLevel * 0.1));
    score += this.config.depthWeight * depthScore;

    // Inheritance level contribution
    const inheritanceScore = Math.min(factors.inheritanceLevel * 0.2, 1.0);
    score += this.config.inheritanceWeight * inheritanceScore;

    // Context similarity contribution
    score += this.config.contextWeight * factors.contextSimilarity;

    // Temporal relevance contribution
    score += this.config.temporalWeight * factors.temporalRelevance;

    // Category frequency contribution
    score += this.config.frequencyWeight * factors.categoryFrequency;

    return score;
  }

  /**
   * Calculate match score between two specific categories
   */
  private calculateCategoryMatchScore(category1: string, category2: string): number {
    const normalized1 = category1.toLowerCase();
    const normalized2 = category2.toLowerCase();

    // Exact match
    if (normalized1 === normalized2) {
      return this.defaultCategoryWeights.exact;
    }

    // Partial match (substring)
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return this.defaultCategoryWeights.partial;
    }

    // Hierarchical match
    if (this.hierarchyManager.isDescendantOf(category1, category2) ||
        this.hierarchyManager.isDescendantOf(category2, category1)) {
      return this.defaultCategoryWeights.hierarchical;
    }

    // Check for common ancestors
    const commonAncestor = this.hierarchyManager.getCommonAncestor([category1, category2]);
    if (commonAncestor) {
      const inheritanceDistance = this.calculateInheritanceDistance(category1, category2, commonAncestor);
      const inheritanceScore = Math.max(0, 1 - (inheritanceDistance * 0.1));
      return this.defaultCategoryWeights.inherited * inheritanceScore;
    }

    return 0;
  }

  /**
   * Calculate inheritance distance between categories
   */
  private calculateInheritanceDistance(
    category1: string,
    category2: string,
    commonAncestor: CategoryNode
  ): number {
    const ancestors1 = this.hierarchyManager.getAncestors(category1);
    const ancestors2 = this.hierarchyManager.getAncestors(category2);

    const ancestor1Index = ancestors1.findIndex(ancestor => ancestor.id === commonAncestor.id);
    const ancestor2Index = ancestors2.findIndex(ancestor => ancestor.id === commonAncestor.id);

    return ancestor1Index + ancestor2Index;
  }

  /**
   * Generate human-readable explanation of relevance factors
   */
  private generateExplanation(factors: CategoryRelevanceFactors): string[] {
    const explanations: string[] = [];

    if (factors.hierarchyMatch) {
      explanations.push('Categories are related in the hierarchy');
    }

    if (factors.exactCategoryMatch) {
      explanations.push('Exact category match found');
    }

    if (factors.partialCategoryMatch) {
      explanations.push('Partial category match found');
    }

    if (factors.depthLevel > 0) {
      explanations.push(`Categories are at depth level ${factors.depthLevel}`);
    }

    if (factors.inheritanceLevel > 0) {
      explanations.push(`Categories share ${factors.inheritanceLevel} levels of inheritance`);
    }

    if (factors.contextSimilarity > 0.5) {
      explanations.push('High context similarity between memory and query');
    }

    if (factors.temporalRelevance > 0.7) {
      explanations.push('Memory is temporally relevant to the query');
    }

    return explanations;
  }

  /**
   * Analyze category matches in detail
   */
  private analyzeCategoryMatches(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): Array<{
    category: string;
    matchType: 'exact' | 'partial' | 'hierarchical' | 'inherited';
    contribution: number;
  }> {
    const matches: Array<{
      category: string;
      matchType: 'exact' | 'partial' | 'hierarchical' | 'inherited';
      contribution: number;
    }> = [];

    for (const memoryCat of memoryContext.categories) {
      for (const queryCat of queryContext.categories) {
        const score = this.calculateCategoryMatchScore(memoryCat, queryCat);
        if (score > 0) {
          let matchType: 'exact' | 'partial' | 'hierarchical' | 'inherited' = 'partial';

          if (memoryCat.toLowerCase() === queryCat.toLowerCase()) {
            matchType = 'exact';
          } else if (this.hierarchyManager.isDescendantOf(memoryCat, queryCat) ||
                     this.hierarchyManager.isDescendantOf(queryCat, memoryCat)) {
            matchType = 'hierarchical';
          } else {
            const commonAncestor = this.hierarchyManager.getCommonAncestor([memoryCat, queryCat]);
            if (commonAncestor) {
              matchType = 'inherited';
            }
          }

          matches.push({
            category: memoryCat,
            matchType,
            contribution: score,
          });
        }
      }
    }

    return matches.sort((a, b) => b.contribution - a.contribution);
  }

  /**
   * Generate cache key for memory and query contexts
   */
  private generateCacheKey(
    memoryContext: MemoryContext,
    queryContext: QueryContext
  ): string {
    const keyData = {
      memoryCategories: memoryContext.categories.sort().join(','),
      queryCategories: queryContext.categories.sort().join(','),
      memoryContent: memoryContext.content.substring(0, 50),
      queryText: queryContext.text.substring(0, 50),
      memoryImportance: memoryContext.importance,
      queryTime: queryContext.timestamp.getTime(),
      memoryTime: memoryContext.timestamp.getTime(),
    };

    return Buffer.from(JSON.stringify(keyData)).toString('base64').substring(0, 64);
  }

  /**
   * Add result to cache with size management
   */
  private addToCache(key: string, result: CategoryRelevanceResult): void {
    if (this.relevanceCache.size >= this.config.maxCacheSize) {
      // Remove oldest entry (simple FIFO)
      const firstKey = this.relevanceCache.keys().next().value;
      if (firstKey) {
        this.relevanceCache.delete(firstKey);
      }
    }

    this.relevanceCache.set(key, result);
  }
}

/**
 * Utility functions for category-based relevance
 */
export class CategoryRelevanceUtils {
  /**
   * Create default relevance configuration
   */
  static createDefaultConfig(): CategoryRelevanceConfig {
    return {
      hierarchyWeight: 0.2,
      exactMatchWeight: 0.3,
      partialMatchWeight: 0.2,
      depthWeight: 0.1,
      inheritanceWeight: 0.15,
      contextWeight: 0.15,
      temporalWeight: 0.1,
      frequencyWeight: 0.05,
      enableCaching: true,
      maxCacheSize: 1000,
    };
  }

  /**
   * Create configuration optimized for precision
   */
  static createPrecisionConfig(): CategoryRelevanceConfig {
    return {
      hierarchyWeight: 0.3,
      exactMatchWeight: 0.4,
      partialMatchWeight: 0.1,
      depthWeight: 0.15,
      inheritanceWeight: 0.2,
      contextWeight: 0.1,
      temporalWeight: 0.05,
      frequencyWeight: 0.05,
      enableCaching: true,
      maxCacheSize: 1000,
    };
  }

  /**
   * Create configuration optimized for recall
   */
  static createRecallConfig(): CategoryRelevanceConfig {
    return {
      hierarchyWeight: 0.15,
      exactMatchWeight: 0.2,
      partialMatchWeight: 0.3,
      depthWeight: 0.05,
      inheritanceWeight: 0.1,
      contextWeight: 0.25,
      temporalWeight: 0.15,
      frequencyWeight: 0.1,
      enableCaching: true,
      maxCacheSize: 1000,
    };
  }

  /**
   * Normalize relevance score across multiple results
   */
  static normalizeScores(results: CategoryRelevanceResult[]): CategoryRelevanceResult[] {
    if (results.length === 0) return results;

    const maxScore = Math.max(...results.map(r => r.score));
    const minScore = Math.min(...results.map(r => r.score));

    if (maxScore === minScore) {
      return results.map(result => ({ ...result, score: 0.5 }));
    }

    return results.map(result => ({
      ...result,
      score: (result.score - minScore) / (maxScore - minScore),
    }));
  }

  /**
   * Combine multiple relevance results
   */
  static combineResults(results: CategoryRelevanceResult[]): CategoryRelevanceResult {
    if (results.length === 0) {
      return {
        score: 0,
        factors: {
          hierarchyMatch: false,
          exactCategoryMatch: false,
          partialCategoryMatch: false,
          depthLevel: 0,
          inheritanceLevel: 0,
          contextSimilarity: 0,
          temporalRelevance: 0,
          categoryFrequency: 0,
        },
        explanation: ['No relevance factors available'],
        categoryMatches: [],
      };
    }

    if (results.length === 1) {
      return results[0];
    }

    // Weighted average of scores
    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    const averageScore = totalScore / results.length;

    // Combine explanations
    const allExplanations = results.flatMap(result => result.explanation);
    const uniqueExplanations = [...new Set(allExplanations)];

    // Combine category matches
    const allMatches = results.flatMap(result => result.categoryMatches);
    const matchMap = new Map<string, typeof allMatches[0]>();

    allMatches.forEach(match => {
      const existing = matchMap.get(match.category);
      if (!existing || existing.contribution < match.contribution) {
        matchMap.set(match.category, match);
      }
    });

    const combinedMatches = Array.from(matchMap.values());

    // Combine factors (use maximum values for boolean factors, average for numeric)
    const combinedFactors: CategoryRelevanceFactors = {
      hierarchyMatch: results.some(r => r.factors.hierarchyMatch),
      exactCategoryMatch: results.some(r => r.factors.exactCategoryMatch),
      partialCategoryMatch: results.some(r => r.factors.partialCategoryMatch),
      depthLevel: results.reduce((sum, r) => sum + r.factors.depthLevel, 0) / results.length,
      inheritanceLevel: results.reduce((sum, r) => sum + r.factors.inheritanceLevel, 0) / results.length,
      contextSimilarity: results.reduce((sum, r) => sum + r.factors.contextSimilarity, 0) / results.length,
      temporalRelevance: results.reduce((sum, r) => sum + r.factors.temporalRelevance, 0) / results.length,
      categoryFrequency: results.reduce((sum, r) => sum + r.factors.categoryFrequency, 0) / results.length,
    };

    return {
      score: averageScore,
      factors: combinedFactors,
      explanation: uniqueExplanations,
      categoryMatches: combinedMatches,
    };
  }
}