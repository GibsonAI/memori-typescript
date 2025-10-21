import { CategoryHierarchyManager } from './CategoryHierarchyManager';
import { logError, logWarn } from '../../../infrastructure/config/Logger';

/**
 * Configuration for category extraction
 */
export interface CategoryExtractionConfig {
  enableMLExtraction: boolean;
  enablePatternExtraction: boolean;
  enableMetadataExtraction: boolean;
  confidenceThreshold: number;
  maxCategoriesPerMemory: number;
  enableCategoryNormalization: boolean;
  customExtractionRules: CategoryExtractionRule[];
  extractionTimeout: number;
}

/**
 * Rule for custom category extraction
 */
export interface CategoryExtractionRule {
  name: string;
  pattern: string | RegExp;
  category: string;
  confidence: number;
  priority: number;
  enabled: boolean;
}

/**
 * Result of category extraction
 */
export interface CategoryExtractionResult {
  categories: ExtractedCategory[];
  primaryCategory: string;
  confidence: number;
  extractionMethod: 'pattern' | 'ml' | 'metadata' | 'rule' | 'hybrid';
  metadata: Record<string, unknown>;
}

/**
 * Extracted category information
 */
export interface ExtractedCategory {
  name: string;
  confidence: number;
  source: 'pattern' | 'ml' | 'metadata' | 'rule';
  normalizedName: string;
  hierarchyPath?: string;
  relevanceScore: number;
}

/**
 * Memory metadata for category extraction
 */
export interface MemoryMetadata {
  content: string;
  summary?: string;
  existingCategories?: string[];
  tags?: string[];
  entities?: string[];
  topics?: string[];
  keywords?: string[];
  timestamp?: Date;
  author?: string;
  source?: string;
}

/**
 * Pattern-based category extraction result
 */
export interface PatternExtractionResult {
  categories: Array<{
    category: string;
    confidence: number;
    matchedPattern: string;
    matchPosition: number;
  }>;
  totalConfidence: number;
}

/**
 * Extractor for category metadata from memory content and context.
 * Supports multiple extraction methods including pattern matching, ML-based extraction,
 * and metadata analysis.
 */
export class CategoryMetadataExtractor {
  private config: CategoryExtractionConfig;
  private hierarchyManager: CategoryHierarchyManager;
  private extractionRules: CategoryExtractionRule[];
  private categoryCache: Map<string, CategoryExtractionResult> = new Map();

  // Predefined category patterns
  private readonly predefinedPatterns: CategoryExtractionRule[] = [
    {
      name: 'programming_languages',
      pattern: /\b(javascript|typescript|python|java|c\+\+|c#|go|rust|php|ruby|swift|kotlin)\b/i,
      category: 'Programming',
      confidence: 0.8,
      priority: 10,
      enabled: true,
    },
    {
      name: 'frameworks',
      pattern: /\b(react|angular|vue|express|django|flask|spring|laravel|fastapi)\b/i,
      category: 'Frameworks',
      confidence: 0.8,
      priority: 9,
      enabled: true,
    },
    {
      name: 'databases',
      pattern: /\b(mongodb|mysql|postgresql|sqlite|redis|elasticsearch|cassandra)\b/i,
      category: 'Databases',
      confidence: 0.8,
      priority: 8,
      enabled: true,
    },
    {
      name: 'cloud_platforms',
      pattern: /\b(aws|azure|gcp|google cloud|amazon web services|microsoft azure)\b/i,
      category: 'Cloud',
      confidence: 0.8,
      priority: 7,
      enabled: true,
    },
    {
      name: 'personal_info',
      pattern: /\b(preference|like|want|need|favorite|personal|experience)\b/i,
      category: 'Personal',
      confidence: 0.6,
      priority: 5,
      enabled: true,
    },
    {
      name: 'work_projects',
      pattern: /\b(project|work|task|deadline|meeting|client|team)\b/i,
      category: 'Work',
      confidence: 0.7,
      priority: 6,
      enabled: true,
    },
    {
      name: 'learning_education',
      pattern: /\b(learn|study|course|tutorial|education|skill|knowledge)\b/i,
      category: 'Education',
      confidence: 0.7,
      priority: 6,
      enabled: true,
    },
    {
      name: 'time_sensitive',
      pattern: /\b(urgent|important|asap|deadline|today|tomorrow|next week)\b/i,
      category: 'Time-Sensitive',
      confidence: 0.7,
      priority: 8,
      enabled: true,
    },
  ];

  constructor(
    hierarchyManager: CategoryHierarchyManager,
    config: Partial<CategoryExtractionConfig> = {},
  ) {
    this.hierarchyManager = hierarchyManager;
    this.config = {
      enableMLExtraction: false,
      enablePatternExtraction: true,
      enableMetadataExtraction: true,
      confidenceThreshold: 0.5,
      maxCategoriesPerMemory: 3,
      enableCategoryNormalization: true,
      customExtractionRules: [],
      extractionTimeout: 5000,
      ...config,
    };

    this.extractionRules = [
      ...this.predefinedPatterns,
      ...this.config.customExtractionRules,
    ];
  }

  /**
   * Extract categories from memory metadata
   */
  async extractCategories(metadata: MemoryMetadata): Promise<CategoryExtractionResult> {
    const cacheKey = this.generateCacheKey(metadata);
    const cached = this.categoryCache.get(cacheKey);

    if (cached && this.config.enableCategoryNormalization) {
      return cached;
    }

    try {
      const extractionPromise = this.performExtraction(metadata);
      const timeoutPromise = new Promise<CategoryExtractionResult>((_, reject) => {
        setTimeout(() => reject(new Error('Category extraction timeout')), this.config.extractionTimeout);
      });

      const result = await Promise.race([extractionPromise, timeoutPromise]);

      if (this.config.enableCategoryNormalization) {
        this.categoryCache.set(cacheKey, result);
      }

      return result;

    } catch (error) {
      logWarn('Category extraction failed', {
        component: 'CategoryMetadataExtractor',
        operation: 'extractCategories',
        error: error instanceof Error ? error.message : String(error)
      });
      return this.createFallbackResult(metadata);
    }
  }

  /**
   * Extract categories from text content
   */
  async extractFromText(content: string, context?: Partial<MemoryMetadata>): Promise<CategoryExtractionResult> {
    const metadata: MemoryMetadata = {
      content,
      summary: context?.summary,
      existingCategories: context?.existingCategories,
      tags: context?.tags,
      entities: context?.entities,
      topics: context?.topics,
      keywords: context?.keywords,
      timestamp: context?.timestamp,
      author: context?.author,
      source: context?.source,
    };

    return this.extractCategories(metadata);
  }

  /**
   * Extract categories from multiple memories in batch
   */
  async extractBatch(metadatas: MemoryMetadata[]): Promise<CategoryExtractionResult[]> {
    const promises = metadatas.map(metadata => this.extractCategories(metadata));
    return Promise.all(promises);
  }

  /**
   * Update extraction configuration
   */
  updateConfig(newConfig: Partial<CategoryExtractionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.clearCache();
  }

  /**
   * Add custom extraction rule
   */
  addExtractionRule(rule: CategoryExtractionRule): void {
    this.extractionRules.push(rule);
    this.extractionRules.sort((a, b) => b.priority - a.priority);
    this.clearCache();
  }

  /**
   * Remove extraction rule by name
   */
  removeExtractionRule(ruleName: string): boolean {
    const index = this.extractionRules.findIndex(rule => rule.name === ruleName);
    if (index >= 0) {
      this.extractionRules.splice(index, 1);
      this.clearCache();
      return true;
    }
    return false;
  }

  /**
   * Get all extraction rules
   */
  getExtractionRules(): CategoryExtractionRule[] {
    return [...this.extractionRules];
  }

  /**
   * Clear the extraction cache
   */
  clearCache(): void {
    this.categoryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; enabled: boolean } {
    return {
      size: this.categoryCache.size,
      enabled: this.config.enableCategoryNormalization,
    };
  }

  /**
   * Perform the actual category extraction
   */
  private async performExtraction(metadata: MemoryMetadata): Promise<CategoryExtractionResult> {
    const extractedCategories: ExtractedCategory[] = [];
    const allCategories = new Map<string, ExtractedCategory>();

    // Extract from existing categories if available
    if (this.config.enableMetadataExtraction && metadata.existingCategories) {
      metadata.existingCategories.forEach(category => {
        const normalized = this.normalizeCategory(category);
        allCategories.set(normalized, {
          name: category,
          confidence: 0.9,
          source: 'metadata',
          normalizedName: normalized,
          relevanceScore: 1.0,
        });
      });
    }

    // Extract from patterns
    if (this.config.enablePatternExtraction) {
      const patternResults = this.extractFromPatterns(metadata);
      patternResults.forEach(result => {
        const normalized = this.normalizeCategory(result.category);
        const existing = allCategories.get(normalized);

        if (!existing || existing.confidence < result.confidence) {
          allCategories.set(normalized, {
            name: result.category,
            confidence: result.confidence,
            source: 'pattern',
            normalizedName: normalized,
            relevanceScore: this.calculateRelevanceScore(result.category, metadata),
          });
        }
      });
    }

    // Extract from ML if enabled (placeholder for future implementation)
    if (this.config.enableMLExtraction) {
      const mlResults = await this.extractFromML(metadata);
      mlResults.forEach(result => {
        const normalized = this.normalizeCategory(result.name);
        const existing = allCategories.get(normalized);

        if (!existing || existing.confidence < result.confidence) {
          allCategories.set(normalized, {
            name: result.name,
            confidence: result.confidence,
            source: 'ml',
            normalizedName: normalized,
            relevanceScore: result.relevanceScore,
          });
        }
      });
    }

    // Convert to array and filter by confidence
    extractedCategories.push(...Array.from(allCategories.values()));
    extractedCategories.sort((a, b) => b.confidence - a.confidence);

    // Apply confidence threshold and limit
    const filteredCategories = extractedCategories
      .filter(cat => cat.confidence >= this.config.confidenceThreshold)
      .slice(0, this.config.maxCategoriesPerMemory);

    // Determine primary category
    const primaryCategory = filteredCategories.length > 0 ? filteredCategories[0].name : 'General';

    // Calculate overall confidence
    const totalConfidence = filteredCategories.reduce((sum, cat) => sum + cat.confidence, 0) / filteredCategories.length;

    return {
      categories: filteredCategories,
      primaryCategory,
      confidence: totalConfidence,
      extractionMethod: this.determineExtractionMethod(filteredCategories),
      metadata: {
        totalCategoriesFound: extractedCategories.length,
        categoriesFiltered: extractedCategories.length - filteredCategories.length,
        extractionTimestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Extract categories using pattern matching
   */
  private extractFromPatterns(metadata: MemoryMetadata): Array<{
    category: string;
    confidence: number;
    matchedPattern: string;
    matchPosition: number;
  }> {
    const results: Array<{
      category: string;
      confidence: number;
      matchedPattern: string;
      matchPosition: number;
    }> = [];

    const textToSearch = [
      metadata.content,
      metadata.summary || '',
      ...(metadata.tags || []),
      ...(metadata.entities || []),
      ...(metadata.topics || []),
      ...(metadata.keywords || []),
    ].join(' ').toLowerCase();

    // Apply each extraction rule
    for (const rule of this.extractionRules.filter(r => r.enabled)) {
      const matches = this.findMatches(textToSearch, rule);
      results.push(...matches);
    }

    // Remove duplicates and sort by confidence
    const uniqueResults = new Map<string, typeof results[0]>();
    results.forEach(result => {
      const existing = uniqueResults.get(result.category);
      if (!existing || existing.confidence < result.confidence) {
        uniqueResults.set(result.category, result);
      }
    });

    return Array.from(uniqueResults.values());
  }

  /**
   * Find matches for a specific rule
   */
  private findMatches(text: string, rule: CategoryExtractionRule): Array<{
    category: string;
    confidence: number;
    matchedPattern: string;
    matchPosition: number;
  }> {
    const results: Array<{
      category: string;
      confidence: number;
      matchedPattern: string;
      matchPosition: number;
    }> = [];

    let match;
    const regex = typeof rule.pattern === 'string'
      ? new RegExp(rule.pattern, 'gi')
      : rule.pattern;

    while ((match = regex.exec(text)) !== null) {
      // Calculate position-based confidence
      const positionConfidence = this.calculatePositionConfidence(match.index, text.length);
      const finalConfidence = Math.min(rule.confidence * positionConfidence, 1.0);

      results.push({
        category: rule.category,
        confidence: finalConfidence,
        matchedPattern: match[0],
        matchPosition: match.index,
      });
    }

    return results;
  }

  /**
   * Calculate confidence based on match position in text
   */
  private calculatePositionConfidence(position: number, textLength: number): number {
    if (textLength === 0) return 0.5;

    const relativePosition = position / textLength;

    // Boost confidence for matches at the beginning or in titles
    if (relativePosition < 0.1) return 1.2;
    if (relativePosition < 0.3) return 1.0;
    if (relativePosition < 0.5) return 0.8;
    return 0.6;
  }

  /**
   * ML-based category extraction (placeholder for future implementation)
   */
  private async extractFromML(_metadata: MemoryMetadata): Promise<ExtractedCategory[]> {
    // Placeholder for ML-based extraction
    // This would integrate with OpenAI, Hugging Face, or other ML services
    logWarn('ML extraction not yet implemented, skipping...', {
      component: 'CategoryMetadataExtractor',
      operation: 'extractFromML'
    });
    return [];
  }

  /**
   * Calculate relevance score for a category
   */
  private calculateRelevanceScore(category: string, metadata: MemoryMetadata): number {
    let score = 0.5; // Base score

    // Boost score based on category frequency in content
    const content = metadata.content.toLowerCase();
    const categoryLower = category.toLowerCase();
    const occurrences = (content.match(new RegExp(categoryLower, 'g')) || []).length;
    score += Math.min(occurrences * 0.1, 0.3);

    // Boost score for categories in summary
    if (metadata.summary) {
      const summaryLower = metadata.summary.toLowerCase();
      if (summaryLower.includes(categoryLower)) {
        score += 0.2;
      }
    }

    // Boost score for categories in tags or entities
    const tagsAndEntities = [...(metadata.tags || []), ...(metadata.entities || [])].join(' ').toLowerCase();
    if (tagsAndEntities.includes(categoryLower)) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Normalize category name
   */
  private normalizeCategory(category: string): string {
    if (!this.config.enableCategoryNormalization) {
      return category;
    }

    return category
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  /**
   * Determine the primary extraction method used
   */
  private determineExtractionMethod(categories: ExtractedCategory[]): CategoryExtractionResult['extractionMethod'] {
    const sources = categories.map(cat => cat.source);
    const hasML = sources.includes('ml');
    const hasPattern = sources.includes('pattern');
    const hasMetadata = sources.includes('metadata');
    const hasRule = sources.includes('rule');

    if (hasML && (hasPattern || hasMetadata)) return 'hybrid';
    if (hasML) return 'ml';
    if (hasPattern) return 'pattern';
    if (hasMetadata) return 'metadata';
    if (hasRule) return 'rule';
    return 'pattern';
  }

  /**
   * Generate cache key for metadata
   */
  private generateCacheKey(metadata: MemoryMetadata): string {
    const keyData = {
      content: metadata.content.substring(0, 100),
      summary: metadata.summary,
      existingCategories: metadata.existingCategories,
      tags: metadata.tags,
    };

    return Buffer.from(JSON.stringify(keyData)).toString('base64').substring(0, 32);
  }

  /**
   * Create fallback result when extraction fails
   */
  private createFallbackResult(metadata: MemoryMetadata): CategoryExtractionResult {
    const fallbackCategory = metadata.existingCategories?.[0] || 'General';

    return {
      categories: [{
        name: fallbackCategory,
        confidence: 0.3,
        source: 'metadata',
        normalizedName: this.normalizeCategory(fallbackCategory),
        relevanceScore: 0.5,
      }],
      primaryCategory: fallbackCategory,
      confidence: 0.3,
      extractionMethod: 'pattern',
      metadata: {
        fallback: true,
        reason: 'Extraction failed or timed out',
      },
    };
  }
}

/**
 * Utility functions for category extraction
 */
export class CategoryExtractionUtils {
  /**
   * Create default extraction configuration
   */
  static createDefaultConfig(): CategoryExtractionConfig {
    return {
      enableMLExtraction: false,
      enablePatternExtraction: true,
      enableMetadataExtraction: true,
      confidenceThreshold: 0.5,
      maxCategoriesPerMemory: 3,
      enableCategoryNormalization: true,
      customExtractionRules: [],
      extractionTimeout: 5000,
    };
  }

  /**
   * Create configuration optimized for performance
   */
  static createPerformanceConfig(): CategoryExtractionConfig {
    return {
      enableMLExtraction: false,
      enablePatternExtraction: true,
      enableMetadataExtraction: true,
      confidenceThreshold: 0.7,
      maxCategoriesPerMemory: 2,
      enableCategoryNormalization: true,
      customExtractionRules: [],
      extractionTimeout: 2000,
    };
  }

  /**
   * Create configuration optimized for accuracy
   */
  static createAccuracyConfig(): CategoryExtractionConfig {
    return {
      enableMLExtraction: true,
      enablePatternExtraction: true,
      enableMetadataExtraction: true,
      confidenceThreshold: 0.3,
      maxCategoriesPerMemory: 5,
      enableCategoryNormalization: true,
      customExtractionRules: [],
      extractionTimeout: 10000,
    };
  }

  /**
   * Merge multiple extraction results
   */
  static mergeResults(results: CategoryExtractionResult[]): CategoryExtractionResult {
    const allCategories = new Map<string, ExtractedCategory>();
    let totalConfidence = 0;
    let methodCount = 0;

    for (const result of results) {
      totalConfidence += result.confidence;
      methodCount++;

      for (const category of result.categories) {
        const existing = allCategories.get(category.normalizedName);
        if (!existing || existing.confidence < category.confidence) {
          allCategories.set(category.normalizedName, category);
        }
      }
    }

    const mergedCategories = Array.from(allCategories.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3); // Limit to top 3

    const averageConfidence = methodCount > 0 ? totalConfidence / methodCount : 0;

    return {
      categories: mergedCategories,
      primaryCategory: mergedCategories.length > 0 ? mergedCategories[0].name : 'General',
      confidence: averageConfidence,
      extractionMethod: 'hybrid',
      metadata: {
        mergedFrom: results.length,
        totalCategories: allCategories.size,
      },
    };
  }

  /**
   * Validate extraction result
   */
  static validateResult(result: CategoryExtractionResult): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!result.categories || result.categories.length === 0) {
      errors.push('No categories extracted');
    }

    if (result.confidence < 0 || result.confidence > 1) {
      errors.push('Confidence must be between 0 and 1');
    }

    if (!result.primaryCategory) {
      errors.push('Primary category is required');
    }

    for (const category of result.categories) {
      if (category.confidence < 0 || category.confidence > 1) {
        errors.push(`Category ${category.name} has invalid confidence`);
      }

      if (!category.name || category.name.trim() === '') {
        errors.push('Category name cannot be empty');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}