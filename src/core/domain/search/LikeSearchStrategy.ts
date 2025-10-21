import { DatabaseManager } from '../../infrastructure/database/DatabaseManager';
import { logError, logInfo, logWarn } from '../../infrastructure/config/Logger';
import { sanitizeString, SANITIZATION_LIMITS } from '../../infrastructure/config/SanitizationUtils';
import { BaseSearchStrategy } from './strategies/BaseSearchStrategy';
import {
  SearchCapability,
  SearchDatabaseError,
  SearchErrorCategory,
  SearchStrategyConfig,
  SearchStrategyMetadata,
} from './SearchStrategy';
import { DatabaseQueryResult, SearchQuery, SearchResult, SearchStrategy } from './types';

type WildcardSensitivity = 'low' | 'medium' | 'high';

interface LikeStrategyOptions {
  wildcardSensitivity: WildcardSensitivity;
  maxWildcardTerms: number;
  enablePhraseSearch: boolean;
  caseSensitive: boolean;
  relevanceBoost: {
    exactMatch: number;
    prefixMatch: number;
    suffixMatch: number;
    partialMatch: number;
  };
}

const DEFAULT_OPTIONS: LikeStrategyOptions = {
  wildcardSensitivity: 'medium',
  maxWildcardTerms: 10,
  enablePhraseSearch: true,
  caseSensitive: false,
  relevanceBoost: {
    exactMatch: 1.5,
    prefixMatch: 1.2,
    suffixMatch: 1.1,
    partialMatch: 1.0,
  },
};

/**
 * LIKE-based search strategy that provides resilient fallback behaviour when FTS is unavailable.
 */
export class LikeSearchStrategy extends BaseSearchStrategy {
  readonly name = SearchStrategy.LIKE;
  readonly priority = 5;
  readonly supportedMemoryTypes = ['short_term', 'long_term'] as const;
  readonly description = 'LIKE-based search for partial matching and fallback';
  readonly capabilities = [
    SearchCapability.KEYWORD_SEARCH,
    SearchCapability.FILTERING,
    SearchCapability.RELEVANCE_SCORING,
  ] as const;

  private readonly options: LikeStrategyOptions;

  constructor(config: SearchStrategyConfig, databaseManager: DatabaseManager) {
    super(config, databaseManager);
    this.options = this.mergeOptions(config.strategySpecific);
  }

  canHandle(query: SearchQuery): boolean {
    return typeof query.text === 'string' && query.text.trim().length > 0;
  }

  protected getCapabilities(): readonly SearchCapability[] {
    return this.capabilities;
  }

  protected async executeSearch(query: SearchQuery): Promise<SearchResult[]> {
    const startTime = Date.now();

    try {
      const sanitizedText = this.prepareSearchText(query.text);
      const likeQuery = this.buildLikeQuery(sanitizedText);
      const sql = this.buildLikeSQL(query, likeQuery);
      const rows = await this.executeLikeQuery(sql);
      const processedResults = this.processLikeResults(rows, likeQuery, query);

      const duration = Date.now() - startTime;
      logInfo('LIKE search completed', {
        component: 'LikeSearchStrategy',
        operation: 'search',
        strategy: this.name,
        queryLength: sanitizedText.length,
        resultCount: processedResults.length,
        executionTime: duration,
        hasFilters: Boolean(query.filters),
        hasFilterExpression: Boolean(query.filterExpression),
      });

      return processedResults;
    } catch (error) {
      const duration = Date.now() - startTime;

      logError('LIKE search failed', {
        component: 'LikeSearchStrategy',
        operation: 'search',
        strategy: this.name,
        query: query.text,
        executionTime: duration,
        limit: query.limit,
        offset: query.offset,
        hasFilters: Boolean(query.filters),
        hasFilterExpression: Boolean(query.filterExpression),
        error: error instanceof Error ? error.message : String(error),
      });

      const category = this.categorizeLikeError(error);

      throw this.handleSearchError(
        error,
        'like_search',
        {
          query: query.text,
          startTime,
          duration,
          limit: query.limit ?? this.config.maxResults,
          offset: query.offset ?? 0,
          hasFilters: Boolean(query.filters),
          hasFilterExpression: Boolean(query.filterExpression),
        },
        category,
      );
    }
  }

  protected getConfigurationSchema(): Record<string, unknown> {
    const baseSchema = super.getConfigurationSchema();

    return {
      ...baseSchema,
      properties: {
        ...(baseSchema.properties as Record<string, unknown>),
        strategySpecific: {
          type: 'object',
          properties: {
            wildcardSensitivity: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              default: DEFAULT_OPTIONS.wildcardSensitivity,
            },
            maxWildcardTerms: {
              type: 'number',
              minimum: 1,
              maximum: 50,
              default: DEFAULT_OPTIONS.maxWildcardTerms,
            },
            enablePhraseSearch: { type: 'boolean', default: DEFAULT_OPTIONS.enablePhraseSearch },
            caseSensitive: { type: 'boolean', default: DEFAULT_OPTIONS.caseSensitive },
            relevanceBoost: {
              type: 'object',
              properties: {
                exactMatch: { type: 'number', minimum: 0.1, maximum: 5, default: DEFAULT_OPTIONS.relevanceBoost.exactMatch },
                prefixMatch: { type: 'number', minimum: 0.1, maximum: 5, default: DEFAULT_OPTIONS.relevanceBoost.prefixMatch },
                suffixMatch: { type: 'number', minimum: 0.1, maximum: 5, default: DEFAULT_OPTIONS.relevanceBoost.suffixMatch },
                partialMatch: { type: 'number', minimum: 0.1, maximum: 5, default: DEFAULT_OPTIONS.relevanceBoost.partialMatch },
              },
            },
          },
        },
      },
    };
  }

  protected getPerformanceMetrics(): SearchStrategyMetadata['performanceMetrics'] {
    return {
      averageResponseTime: 100,
      throughput: 500,
      memoryUsage: 5,
    };
  }

  protected validateStrategyConfiguration(): boolean {
    const validSensitivities: WildcardSensitivity[] = ['low', 'medium', 'high'];

    if (!validSensitivities.includes(this.options.wildcardSensitivity)) {
      return false;
    }

    if (this.options.maxWildcardTerms < 1 || this.options.maxWildcardTerms > 50) {
      return false;
    }

    return true;
  }

  private mergeOptions(strategySpecific?: Record<string, unknown>): LikeStrategyOptions {
    if (!strategySpecific) {
      return DEFAULT_OPTIONS;
    }

    const merged: LikeStrategyOptions = { ...DEFAULT_OPTIONS };

    if (typeof strategySpecific.wildcardSensitivity === 'string') {
      const sensitivity = strategySpecific.wildcardSensitivity.toLowerCase();
      if (sensitivity === 'low' || sensitivity === 'medium' || sensitivity === 'high') {
        merged.wildcardSensitivity = sensitivity;
      }
    }

    if (typeof strategySpecific.maxWildcardTerms === 'number' && Number.isFinite(strategySpecific.maxWildcardTerms)) {
      merged.maxWildcardTerms = Math.min(Math.max(Math.floor(strategySpecific.maxWildcardTerms), 1), 50);
    }

    if (typeof strategySpecific.enablePhraseSearch === 'boolean') {
      merged.enablePhraseSearch = strategySpecific.enablePhraseSearch;
    }

    if (typeof strategySpecific.caseSensitive === 'boolean') {
      merged.caseSensitive = strategySpecific.caseSensitive;
    }

    if (typeof strategySpecific.relevanceBoost === 'object' && strategySpecific.relevanceBoost !== null) {
      const boost = strategySpecific.relevanceBoost as Record<string, unknown>;
      merged.relevanceBoost = {
        exactMatch: this.normalizeBoostValue(boost.exactMatch, DEFAULT_OPTIONS.relevanceBoost.exactMatch),
        prefixMatch: this.normalizeBoostValue(boost.prefixMatch, DEFAULT_OPTIONS.relevanceBoost.prefixMatch),
        suffixMatch: this.normalizeBoostValue(boost.suffixMatch, DEFAULT_OPTIONS.relevanceBoost.suffixMatch),
        partialMatch: this.normalizeBoostValue(boost.partialMatch, DEFAULT_OPTIONS.relevanceBoost.partialMatch),
      };
    }

    return merged;
  }

  private normalizeBoostValue(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(Math.max(value, 0.1), 5);
  }

  private prepareSearchText(text: string): string {
    try {
      const sanitized = sanitizeString(text, {
        fieldName: 'searchQuery',
        maxLength: SANITIZATION_LIMITS.SEARCH_QUERY_MAX_LENGTH,
        allowNewlines: false,
      }).trim();

      if (!sanitized) {
        throw this.handleValidationError('Search text cannot be empty', 'searchQuery', text);
      }

      return sanitized;
    } catch (error) {
      if (error instanceof Error) {
        throw this.handleValidationError(error.message, 'searchQuery', text);
      }
      throw error;
    }
  }

  private buildLikeQuery(searchText: string): string {
    let query = searchText;

    if (this.options.enablePhraseSearch) {
      query = this.handleQuotedPhrases(query);
    }

    return this.options.caseSensitive ? query : query.toLowerCase();
  }

  private handleQuotedPhrases(query: string): string {
    return query.replace(/"([^"]+)"/g, (_match, phrase: string) => phrase.replace(/\s+/g, '%'));
  }

  private buildLikeSQL(query: SearchQuery, likeQuery: string): string {
    const limit = Math.min(query.limit ?? this.config.maxResults, this.config.maxResults);
    const offset = Math.max(0, query.offset ?? 0);
    const patterns = this.buildSearchPatterns(likeQuery);
    const patternConditions = this.buildPatternConditions(patterns);
    const whereClause = this.buildWhereClause(query);
    const orderByClause = this.buildOrderByClause(query);

    return `
      SELECT
        id as memory_id,
        searchableContent as searchable_content,
        summary,
        processedData as metadata,
        retentionType as memory_type,
        categoryPrimary as category_primary,
        importanceScore as importance_score,
        createdAt as created_at,
        '${this.name}' as search_strategy
      FROM (
        SELECT
          id,
          searchableContent,
          summary,
          processedData,
          retentionType,
          categoryPrimary,
          importanceScore,
          createdAt
        FROM short_term_memory
        WHERE ${patternConditions}
          ${whereClause}

        UNION ALL

        SELECT
          id,
          searchableContent,
          summary,
          processedData,
          retentionType,
          categoryPrimary,
          importanceScore,
          createdAt
        FROM long_term_memory
        WHERE ${patternConditions}
          ${whereClause}
      ) AS combined_memories
      ${orderByClause}
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  private buildSearchPatterns(likeQuery: string): string[] {
    const patterns: string[] = [];
    const trimmed = likeQuery.trim();

    if (!trimmed) {
      return patterns;
    }

    patterns.push(trimmed);

    const terms = trimmed.split(/\s+/);
    for (const term of terms) {
      if (term.length > 2 && patterns.length < this.options.maxWildcardTerms) {
        patterns.push(term);
      }
    }

    return patterns;
  }

  private buildPatternConditions(patterns: string[]): string {
    if (patterns.length === 0) {
      return '1=1';
    }

    const conditions: string[] = [];

    for (const pattern of patterns) {
      const escaped = this.escapeSqlString(pattern);
      conditions.push(`searchableContent LIKE '%${escaped}%' ESCAPE '\\'`);
      conditions.push(`summary LIKE '%${escaped}%' ESCAPE '\\'`);
    }

    return `(${conditions.join(' OR ')})`;
  }

  private buildWhereClause(query: SearchQuery): string {
    const conditions: string[] = [];

    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        const condition = this.buildFilterCondition(key, value);
        if (condition) {
          conditions.push(condition);
        }
      }
    }

    return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
  }

  private buildFilterCondition(key: string, value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
      return null;
    }

    const jsonPath = key.startsWith('$.') ? key : `$.${key}`;
    const sanitizedValue = this.escapeSqlString(String(value));

    return `json_extract(metadata, '${jsonPath}') = '${sanitizedValue}'`;
  }

  private buildOrderByClause(query: SearchQuery): string {
    const orderParts = ['importance_score DESC', 'created_at DESC'];
    const allowedSortFields = new Set(['importance_score', 'created_at', 'search_score']);

    if (query.sortBy && allowedSortFields.has(query.sortBy.field)) {
      const direction = query.sortBy.direction === 'asc' ? 'ASC' : 'DESC';
      orderParts.unshift(`${query.sortBy.field} ${direction}`);
    }

    return `ORDER BY ${orderParts.join(', ')}`;
  }

  private async executeLikeQuery(sql: string): Promise<DatabaseQueryResult[]> {
    try {
      const prisma = this.databaseManager.getPrismaClient();
      return await prisma.$queryRawUnsafe<DatabaseQueryResult[]>(sql);
    } catch (error) {
      throw this.handleDatabaseError(
        error,
        'execute_like_query',
        sql.substring(0, 200),
      );
    }
  }

  private processLikeResults(
    results: DatabaseQueryResult[],
    likeQuery: string,
    query: SearchQuery,
  ): SearchResult[] {
    const processed: SearchResult[] = [];

    for (const row of results) {
      try {
        const baseMetadata = this.parseMetadata(row.metadata);
        const rawScore = this.calculateRelevanceScore(row, likeQuery);
        const score = Math.max(0, Math.min(1, rawScore));

        const metadata = query.includeMetadata
          ? {
            summary: row.summary ?? '',
            category: row.category_primary,
            importanceScore: row.importance_score ?? 0.5,
            memoryType: row.memory_type,
            createdAt: new Date(row.created_at),
            ...baseMetadata,
          }
          : {};

        processed.push({
          id: row.memory_id,
          content: row.searchable_content ?? '',
          metadata,
          score,
          strategy: this.name,
          timestamp: new Date(row.created_at),
        });
      } catch (error) {
        logWarn('Failed to process LIKE result row', {
          component: 'LikeSearchStrategy',
          operation: 'process_results',
          strategy: this.name,
          rowId: row.memory_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return processed;
  }

  private parseMetadata(metadataJson: string | null | undefined): Record<string, unknown> {
    if (!metadataJson) {
      return {};
    }

    try {
      const parsed = JSON.parse(metadataJson);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (error) {
      logWarn('Failed to parse LIKE strategy metadata', {
        component: 'LikeSearchStrategy',
        operation: 'parse_metadata',
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private calculateRelevanceScore(row: DatabaseQueryResult, searchQuery: string): number {
    let score = 0.3;
    const content = (row.searchable_content ?? '').toLowerCase();
    const summary = (row.summary ?? '').toLowerCase();
    const terms = searchQuery.toLowerCase().split(/\s+/);

    for (const term of terms) {
      if (term.length < 2) {
        continue;
      }

      if (content.includes(term)) {
        score += this.options.relevanceBoost.exactMatch * 0.1;
      }

      if (content.startsWith(term)) {
        score += this.options.relevanceBoost.prefixMatch * 0.1;
      }

      if (content.endsWith(term)) {
        score += this.options.relevanceBoost.suffixMatch * 0.05;
      }

      if (summary.includes(term)) {
        score += this.options.relevanceBoost.exactMatch * 0.15;
      }
    }

    const importance = row.importance_score ?? 0.5;
    score *= (0.5 + importance);

    if (row.memory_type === 'short_term') {
      score *= 1.1;
    }

    return score;
  }

  private escapeSqlString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, '\'\'');
  }

  private categorizeLikeError(error: unknown): SearchErrorCategory {
    if (error instanceof SearchDatabaseError) {
      return SearchErrorCategory.DATABASE;
    }

    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

    if (message.includes('syntax error') || message.includes('malformed')) {
      return SearchErrorCategory.PARSE;
    }

    if (message.includes('database locked') || message.includes('busy')) {
      return SearchErrorCategory.DATABASE;
    }

    if (message.includes('out of memory') || message.includes('too many terms')) {
      return SearchErrorCategory.EXECUTION;
    }

    if (message.includes('empty query') || message.includes('no search text')) {
      return SearchErrorCategory.VALIDATION;
    }

    return SearchErrorCategory.EXECUTION;
  }
}
