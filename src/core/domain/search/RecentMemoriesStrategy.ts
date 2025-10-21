import { SearchCapability, SearchStrategyMetadata, BaseSearchStrategy, SearchQuery, SearchResult, SearchStrategyConfig } from './SearchStrategy';
import { SearchStrategy, DatabaseQueryResult } from './types';
import { DatabaseManager } from '../../infrastructure/database/DatabaseManager';
import { logError, logWarn } from '../../infrastructure/config/Logger';

/**
 * Configuration interface for time-based relevance scoring
 */
interface TimeDecayConfig {
  /** Half-life in milliseconds for exponential decay */
  halfLifeMs: number;
  /** Minimum score for very old memories */
  minScore: number;
  /** Maximum score for very recent memories */
  maxScore: number;
  /** Boost factor for recent memories within this time window */
  recentBoostWindowMs: number;
  /** Boost multiplier for recent memories */
  recentBoostFactor: number;
}

/**
 * Configuration interface for freshness boosting
 */
interface FreshnessBoostConfig {
  /** Boost factor for memories from the last hour */
  lastHourBoost: number;
  /** Boost factor for memories from the last day */
  lastDayBoost: number;
  /** Boost factor for memories from the last week */
  lastWeekBoost: number;
  /** Base boost factor for all recent memories */
  baseBoost: number;
}

/**
 * Configuration interface for temporal filtering
 */
interface TemporalFilterConfig {
  /** Default lookback period in milliseconds when no range specified */
  defaultLookbackMs: number;
  /** Maximum lookback period to prevent excessive queries */
  maxLookbackMs: number;
  /** Minimum time range for meaningful queries */
  minRangeMs: number;
}

/**
 * Comprehensive RecentMemoriesStrategy implementation with time-based relevance scoring
 */
export class RecentMemoriesStrategy extends BaseSearchStrategy {
  readonly name = SearchStrategy.RECENT;
  readonly description = 'Recent memories search with time-based relevance scoring';
  readonly capabilities = [
    SearchCapability.RELEVANCE_SCORING,
    SearchCapability.FILTERING,
    SearchCapability.SORTING,
  ] as const;

  readonly priority = 3;
  readonly supportedMemoryTypes = ['short_term', 'long_term'] as const;

  // Time-based relevance configuration
  private readonly timeDecayConfig: TimeDecayConfig = {
    halfLifeMs: 7 * 24 * 60 * 60 * 1000, // 7 days half-life
    minScore: 0.1,
    maxScore: 1.0,
    recentBoostWindowMs: 60 * 60 * 1000, // 1 hour
    recentBoostFactor: 1.5,
  };

  // Freshness boosting configuration
  private readonly freshnessBoost: FreshnessBoostConfig = {
    lastHourBoost: 2.0,
    lastDayBoost: 1.5,
    lastWeekBoost: 1.2,
    baseBoost: 1.1,
  };

  // Temporal filtering configuration
  private readonly temporalFilter: TemporalFilterConfig = {
    defaultLookbackMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxLookbackMs: 365 * 24 * 60 * 60 * 1000, // 1 year
    minRangeMs: 60 * 1000, // 1 minute
  };

  constructor(config: SearchStrategyConfig, databaseManager: DatabaseManager) {
    super(config, databaseManager);
  }

  protected validateQuery(query: SearchQuery): void {
    // Allow empty text when retrieving recent memories
    if (!query.text && !query.filters) {
      return;
    }

    super.validateQuery(query);
  }

  protected getCapabilities(): readonly SearchCapability[] {
    return this.capabilities;
  }

  /**
   * Determines if this strategy can handle the given query
   */
  canHandle(query: SearchQuery): boolean {
    // Can handle queries that benefit from time-based relevance
    // This includes empty queries (for recent memories), queries with temporal filters, or queries with time-sensitive content
    return query.text.length === 0 || this.hasTemporalFilters(query);
  }

  /**
   * Check if query contains temporal filters
   */
  private hasTemporalFilters(query: SearchQuery): boolean {
    if (!query.filters) return false;

    const temporalFields = ['createdAfter', 'createdBefore', 'since', 'until', 'age', 'timeRange'];
    return temporalFields.some(field => field in query.filters!) ||
           !!query.filters.temporalFilters;
  }

  /**
   * Main search method implementing time-based relevance scoring
   */
  protected async executeSearch(query: SearchQuery): Promise<SearchResult[]> {
    const startTime = Date.now();

    try {
      // Build temporal query with time-based relevance scoring
      const sql = this.buildTemporalSQL(query);
      const parameters = this.getQueryParameters(query);

      // Execute the query
      const results = await this.executeTemporalQuery(sql, parameters);
      const processedResults = this.processTemporalResults(results, query);

      // Log performance metrics
      const duration = Date.now() - startTime;
      this.logSearchOperation('temporal_search', duration, processedResults.length);

      return processedResults;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logSearchOperation('temporal_search_failed', duration, 0);

      throw this.handleSearchError(error, 'temporal_search', {
        query: query.text,
        duration: `${duration}ms`,
      });
    }
  }


  /**
   * Build temporal SQL with time-based relevance scoring and filtering
   */
  private buildTemporalSQL(query: SearchQuery): string {
    const limit = Math.min(this.config.maxResults || 100, 1000);
    const offset = query.offset || 0;

    // Build WHERE clause with temporal filters
    const whereClause = this.buildTemporalWhereClause(query);

    // Build ORDER BY clause with time-based relevance scoring
    const orderByClause = this.buildTemporalOrderByClause(query);

    // Build the main temporal query
    const sql = `
      SELECT
        id as memory_id,
        searchableContent as searchable_content,
        summary,
        processedData as metadata,
        retentionType as memory_type,
        categoryPrimary as category_primary,
        importanceScore as importance_score,
        createdAt as created_at,
        '${this.name}' as search_strategy,
        -- Calculate time-based relevance score
        ${this.buildTimeRelevanceCalculation('createdAt')} as time_relevance_score
      FROM (
        -- Query short_term_memory
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
        WHERE 1=1
        ${whereClause}

        UNION ALL

        -- Query long_term_memory
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
        WHERE 1=1
        ${whereClause}
      ) AS combined_memories
      ${orderByClause}
      LIMIT ${limit} OFFSET ${offset}
    `;

    return sql;
  }

  /**
   * Build time-based relevance calculation SQL
   */
  private buildTimeRelevanceCalculation(createdAtField: string): string {
    // Use a simpler time-based calculation that doesn't require EXP function
    const now = new Date().toISOString();
    const halfLifeMs = this.timeDecayConfig.halfLifeMs;

    return `
      -- Simplified time decay: score decreases linearly with age
      CASE
        WHEN CAST(strftime('%s', '${now}') AS INTEGER) - CAST(strftime('%s', ${createdAtField}) AS INTEGER) < 0
        THEN ${this.timeDecayConfig.maxScore} -- Future dates (shouldn't happen)
        ELSE MAX(${this.timeDecayConfig.minScore},
          ${this.timeDecayConfig.maxScore} - (
            (CAST(strftime('%s', '${now}') AS INTEGER) - CAST(strftime('%s', ${createdAtField}) AS INTEGER)) * 1000.0 / ${halfLifeMs}
          ) * 2
        )
      END
    `;
  }

  /**
   * Build WHERE clause with temporal filtering
   */
  private buildTemporalWhereClause(query: SearchQuery): string {
    const conditions: string[] = [];

    // Add namespace filtering - use the database manager's namespace if available
    const dbManager = this.databaseManager as any;
    if (dbManager && dbManager.namespace) {
      conditions.push(`json_extract(metadata, '$.namespace') = '${dbManager.namespace}'`);
    }

    // Add text search conditions if query has text
    if (query.text && query.text.trim()) {
      const searchCondition = this.buildTextSearchCondition(query.text);
      conditions.push(searchCondition);
    }

    // Add temporal filters
    if (query.filters) {
      const temporalConditions = this.buildTemporalFilterConditions(query.filters as any);
      conditions.push(...temporalConditions);
    }

    return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
  }

  /**
   * Build text search conditions for temporal queries
   */
  private buildTextSearchCondition(searchText: string): string {
    const terms = searchText.split(/\s+/).filter(term => term.length > 0);
    const conditions: string[] = [];

    for (const term of terms) {
      const escapedTerm = this.escapeSqlString(term);
      conditions.push(
        `(searchable_content LIKE '%${escapedTerm}%' OR summary LIKE '%${escapedTerm}%')`,
      );
    }

    return `(${conditions.join(' OR ')})`;
  }

  /**
   * Build temporal filter conditions from query filters
   */
  private buildTemporalFilterConditions(filters: Record<string, unknown>): string[] {
    const conditions: string[] = [];

    // Date range filtering
    if (filters.createdAfter) {
      const afterDate = this.parseTemporalValue(filters.createdAfter);
      conditions.push(`created_at >= '${afterDate.toISOString()}'`);
    }

    if (filters.createdBefore) {
      const beforeDate = this.parseTemporalValue(filters.createdBefore);
      conditions.push(`created_at <= '${beforeDate.toISOString()}'`);
    }

    // Relative time filtering
    if (filters.since) {
      const sinceDate = this.parseRelativeTime(filters.since as string);
      conditions.push(`created_at >= '${sinceDate.toISOString()}'`);
    }

    if (filters.until) {
      const untilDate = this.parseRelativeTime(filters.until as string);
      conditions.push(`created_at <= '${untilDate.toISOString()}'`);
    }

    // Age-based filtering
    if (filters.age) {
      const ageDate = this.parseAgeFilter(filters.age as string);
      conditions.push(`created_at >= '${ageDate.toISOString()}'`);
    }

    return conditions;
  }

  /**
   * Parse temporal values (ISO strings, timestamps, etc.)
   */
  private parseTemporalValue(value: unknown): Date {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${value}`);
      }
      return date;
    }

    if (typeof value === 'number') {
      return new Date(value);
    }

    throw new Error(`Unsupported temporal value type: ${typeof value}`);
  }

  /**
   * Parse relative time expressions (e.g., "1 day ago", "2 weeks ago", "1 day", "2 weeks")
   */
  private parseRelativeTime(relativeTime: string): Date {
    const now = new Date();
    // Handle both "X unit ago" and "X unit" formats
    const match = relativeTime.match(/^(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*(ago)?$/i);

    if (!match) {
      throw new Error(`Invalid relative time format: ${relativeTime}`);
    }

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase() as 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

    const multipliers = {
      second: 1000,
      minute: 1000 * 60,
      hour: 1000 * 60 * 60,
      day: 1000 * 60 * 60 * 24,
      week: 1000 * 60 * 60 * 24 * 7,
      month: 1000 * 60 * 60 * 24 * 30, // Approximate
      year: 1000 * 60 * 60 * 24 * 365, // Approximate
    };

    const msAgo = amount * multipliers[unit];
    return new Date(now.getTime() - msAgo);
  }

  /**
   * Parse age-based filters (e.g., "younger than 1 day", "older than 2 weeks")
   */
  private parseAgeFilter(ageFilter: string): Date {
    const match = ageFilter.match(/^(younger|older)\s+than\s+(.+)$/i);

    if (!match) {
      throw new Error(`Invalid age filter format: ${ageFilter}`);
    }

    const direction = match[1].toLowerCase();
    const relativeTime = match[2];
    const comparisonDate = this.parseRelativeTime(relativeTime);

    if (direction === 'younger') {
      // Younger than X means created after (now - X)
      return comparisonDate;
    } else {
      // Older than X means created before (now - X)
      return comparisonDate;
    }
  }

  /**
   * Build ORDER BY clause with time-based relevance scoring
   */
  private buildTemporalOrderByClause(query: SearchQuery): string {
    let orderBy = 'ORDER BY time_relevance_score DESC';

    // Add secondary sorting criteria
    if (query.sortBy) {
      const direction = query.sortBy.direction.toUpperCase();
      orderBy += `, ${query.sortBy.field} ${direction}`;
    } else {
      // Default secondary sort by importance and recency
      orderBy += ', importance_score DESC, created_at DESC';
    }

    return orderBy;
  }

  /**
   * Get query parameters for safe execution
   */
  private getQueryParameters(query: SearchQuery): unknown[] {
    // For this implementation, we use embedded parameters in SQL
    // More complex parameter binding could be added here if needed
    return [];
  }

  /**
   * Execute temporal query with error handling
   */
  private async executeTemporalQuery(sql: string, parameters: unknown[]): Promise<unknown[]> {
    const dbManager = this.databaseManager;
    const db = dbManager.getPrismaClient();

    try {
      return await db.$queryRawUnsafe(sql, ...parameters);
    } catch (error) {
      logError('Temporal query execution failed', {
        component: 'RecentMemoriesStrategy',
        operation: 'executeTemporalQuery',
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Temporal query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process temporal results with time-based relevance scoring and freshness boosting
   */
  private processTemporalResults(results: unknown[], query: SearchQuery): SearchResult[] {
    const searchResults: SearchResult[] = [];
    const queryTime = new Date();

    for (const row of results as DatabaseQueryResult[]) {
      try {
        const createdAt = new Date(row.created_at);
        const metadata = JSON.parse(row.metadata || '{}');

        // Calculate time-based relevance score
        const timeRelevance = this.calculateTimeRelevance(createdAt, queryTime);
        const rawScore = parseFloat((row as any).time_relevance_score) || timeRelevance;

        // Apply freshness boost
        const freshnessBoost = this.calculateFreshnessBoost(createdAt, queryTime);
        const boostedScore = this.applyFreshnessBoost(rawScore, freshnessBoost);

        // Create search result with enhanced scoring
        const searchResult = this.createSearchResult(
          row.memory_id,
          row.searchable_content,
          {
            summary: row.summary || '',
            category: row.category_primary,
            importanceScore: row.importance_score || 0.5,
            memoryType: row.memory_type,
            createdAt: createdAt,
            timeRelevanceScore: timeRelevance,
            freshnessBoost: freshnessBoost,
            ...metadata,
          },
          boostedScore,
        );

        searchResults.push(searchResult);

      } catch (error) {
        logWarn('Error processing temporal result row', {
          component: 'RecentMemoriesStrategy',
          operation: 'processTemporalResults',
          rowId: row.memory_id,
          error: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
    }

    return searchResults;
  }

  /**
   * Calculate time-based relevance score using exponential decay
   */
  private calculateTimeRelevance(createdAt: Date, queryTime: Date): number {
    const ageMs = queryTime.getTime() - createdAt.getTime();

    // Apply exponential decay
    const halfLifeMs = this.timeDecayConfig.halfLifeMs;
    const timeRelevance = Math.exp(-Math.LN2 * ageMs / halfLifeMs);

    // Clamp to configured range
    return Math.max(
      this.timeDecayConfig.minScore,
      Math.min(this.timeDecayConfig.maxScore, timeRelevance),
    );
  }

  /**
   * Calculate freshness boost based on memory age
   */
  private calculateFreshnessBoost(createdAt: Date, queryTime: Date): number {
    const ageMs = queryTime.getTime() - createdAt.getTime();

    // Apply different boost factors based on age
    if (ageMs <= 60 * 60 * 1000) { // Last hour
      return this.freshnessBoost.lastHourBoost;
    } else if (ageMs <= 24 * 60 * 60 * 1000) { // Last day
      return this.freshnessBoost.lastDayBoost;
    } else if (ageMs <= 7 * 24 * 60 * 60 * 1000) { // Last week
      return this.freshnessBoost.lastWeekBoost;
    } else {
      return this.freshnessBoost.baseBoost; // Base boost for all recent memories
    }
  }

  /**
   * Apply freshness boost to base relevance score
   */
  private applyFreshnessBoost(baseScore: number, freshnessBoost: number): number {
    const boostedScore = baseScore * freshnessBoost;

    // Clamp to valid range
    return Math.max(0, Math.min(1, boostedScore));
  }

  /**
   * Escape SQL strings to prevent injection
   */
  private escapeSqlString(str: string): string {
    return str.replace(/'/g, "''").replace(/\\/g, '\\\\');
  }

  /**
   * Validate strategy-specific configuration
   */
  protected validateStrategyConfiguration(): boolean {
    // Validate time decay configuration
    if (this.timeDecayConfig.halfLifeMs <= 0) {
      return false;
    }

    if (this.timeDecayConfig.minScore < 0 || this.timeDecayConfig.minScore > 1) {
      return false;
    }

    if (this.timeDecayConfig.maxScore < this.timeDecayConfig.minScore || this.timeDecayConfig.maxScore > 1) {
      return false;
    }

    // Validate freshness boost configuration
    if (this.freshnessBoost.lastHourBoost < 1 || this.freshnessBoost.lastDayBoost < 1 ||
      this.freshnessBoost.lastWeekBoost < 1 || this.freshnessBoost.baseBoost < 1) {
      return false;
    }

    // Validate temporal filter configuration
    if (this.temporalFilter.defaultLookbackMs <= 0 || this.temporalFilter.maxLookbackMs <= 0) {
      return false;
    }

    if (this.temporalFilter.defaultLookbackMs > this.temporalFilter.maxLookbackMs) {
      return false;
    }

    return true;
  }

  /**
   * Get configuration schema for this strategy
   */
  protected getConfigurationSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        priority: { type: 'number', minimum: 0, maximum: 100, default: 3 },
        timeout: { type: 'number', minimum: 1000, maximum: 30000, default: 5000 },
        maxResults: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
        minScore: { type: 'number', minimum: 0, maximum: 1, default: 0.1 },

        // Time decay configuration
        timeDecay: {
          type: 'object',
          properties: {
            halfLifeMs: { type: 'number', minimum: 1000, default: 604800000 }, // 7 days
            minScore: { type: 'number', minimum: 0, maximum: 1, default: 0.1 },
            maxScore: { type: 'number', minimum: 0, maximum: 1, default: 1.0 },
            recentBoostWindowMs: { type: 'number', minimum: 1000, default: 3600000 }, // 1 hour
            recentBoostFactor: { type: 'number', minimum: 1, default: 1.5 },
          },
        },

        // Freshness boosting configuration
        freshnessBoost: {
          type: 'object',
          properties: {
            lastHourBoost: { type: 'number', minimum: 1, default: 2.0 },
            lastDayBoost: { type: 'number', minimum: 1, default: 1.5 },
            lastWeekBoost: { type: 'number', minimum: 1, default: 1.2 },
            baseBoost: { type: 'number', minimum: 1, default: 1.1 },
          },
        },

        // Temporal filtering configuration
        temporalFilter: {
          type: 'object',
          properties: {
            defaultLookbackMs: { type: 'number', minimum: 1000, default: 2592000000 }, // 30 days
            maxLookbackMs: { type: 'number', minimum: 1000, default: 31536000000 }, // 1 year
            minRangeMs: { type: 'number', minimum: 1000, default: 60000 }, // 1 minute
          },
        },
      },
      required: ['enabled', 'priority', 'timeout', 'maxResults', 'minScore'],
    };
  }

  /**
   * Get performance metrics for this strategy
   */
  protected getPerformanceMetrics(): SearchStrategyMetadata['performanceMetrics'] {
    return {
      averageResponseTime: 80,
      throughput: 800,
      memoryUsage: 8,
    };
  }
}
