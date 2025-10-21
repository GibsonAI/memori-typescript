import { BaseSearchStrategy } from '../strategies/BaseSearchStrategy';
import {
  SearchCapability,
  SearchErrorCategory,
  SearchStrategyConfig,
  SearchStrategyMetadata,
} from '../SearchStrategy';
import {
  SearchStrategy,
  SearchQuery,
  SearchResult,
  DatabaseQueryResult,
} from '../types';
import { DatabaseManager } from '../../../infrastructure/database/DatabaseManager';
import { logWarn } from '../../../infrastructure/config/Logger';
import {
  sanitizeString,
  SANITIZATION_LIMITS,
} from '../../../infrastructure/config/SanitizationUtils';
import {
  TemporalService,
  TimeRange,
  TimeRangeQuery,
  TemporalAggregationPeriod,
} from '../temporal/TemporalService';
import { DateTimeNormalizer } from './temporal/DateTimeNormalizer';
import {
  TemporalPatternMatcher,
  PatternMatchResult,
} from './temporal/TemporalPatternMatcher';

interface TemporalFiltersInput {
  timeRanges?: TimeRange[];
  relativeExpressions?: string[];
  absoluteDates?: Date[];
  patterns?: string[];
}

interface TemporalAggregationOptions {
  enabled: boolean;
  period?: TemporalAggregationPeriod;
  includeTrends?: boolean;
}

interface TemporalPerformanceOptions {
  enableCaching?: boolean;
  timeout?: number;
  maxResults?: number;
}

interface TemporalFilterQuery extends SearchQuery {
  temporalFilters?: TemporalFiltersInput;
  aggregation?: TemporalAggregationOptions;
  performance?: TemporalPerformanceOptions;
}

interface NormalizedTemporalQuery extends TemporalFilterQuery {
  text: string;
  temporalFilters?: TemporalFiltersInput;
}

interface TemporalFilterStrategyOptions {
  naturalLanguage: {
    enableParsing: boolean;
    enablePatternMatching: boolean;
    confidenceThreshold: number;
  };
  aggregation: {
    enableAggregation: boolean;
    defaultPeriod: TemporalAggregationPeriod;
    maxBuckets: number;
    enableTrends: boolean;
  };
  performance: {
    enableQueryOptimization: boolean;
    enableResultCaching: boolean;
    maxExecutionTime: number;
    batchSize: number;
  };
}

type StrategySpecificConfig = Partial<TemporalFilterStrategyOptions>;

const DEFAULT_OPTIONS: TemporalFilterStrategyOptions = {
  naturalLanguage: {
    enableParsing: true,
    enablePatternMatching: true,
    confidenceThreshold: 0.3,
  },
  aggregation: {
    enableAggregation: true,
    defaultPeriod: {
      type: 'day',
      count: 1,
    },
    maxBuckets: 50,
    enableTrends: true,
  },
  performance: {
    enableQueryOptimization: true,
    enableResultCaching: true,
    maxExecutionTime: 10000,
    batchSize: 100,
  },
};

/**
 * TemporalFilterStrategy - Advanced temporal filtering with time range support.
 * Refactored to leverage BaseSearchStrategy for shared sanitisation and error handling.
 */
export class TemporalFilterStrategy extends BaseSearchStrategy {
  readonly name = SearchStrategy.TEMPORAL_FILTER;
  readonly priority = 8;
  readonly supportedMemoryTypes = ['short_term', 'long_term'] as const;
  readonly description = 'Advanced temporal filtering with time range support';
  readonly capabilities = [
    SearchCapability.TEMPORAL_FILTERING,
    SearchCapability.TIME_RANGE_PROCESSING,
    SearchCapability.TEMPORAL_PATTERN_MATCHING,
    SearchCapability.TEMPORAL_AGGREGATION,
    SearchCapability.FILTERING,
    SearchCapability.RELEVANCE_SCORING,
  ] as const;

  private readonly options: TemporalFilterStrategyOptions;
  private readonly cache = new Map<string, { result: SearchResult[]; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: SearchStrategyConfig, databaseManager: DatabaseManager) {
    super(config, databaseManager);
    this.options = this.mergeOptions(config.strategySpecific as StrategySpecificConfig | undefined);
  }

  canHandle(query: SearchQuery): boolean {
    return (
      this.hasTemporalFilters(query) ||
      (typeof query.text === 'string' && this.containsTemporalPatterns(query.text)) ||
      (!query.text && (query.limit ?? 0) > 0)
    );
  }

  protected getCapabilities(): readonly SearchCapability[] {
    return this.capabilities;
  }

  protected async executeSearch(query: SearchQuery): Promise<SearchResult[]> {
    try {
      const normalizedQuery = this.normalizeQuery(query);
      const cacheKey = this.generateCacheKey(normalizedQuery);

      if (this.options.performance.enableResultCaching) {
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp <= this.CACHE_TTL) {
          return cached.result;
        }
      }

      const patternAnalysis = this.analyzeTemporalPatterns(normalizedQuery);
      const temporalQuery = this.buildTemporalQuery(normalizedQuery, patternAnalysis);
      const sql = this.buildTemporalSQL(normalizedQuery, temporalQuery, patternAnalysis);
      const rawRows = await this.executeTemporalQuery(sql);
      let processedResults = this.processTemporalResults(rawRows, normalizedQuery, patternAnalysis);

      if (this.shouldApplyAggregation(normalizedQuery)) {
        processedResults = await this.applyTemporalAggregation(processedResults, normalizedQuery);
      }

      if (this.options.performance.enableResultCaching) {
        this.cacheResult(cacheKey, processedResults);
      }

      return processedResults;
    } catch (error) {
      throw this.handleSearchError(
        error,
        'temporal_search',
        { query: query.text },
        SearchErrorCategory.EXECUTION,
      );
    }
  }

  getMetadata(): SearchStrategyMetadata {
    return {
      name: this.name,
      version: '1.0.0',
      description: this.description,
      capabilities: [...this.capabilities],
      supportedMemoryTypes: [...this.supportedMemoryTypes],
      configurationSchema: {
        type: 'object',
        properties: {
          priority: { type: 'number', minimum: 0, maximum: 100 },
          timeout: { type: 'number', minimum: 1000, maximum: 30000 },
          strategySpecific: {
            type: 'object',
            properties: {
              naturalLanguage: {
                type: 'object',
                properties: {
                  enableParsing: { type: 'boolean' },
                  enablePatternMatching: { type: 'boolean' },
                  confidenceThreshold: { type: 'number', minimum: 0, maximum: 1 },
                },
              },
              aggregation: {
                type: 'object',
                properties: {
                  enableAggregation: { type: 'boolean' },
                  defaultPeriod: { type: 'string' },
                  maxBuckets: { type: 'number', minimum: 1, maximum: 500 },
                  enableTrends: { type: 'boolean' },
                },
              },
              performance: {
                type: 'object',
                properties: {
                  enableQueryOptimization: { type: 'boolean' },
                  enableResultCaching: { type: 'boolean' },
                  maxExecutionTime: { type: 'number', minimum: 1000, maximum: 60000 },
                  batchSize: { type: 'number', minimum: 10, maximum: 1000 },
                },
              },
            },
          },
        },
        required: ['priority', 'timeout'],
      },
      performanceMetrics: {
        averageResponseTime: 150,
        throughput: 300,
        memoryUsage: 12,
      },
    };
  }

  protected validateStrategyConfiguration(): boolean {
    const { aggregation, performance, naturalLanguage } = this.options;

    if (aggregation.maxBuckets < 1 || aggregation.maxBuckets > 500) {
      return false;
    }

    if (
      performance.maxExecutionTime < 1000 ||
      performance.maxExecutionTime > 60000
    ) {
      return false;
    }

    if (performance.batchSize < 10 || performance.batchSize > 5000) {
      return false;
    }

    if (
      naturalLanguage.confidenceThreshold < 0 ||
      naturalLanguage.confidenceThreshold > 1
    ) {
      return false;
    }

    return true;
  }

  private mergeOptions(strategySpecific?: StrategySpecificConfig): TemporalFilterStrategyOptions {
    if (!strategySpecific) {
      return DEFAULT_OPTIONS;
    }

    return {
      naturalLanguage: {
        ...DEFAULT_OPTIONS.naturalLanguage,
        ...strategySpecific.naturalLanguage,
      },
      aggregation: {
        ...DEFAULT_OPTIONS.aggregation,
        ...strategySpecific.aggregation,
      },
      performance: {
        ...DEFAULT_OPTIONS.performance,
        ...strategySpecific.performance,
      },
    };
  }

  private normalizeQuery(query: SearchQuery): NormalizedTemporalQuery {
    const temporalQuery = query as TemporalFilterQuery;
    const normalized: NormalizedTemporalQuery = {
      ...temporalQuery,
      text: this.sanitizeSearchText(query.text ?? ''),
    };

    const filters =
      temporalQuery.temporalFilters ||
      ((query.filters as { temporalFilters?: TemporalFiltersInput } | undefined)?.temporalFilters);

    if (filters) {
      normalized.temporalFilters = this.normalizeTemporalFilters(filters);
    }

    return normalized;
  }

  private sanitizeSearchText(text: string): string {
    try {
      return sanitizeString(text, {
        fieldName: 'searchText',
        allowNewlines: false,
        maxLength: SANITIZATION_LIMITS.SEARCH_QUERY_MAX_LENGTH,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw this.handleValidationError(error.message, 'searchText', text);
      }
      throw error;
    }
  }

  private normalizeTemporalFilters(filters: TemporalFiltersInput): TemporalFiltersInput {
    const normalized: TemporalFiltersInput = {};

    if (filters.timeRanges) {
      normalized.timeRanges = filters.timeRanges
        .filter(range => range.start instanceof Date && range.end instanceof Date)
        .map(range => ({
          start: new Date(range.start),
          end: new Date(range.end),
        }));
    }

    if (filters.absoluteDates) {
      normalized.absoluteDates = filters.absoluteDates
        .filter(date => date instanceof Date)
        .map(date => new Date(date));
    }

    if (filters.relativeExpressions) {
      normalized.relativeExpressions = filters.relativeExpressions
        .filter(expr => typeof expr === 'string' && expr.trim().length > 0)
        .map((expr, index) => this.sanitizeTemporalExpression(expr, `relativeExpression_${index}`))
        .filter((expr): expr is string => Boolean(expr));
    }

    if (filters.patterns) {
      normalized.patterns = filters.patterns
        .filter(pattern => typeof pattern === 'string' && pattern.trim().length > 0)
        .map((pattern, index) => this.sanitizeTemporalExpression(pattern, `temporalPattern_${index}`))
        .filter((pattern): pattern is string => Boolean(pattern));
    }

    return normalized;
  }

  private sanitizeTemporalExpression(value: string, fieldName: string): string | undefined {
    try {
      return sanitizeString(value, {
        fieldName,
        allowNewlines: false,
        maxLength: 200,
      });
    } catch (error) {
      logWarn('Invalid temporal expression filtered', {
        component: 'TemporalFilterStrategy',
        operation: 'sanitizeTemporalExpression',
        fieldName,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private hasTemporalFilters(query: SearchQuery): boolean {
    const temporalQuery = query as TemporalFilterQuery;
    const filters =
      temporalQuery.temporalFilters ||
      ((query.filters as { temporalFilters?: TemporalFiltersInput } | undefined)?.temporalFilters);

    if (!filters) {
      return false;
    }

    return Boolean(
      filters.timeRanges?.length ||
      filters.relativeExpressions?.length ||
      filters.absoluteDates?.length ||
      filters.patterns?.length
    );
  }

  private containsTemporalPatterns(text: string | undefined): boolean {
    if (!text || !this.options.naturalLanguage.enablePatternMatching) {
      return false;
    }

    const analysis = TemporalPatternMatcher.analyzeText(text);
    return analysis.overallConfidence >= this.options.naturalLanguage.confidenceThreshold;
  }

  private analyzeTemporalPatterns(query: NormalizedTemporalQuery): PatternMatchResult {
    if (!this.options.naturalLanguage.enablePatternMatching || !query.text) {
      return {
        patterns: [],
        overallConfidence: 0,
        requiresContext: false,
      };
    }

    return TemporalPatternMatcher.analyzeText(query.text);
  }

  private buildTemporalQuery(
    query: NormalizedTemporalQuery,
    patternAnalysis: PatternMatchResult,
  ): TimeRangeQuery {
    const filters =
      query.temporalFilters ||
      ((query.filters as { temporalFilters?: TemporalFiltersInput } | undefined)?.temporalFilters) ||
      {};
    const safePatternAnalysis = patternAnalysis ?? {
      patterns: [],
      overallConfidence: 0,
      requiresContext: false,
    };
    const ranges: TimeRange[] = [];

    if (filters.timeRanges) {
      ranges.push(...filters.timeRanges);
    }

    if (filters.absoluteDates) {
      filters.absoluteDates.forEach(date => {
        ranges.push({
          start: new Date(date.getTime() - 12 * 60 * 60 * 1000),
          end: new Date(date.getTime() + 12 * 60 * 60 * 1000),
        });
      });
    }

    if (filters.relativeExpressions) {
      filters.relativeExpressions.forEach(expression => {
        const parsed = this.parseRelativeExpression(expression);
        if (parsed.start && parsed.end) {
          ranges.push(parsed as TimeRange);
        }
      });
    }

    if (safePatternAnalysis.patterns.length > 0) {
      safePatternAnalysis.patterns.forEach(pattern => {
        if (pattern.normalized.start) {
          ranges.push({
            start: pattern.normalized.start,
            end: pattern.normalized.end ||
              new Date(pattern.normalized.start.getTime() + 24 * 60 * 60 * 1000),
          });
        }
      });
    }

    return {
      ranges,
      operation: 'UNION',
      granularity: 'minute',
    };
  }

  private buildTemporalSQL(
    query: NormalizedTemporalQuery,
    temporalQuery: TimeRangeQuery,
    patterns: PatternMatchResult,
  ): string {
    const limit = Math.min(query.limit ?? this.config.maxResults, this.config.maxResults);
    const offset = Math.max(0, query.offset ?? 0);
    const whereClause = this.buildTemporalWhereClause(query, temporalQuery, patterns);
    const orderByClause = this.buildTemporalOrderByClause(query, temporalQuery);

    return `
      SELECT
        id as memory_id,
        searchableContent as searchable_content,
        summary,
        metadata,
        memoryType as memory_type,
        categoryPrimary as category_primary,
        importanceScore as importance_score,
        createdAt as created_at,
        '${this.name}' as search_strategy,
        ${this.buildTemporalRelevanceCalculation('created_at', temporalQuery)} as temporal_relevance_score
      FROM (
        SELECT
          id,
          searchableContent,
          summary,
          metadata,
          memoryType,
          categoryPrimary,
          importanceScore,
          createdAt
        FROM short_term_memory
        WHERE ${whereClause}

        UNION ALL

        SELECT
          id,
          searchableContent,
          summary,
          metadata,
          memoryType,
          categoryPrimary,
          importanceScore,
          createdAt
        FROM long_term_memory
        WHERE ${whereClause}
      ) AS temporal_memories
      ${orderByClause}
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  private buildTemporalWhereClause(
    query: NormalizedTemporalQuery,
    temporalQuery: TimeRangeQuery,
    patterns: PatternMatchResult,
  ): string {
    const conditions: string[] = [];
    const safePatterns = patterns ?? {
      patterns: [],
      overallConfidence: 0,
      requiresContext: false,
    };

    if ((this.databaseManager as unknown as { currentNamespace?: string }).currentNamespace) {
      const namespace = (this.databaseManager as unknown as { currentNamespace?: string }).currentNamespace ?? '';
      conditions.push(`json_extract(metadata, '$.namespace') = '${this.escapeSqlString(namespace)}'`);
    }

    if (query.text) {
      conditions.push(this.buildTextSearchCondition(query.text));
    }

    if (temporalQuery.ranges.length > 0) {
      const rangeConditions = temporalQuery.ranges.map(range => (
        `created_at BETWEEN '${range.start.toISOString()}' AND '${range.end.toISOString()}'`
      ));
      conditions.push(`(${rangeConditions.join(' OR ')})`);
    }

    if (safePatterns.patterns.length > 0) {
      const patternConditions = safePatterns.patterns
        .filter(pattern => pattern.normalized.start)
        .map(pattern => {
          const start = pattern.normalized.start!;
          const end = pattern.normalized.end ?? new Date(start.getTime() + 24 * 60 * 60 * 1000);
          return `created_at BETWEEN '${start.toISOString()}' AND '${end.toISOString()}'`;
        });

      if (patternConditions.length > 0) {
        conditions.push(`(${patternConditions.join(' OR ')})`);
      }
    }

    return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  }

  private buildTextSearchCondition(searchText: string): string {
    const terms = searchText.split(/\s+/).filter(term => term.length > 0);
    if (terms.length === 0) {
      return '1=1';
    }

    const clauses = terms.map(term => {
      const escaped = this.escapeSqlString(term);
      return `(searchableContent LIKE '%${escaped}%' ESCAPE '\\' OR summary LIKE '%${escaped}%' ESCAPE '\\')`;
    });

    return `(${clauses.join(' OR ')})`;
  }

  private buildTemporalRelevanceCalculation(
    createdAtField: string,
    temporalQuery: TimeRangeQuery,
  ): string {
    const now = new Date().toISOString();
    let calculation = `
      CASE
        WHEN CAST(strftime('%s', '${now}') AS INTEGER) - CAST(strftime('%s', ${createdAtField}) AS INTEGER) < 0
          THEN 1.0
        ELSE EXP(-0.693147 * (
          CAST(strftime('%s', '${now}') AS INTEGER) - CAST(strftime('%s', ${createdAtField}) AS INTEGER)
        ) / 604800)
      END
    `;

    if (temporalQuery.ranges.length > 0) {
      const boosts = temporalQuery.ranges.map(range => `
        CASE
          WHEN ${createdAtField} BETWEEN '${range.start.toISOString()}' AND '${range.end.toISOString()}'
            THEN 1.2
          ELSE 1.0
        END
      `);

      calculation = `(${calculation}) * (${boosts.join(' * ')})`;
    }

    return calculation;
  }

  private buildTemporalOrderByClause(
    query: NormalizedTemporalQuery,
    _temporalQuery: TimeRangeQuery,
  ): string {
    const parts = ['temporal_relevance_score DESC'];

    if (query.sortBy) {
      const direction = query.sortBy.direction === 'asc' ? 'ASC' : 'DESC';
      parts.push(`${query.sortBy.field} ${direction}`);
    } else {
      parts.push('importance_score DESC', 'created_at DESC');
    }

    return `ORDER BY ${parts.join(', ')}`;
  }

  private async executeTemporalQuery(sql: string): Promise<unknown[]> {
    try {
      const prisma = this.databaseManager.getPrismaClient();
      const result = await prisma.$queryRawUnsafe<unknown[]>(sql);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      throw this.handleDatabaseError(error, 'execute_temporal_query', sql.substring(0, 200));
    }
  }

  private processTemporalResults(
    results: unknown[],
    query: NormalizedTemporalQuery,
    patterns: PatternMatchResult,
  ): SearchResult[] {
    const processed: SearchResult[] = [];
    const now = new Date();
    const safePatterns = patterns ?? {
      patterns: [],
      overallConfidence: 0,
      requiresContext: false,
    };

    for (const raw of results) {
      const row = raw as Partial<DatabaseQueryResult & { temporal_relevance_score?: number }>;

      try {
        const memoryId = row.memory_id ?? (row as Record<string, unknown>).id;
        if (!memoryId) {
          throw new Error('Missing memory identifier');
        }

        const importanceScore = row.importance_score ?? 0.5;
        const createdAt = row.created_at ? new Date(row.created_at) : new Date();
        const baseMetadata = this.parseMetadata(row.metadata ?? '{}');
        const temporalScore = this.calculateTemporalRelevance(row, safePatterns, now);

        processed.push({
          id: String(memoryId),
          content: row.searchable_content ?? '',
          metadata: query.includeMetadata ? {
            summary: row.summary ?? '',
            category: row.category_primary ?? '',
            importanceScore,
            memoryType: row.memory_type ?? 'long_term',
            createdAt,
            temporalRelevance: temporalScore,
            ...baseMetadata,
          } : {},
          score: temporalScore,
          strategy: this.name,
          timestamp: createdAt,
        });
      } catch (error) {
        logWarn('Failed to process temporal result row', {
          component: 'TemporalFilterStrategy',
          operation: 'process_results',
          error: error instanceof Error ? error.message : String(error),
          rowId: row.memory_id,
        });
      }
    }

    return processed;
  }

  private parseMetadata(metadataJson: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(metadataJson);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (error) {
      logWarn('Failed to parse temporal metadata', {
        component: 'TemporalFilterStrategy',
        operation: 'parse_metadata',
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private calculateTemporalRelevance(
    row: Partial<DatabaseQueryResult & { temporal_relevance_score?: number }>,
    patterns: PatternMatchResult,
    now: Date | number,
  ): number {
    const nowDate = now instanceof Date ? now : new Date(now);
    const createdAt = row.created_at ? new Date(row.created_at) : nowDate;
    const timeDelta = Math.max(0, nowDate.getTime() - createdAt.getTime());
    const recencyScore = Math.exp(-timeDelta / (7 * 24 * 60 * 60 * 1000)); // 7-day half-life

    let patternBoost = 1;
    const safePatterns = patterns ?? { patterns: [], overallConfidence: 0, requiresContext: false };
    if (safePatterns.patterns.length > 0) {
      const hasMatchingPattern = safePatterns.patterns.some(pattern => {
        if (!pattern.normalized.start) {
          return false;
        }
        const patternStart = pattern.normalized.start.getTime();
        const patternEnd = (pattern.normalized.end ?? new Date(patternStart + 24 * 60 * 60 * 1000)).getTime();
        return createdAt.getTime() >= patternStart && createdAt.getTime() <= patternEnd;
      });

      if (hasMatchingPattern) {
        patternBoost = 1.2;
      }
    }

    const importanceScore = row.importance_score ?? 0.5;
    const baseScore = row.temporal_relevance_score ?? recencyScore;

    return Math.max(0, Math.min(1, baseScore * patternBoost * (0.5 + importanceScore)));
  }

  private shouldApplyAggregation(query: NormalizedTemporalQuery): boolean {
    const aggregationRequest = query.aggregation;

    if (!this.options.aggregation.enableAggregation && !aggregationRequest?.enabled) {
      return false;
    }

    return Boolean(aggregationRequest?.enabled);
  }

  private async applyTemporalAggregation(
    results: SearchResult[],
    query: NormalizedTemporalQuery,
  ): Promise<SearchResult[]> {
    const period = query.aggregation?.period ?? this.options.aggregation.defaultPeriod;
    const includeTrends = query.aggregation?.includeTrends ?? this.options.aggregation.enableTrends;

    const aggregationData = results.map(result => ({
      id: result.id,
      content: result.content,
      score: result.score,
      timestamp: result.timestamp,
      metadata: result.metadata,
    }));

    const aggregated = TemporalService.aggregate(
      aggregationData,
      period,
      {
        includeTrends,
        maxBuckets: this.options.aggregation.maxBuckets,
        representativeStrategy: 'highest_score',
      },
    );

    return aggregated.buckets.map(bucket => ({
      id: `temporal_bucket_${bucket.period.start.getTime()}`,
      content: `Memories from ${bucket.period.label}`,
      metadata: {
        aggregated: true,
        statistics: bucket.statistics,
        trend: bucket.trend,
        period: bucket.period,
      },
      score: bucket.statistics.averageScore ?? 0.5,
      strategy: this.name,
      timestamp: bucket.period.start,
    }));
  }

  private parseRelativeExpression(expression: string): Partial<TimeRange> {
    try {
      const normalized = DateTimeNormalizer.normalize(expression);
      const windowSize = 60 * 60 * 1000; // hour window
      return {
        start: new Date(normalized.date.getTime() - windowSize),
        end: new Date(normalized.date.getTime() + windowSize),
      };
    } catch (error) {
      logWarn('Failed to parse relative expression', {
        component: 'TemporalFilterStrategy',
        operation: 'parseRelativeExpression',
        expression,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private cacheResult(cacheKey: string, results: SearchResult[]): void {
    this.cache.set(cacheKey, {
      result: results,
      timestamp: Date.now(),
    });

    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }

  private generateCacheKey(query: NormalizedTemporalQuery): string {
    return JSON.stringify({
      text: query.text,
      temporalFilters: query.temporalFilters,
      aggregation: query.aggregation,
      limit: query.limit,
      offset: query.offset,
    });
  }

  private escapeSqlString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, '\'\'');
  }
}
