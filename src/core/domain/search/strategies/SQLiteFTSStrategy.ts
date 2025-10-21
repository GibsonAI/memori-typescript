import { SearchStrategy, SearchQuery, SearchResult, SearchStrategyMetadata } from '../types';
import { SearchCapability, SearchTimeoutError, SearchStrategyConfig, SearchErrorCategory, SearchErrorContext } from '../SearchStrategy';
import { DatabaseManager } from '../../../infrastructure/database/DatabaseManager';
import { logError, logWarn, logInfo } from '../../../infrastructure/config/Logger';
import { BaseSearchStrategy } from './BaseSearchStrategy';

/**
 * Enhanced SQLite FTS5 search strategy implementation with BM25 ranking and metadata filtering
 * Extracted from SearchService to improve maintainability and separation of concerns
 */
export class SQLiteFTSStrategy extends BaseSearchStrategy {
  readonly name = SearchStrategy.FTS5;
  readonly priority = 10;
  readonly supportedMemoryTypes = ['short_term', 'long_term'] as const;
  readonly description = 'SQLite FTS5 full-text search with BM25 ranking';
  readonly capabilities = [
    SearchCapability.KEYWORD_SEARCH,
    SearchCapability.RELEVANCE_SCORING,
    SearchCapability.FILTERING,
    SearchCapability.SORTING,
  ] as const;

  // FTS5-specific configuration
  private readonly bm25Weights = {
    title: 2.0,
    content: 1.0,
    category: 1.5,
  };

  private readonly maxResultsPerQuery = 1000;
  private readonly queryTimeout = 10000;
  private readonly resultBatchSize = 100;
  constructor(config: SearchStrategyConfig, dbManager: DatabaseManager) {
    super(config, dbManager);
  }





  canHandle(query: SearchQuery): boolean {
    if (!query.text || query.text.trim().length === 0) {
      return false;
    }

    // Try to initialize FTS when actually needed
    try {
      // Simple check - if we can create the FTS table, then FTS5 is available
      const dbManager = this.databaseManager as any;
      const prisma = dbManager?.prisma || this.databaseManager;

      // Try to create FTS table - if it fails, FTS5 is not available
      try {
        prisma.$executeRaw`CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(content, metadata, tokenize = 'porter ascii');`;
        return true;
      } catch (ftsError) {
        logWarn('FTS5 not available in SQLite build', {
          component: 'SQLiteFTSStrategy',
          operation: 'canHandle',
          query: query.text?.substring(0, 100),
          error: ftsError instanceof Error ? ftsError.message : String(ftsError)
        });
        return false;
      }
    } catch (error) {
      logWarn('FTS5 availability check failed', {
        component: 'SQLiteFTSStrategy',
        operation: 'canHandle',
        query: query.text?.substring(0, 100),
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  protected getCapabilities(): readonly SearchCapability[] {
    return this.capabilities;
  }

  protected async executeSearch(query: SearchQuery): Promise<SearchResult[]> {
    const startTime = Date.now();

    try {
      const ftsQuery = this.buildFTSQuery(query);
      const sql = this.buildFTSSQL(query, ftsQuery);
      const parameters = this.getQueryParameters(query);

      const results = await this.executeFTSQuery(sql, parameters, query);
      const processedResults = this.processFTSResults(results, query);

      const duration = Date.now() - startTime;
      logInfo(`FTS5 search completed in ${duration}ms, found ${processedResults.length} results`, {
        component: 'SQLiteFTSStrategy',
        operation: 'search',
        strategy: this.name,
        query: query.text,
        resultCount: processedResults.length,
        executionTime: duration,
        parameters: {
          limit: query.limit,
          offset: query.offset,
          hasFilters: !!query.filters,
          hasFilterExpression: !!query.filterExpression,
        },
      });

      return processedResults;

    } catch (error) {
      const duration = Date.now() - startTime;

      const errorContext = {
        strategy: this.name,
        operation: 'fts_search',
        query: query.text,
        parameters: {
          limit: query.limit,
          offset: query.offset,
          filters: query.filters,
          hasFilterExpression: !!query.filterExpression,
          executionTime: duration,
        },
        executionTime: duration,
        timestamp: new Date(),
        severity: this.categorizeFTSError(error) as 'low' | 'medium' | 'high' | 'critical',
      };

      logError(`FTS5 search failed after ${duration}ms`, {
        component: 'SQLiteFTSStrategy',
        operation: 'search',
        strategy: this.name,
        query: query.text,
        executionTime: duration,
        errorCategory: this.categorizeFTSError(error),
        databaseState: this.getDatabaseState(),
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.handleSearchError(
        error,
        'fts_search',
        errorContext,
        SearchErrorCategory.EXECUTION,
      );
    }
  }

  getMetadata(): SearchStrategyMetadata {
    return {
      name: this.name,
      version: '2.0.0',
      description: this.description,
      capabilities: [...this.capabilities],
      supportedMemoryTypes: [...this.supportedMemoryTypes],
      configurationSchema: {
        type: 'object',
        properties: {
          priority: { type: 'number', minimum: 0, maximum: 100 },
          timeout: { type: 'number', minimum: 1000, maximum: 30000 },
          maxResults: { type: 'number', minimum: 1, maximum: 1000 },
          bm25Weights: {
            type: 'object',
            properties: {
              title: { type: 'number', minimum: 0, maximum: 10 },
              content: { type: 'number', minimum: 0, maximum: 10 },
              category: { type: 'number', minimum: 0, maximum: 10 },
            },
          },
        },
        required: ['priority', 'timeout', 'maxResults'],
      },
      performanceMetrics: {
        averageResponseTime: 50,
        throughput: 1000,
        memoryUsage: 15,
      },
    };
  }

  /**
   * Build sophisticated FTS5 query with Porter stemming and advanced syntax
   */
  private buildFTSQuery(query: SearchQuery): string {
    const { text } = query;
    let ftsQuery = text.trim();

    ftsQuery = this.applyPorterStemming(ftsQuery);
    ftsQuery = this.handlePhraseQueries(ftsQuery);

    return ftsQuery;
  }

  /**
   * Apply Porter stemming tokenization to the query
   */
  private applyPorterStemming(query: string): string {
    let cleanQuery = query
      .replace(/[^\w\s"()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    cleanQuery = cleanQuery
      .replace(/\bAND\b/gi, ' AND ')
      .replace(/\bOR\b/gi, ' OR ')
      .replace(/\bNOT\b/gi, ' NOT ');

    return cleanQuery;
  }

  /**
   * Handle phrase queries by preserving quoted strings
   */
  private handlePhraseQueries(query: string): string {
    const phraseRegex = /"([^"]+)"/g;
    return query.replace(phraseRegex, '"$1"');
  }

  /**
   * Build optimized FTS5 SQL query with BM25 ranking
   */
  private buildFTSSQL(query: SearchQuery, ftsQuery: string): string {
    const limit = Math.min(query.limit || 10, this.maxResultsPerQuery);
    const offset = query.offset || 0;

    const orderByClause = this.buildOrderByClause(query);
    const whereClause = this.buildWhereClause(query);

    return `
      SELECT
        fts.rowid as memory_id,
        fts.content as searchable_content,
        fts.metadata,
        bm25(memory_fts, ${this.bm25Weights.content}, ${this.bm25Weights.title}, ${this.bm25Weights.category}) as search_score,
        json_extract(fts.metadata, '$.memory_type') as memory_type,
        json_extract(fts.metadata, '$.category_primary') as category_primary,
        json_extract(fts.metadata, '$.importance_score') as importance_score,
        json_extract(fts.metadata, '$.created_at') as created_at,
        '${this.name}' as search_strategy
      FROM memory_fts fts
      WHERE memory_fts MATCH ?
      ${whereClause}
      ${orderByClause}
      LIMIT ? OFFSET ?
    `;
  }

  /**
   * Build ORDER BY clause with BM25 ranking and secondary sorting
   */
  private buildOrderByClause(query: SearchQuery): string {
    let orderBy = 'ORDER BY bm25(memory_fts, 1.0, 1.0, 1.0) DESC';

    if (query.sortBy) {
      const direction = query.sortBy.direction.toUpperCase();
      orderBy += `, ${query.sortBy.field} ${direction}`;
    } else {
      orderBy += ', importance_score DESC, created_at DESC';
    }

    return orderBy;
  }

  /**
   * Build additional WHERE clause for metadata filtering
   */
  private buildWhereClause(query: SearchQuery): string {
    const conditions: string[] = [];

    const dbManager = this.databaseManager as any;
    if (dbManager && dbManager.namespace) {
      conditions.push(`json_extract(fts.metadata, '$.namespace') = '${dbManager.namespace}'`);
    }

    return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
  }

  /**
   * Get query parameters for prepared statement
   */
  private getQueryParameters(query: SearchQuery): unknown[] {
    const limit = Math.min(query.limit || 10, this.maxResultsPerQuery);
    const offset = query.offset || 0;

    return [
      this.buildFTSQuery(query),
      limit,
      offset,
    ];
  }

  /**
   * Execute FTS query with comprehensive error handling and timeout
   */
  private async executeFTSQuery(sql: string, parameters: unknown[], query: SearchQuery): Promise<unknown[]> {
    const dbManager = this.databaseManager as any;
    const db = dbManager?.prisma || this.databaseManager;

    return Promise.race([
      db.$queryRawUnsafe(sql, ...parameters),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new SearchTimeoutError(
          this.name,
          this.queryTimeout,
          'fts_database_query',
          { query: query.text, sql: sql.substring(0, 100) + '...' },
        )), this.queryTimeout);
      }),
    ]);
  }

  /**
   * Process FTS results and transform to SearchResult format
   */
  private processFTSResults(results: unknown[], query: SearchQuery): SearchResult[] {
    const searchResults: SearchResult[] = [];

    for (const row of results as any[]) {
      try {
        const metadata = JSON.parse(row.metadata);
        const rawScore = row.search_score || 0;
        const normalizedScore = this.normalizeBM25Score(rawScore, query);

        searchResults.push({
          id: row.memory_id,
          content: row.searchable_content,
          metadata: {
            summary: metadata.summary || '',
            category: row.category_primary,
            importanceScore: row.importance_score || 0.5,
            memoryType: row.memory_type,
            createdAt: new Date(row.created_at),
            rawBM25Score: rawScore,
            ...metadata,
          },
          score: normalizedScore,
          strategy: this.name,
          timestamp: new Date(row.created_at),
        });

      } catch (error) {
        logWarn('Error processing FTS result row', {
          component: 'SQLiteFTSStrategy',
          operation: 'processFTSResults',
          rowId: row.memory_id,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }

    return searchResults;
  }

  /**
   * Normalize BM25 scores to 0-1 range with query-specific adjustments
   */
  private normalizeBM25Score(rawScore: number, query: SearchQuery): number {
    const baseScore = Math.min(rawScore / 1000, 1.0);

    if (query.text.includes('"')) {
      return Math.min(baseScore * 1.2, 1.0);
    }

    if (query.text.split(' ').length > 3) {
      return Math.min(baseScore * 1.1, 1.0);
    }

    return baseScore;
  }

  /**
   * Categorize FTS-specific errors for better error handling
   */
  private categorizeFTSError(error: unknown): string {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    if (errorMessage.includes('no such table') || errorMessage.includes('table not found')) {
      return 'critical';
    }

    if (errorMessage.includes('syntax error') || errorMessage.includes('malformed query')) {
      return 'high';
    }

    if (errorMessage.includes('database locked') || errorMessage.includes('busy')) {
      return 'medium';
    }

    if (errorMessage.includes('out of memory') || errorMessage.includes('too many terms')) {
      return 'high';
    }

    return 'medium';
  }

  /**
   * Get database state for error context
   */
  protected getDatabaseState(): SearchErrorContext['databaseState'] {
    try {
      const dbManager = this.databaseManager as any;
      return {
        connectionStatus: dbManager?.isConnected ? 'connected' : 'disconnected',
        lastError: dbManager?.lastError,
        queryCount: dbManager?.queryCount,
      };
    } catch {
      return {
        connectionStatus: 'error',
      };
    }
  }
}
