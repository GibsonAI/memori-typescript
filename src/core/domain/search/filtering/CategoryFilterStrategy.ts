import { BaseSearchStrategy } from '../strategies/BaseSearchStrategy';
import { SearchStrategy, SearchQuery, SearchResult, DatabaseQueryResult } from '../types';
import { SearchCapability, SearchStrategyConfig, SearchStrategyMetadata, SearchErrorCategory } from '../SearchStrategy';
import { DatabaseManager } from '../../../infrastructure/database/DatabaseManager';
import { logWarn } from '../../../infrastructure/config/Logger';
import { sanitizeString, SANITIZATION_LIMITS } from '../../../infrastructure/config/SanitizationUtils';

interface CategoryFilterQuery extends SearchQuery {
  categories?: string[];
  categoryHierarchy?: string[];
  categoryOperator?: 'AND' | 'OR' | 'HIERARCHY';
  enableRelevanceBoost?: boolean;
  enableAggregation?: boolean;
  minCategoryRelevance?: number;
  maxCategories?: number;
}

export interface CategoryFilterStrategyOptions {
  hierarchy: {
    maxDepth: number;
    enableCaching: boolean;
  };
  performance: {
    enableQueryOptimization: boolean;
    enableResultCaching: boolean;
    maxExecutionTime: number;
    batchSize: number;
  };
}

type StrategySpecificConfig = Partial<CategoryFilterStrategyOptions>;

interface NormalizedCategoryQuery extends CategoryFilterQuery {
  text: string;
  categories?: string[];
  categoryHierarchy?: string[];
}

const DEFAULT_OPTIONS: CategoryFilterStrategyOptions = {
  hierarchy: {
    maxDepth: 5,
    enableCaching: true,
  },
  performance: {
    enableQueryOptimization: true,
    enableResultCaching: true,
    maxExecutionTime: 10000,
    batchSize: 100,
  },
};

/**
 * Specialized strategy for category-based search operations with hierarchy support,
 * relevance scoring, and result aggregation.
 */
export class CategoryFilterStrategy extends BaseSearchStrategy {
  readonly name = SearchStrategy.CATEGORY_FILTER;
  readonly description = 'Category-based filtering with hierarchy support';
  readonly capabilities = [
    SearchCapability.CATEGORIZATION,
    SearchCapability.FILTERING,
    SearchCapability.RELEVANCE_SCORING,
  ] as const;
  readonly priority = 10;
  readonly supportedMemoryTypes = ['short_term', 'long_term'] as const;

  private readonly options: CategoryFilterStrategyOptions;

  constructor(config: SearchStrategyConfig, databaseManager: DatabaseManager) {
    super(config, databaseManager);
    this.options = this.mergeOptions(config.strategySpecific as StrategySpecificConfig | undefined);
  }

  canHandle(query: SearchQuery): boolean {
    return this.hasCategoryFilters(query) || (typeof query.text === 'string' && query.text.trim().length > 0);
  }

  protected getCapabilities(): readonly SearchCapability[] {
    return this.capabilities;
  }

  protected async executeSearch(query: SearchQuery): Promise<SearchResult[]> {
    try {
      const normalizedQuery = this.normalizeQuery(query);
      const categoryQuery = this.buildCategoryQuery(normalizedQuery);
      const sql = this.buildCategorySQL(normalizedQuery, categoryQuery);
      const rows = await this.executeCategoryQuery(sql);
      return this.processCategoryResults(rows, normalizedQuery);
    } catch (error) {
      throw this.handleSearchError(
        error,
        'category_search',
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
              hierarchy: {
                type: 'object',
                properties: {
                  maxDepth: { type: 'number', minimum: 1, maximum: 20 },
                  enableCaching: { type: 'boolean' },
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
        averageResponseTime: 120,
        throughput: 400,
        memoryUsage: 10,
      },
    };
  }

  protected validateStrategyConfiguration(): boolean {
    if (this.options.hierarchy.maxDepth < 1 || this.options.hierarchy.maxDepth > 20) {
      return false;
    }

    if (this.options.performance.batchSize < 10 || this.options.performance.batchSize > 5000) {
      return false;
    }

    if (
      this.options.performance.maxExecutionTime < 1000 ||
      this.options.performance.maxExecutionTime > 60000
    ) {
      return false;
    }

    return true;
  }

  private mergeOptions(strategySpecific?: StrategySpecificConfig): CategoryFilterStrategyOptions {
    if (!strategySpecific) {
      return DEFAULT_OPTIONS;
    }

    return {
      hierarchy: {
        ...DEFAULT_OPTIONS.hierarchy,
        ...strategySpecific.hierarchy,
      },
      performance: {
        ...DEFAULT_OPTIONS.performance,
        ...strategySpecific.performance,
      },
    };
  }

  private normalizeQuery(query: SearchQuery): NormalizedCategoryQuery {
    const categoryQuery = query as CategoryFilterQuery;
    const normalized: NormalizedCategoryQuery = {
      ...categoryQuery,
      text: this.sanitizeSearchText(categoryQuery.text ?? ''),
    };

    if (Array.isArray(categoryQuery.categories)) {
      normalized.categories = categoryQuery.categories
        .map((category, index) => this.sanitizeCategory(category, `category_${index}`))
        .filter((category): category is string => Boolean(category));
    }

    if (Array.isArray(categoryQuery.categoryHierarchy)) {
      normalized.categoryHierarchy = categoryQuery.categoryHierarchy
        .map((category, index) => this.sanitizeCategory(category, `category_hierarchy_${index}`))
        .filter((category): category is string => Boolean(category));
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

  private sanitizeCategory(value: unknown, fieldName: string): string | undefined {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }

    try {
      return sanitizeString(value, {
        fieldName,
        allowNewlines: false,
        maxLength: 100,
      });
    } catch (error) {
      logWarn('Invalid category value filtered', {
        component: 'CategoryFilterStrategy',
        operation: 'sanitizeCategory',
        fieldName,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private hasCategoryFilters(query: SearchQuery): boolean {
    const categoryQuery = query as CategoryFilterQuery;
    return Boolean(
      (categoryQuery.categories && categoryQuery.categories.length > 0) ||
      (categoryQuery.categoryHierarchy && categoryQuery.categoryHierarchy.length > 0),
    );
  }

  private buildCategoryQuery(query: NormalizedCategoryQuery): string {
    const parts: string[] = [];

    if (query.text) {
      parts.push(query.text);
    }

    if (query.categories && query.categories.length > 0) {
      parts.push(query.categories.join(' '));
    }

    return parts.join(' ').trim();
  }

  private buildCategorySQL(query: NormalizedCategoryQuery, categoryQuery: string): string {
    const limit = Math.min(query.limit ?? this.config.maxResults, this.config.maxResults);
    const offset = Math.max(0, query.offset ?? 0);
    const whereClause = this.buildCategoryWhereClause(query, categoryQuery);
    const orderByClause = this.buildCategoryOrderByClause(query);

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
        WHERE ${whereClause}

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
        WHERE ${whereClause}
      ) AS combined_memories
      ${orderByClause}
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  private buildCategoryWhereClause(query: NormalizedCategoryQuery, categoryQuery: string): string {
    const conditions: string[] = [];

    if (categoryQuery) {
      const ftsQuery = this.buildFTSQuery(categoryQuery);
      conditions.push(`(searchableContent MATCH '${ftsQuery}' OR summary MATCH '${ftsQuery}')`);
    }

    if (query.categories && query.categories.length > 0) {
      const categoryList = query.categories
        .map(category => `'${this.escapeSqlString(category)}'`)
        .join(', ');
      conditions.push(`categoryPrimary IN (${categoryList})`);
    }

    if (query.categoryHierarchy && query.categoryHierarchy.length > 0) {
      const hierarchyConditions = query.categoryHierarchy.map(category =>
        `json_extract(processedData, '$.category_primary') LIKE '${this.escapeSqlString(category)}%'`,
      );
      conditions.push(`(${hierarchyConditions.join(' OR ')})`);
    }

    return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  }

  private buildCategoryOrderByClause(query: NormalizedCategoryQuery): string {
    const orderClauses: string[] = [];

    if (query.categories && query.categories.length > 0) {
      const categoryList = query.categories
        .map(category => `'${this.escapeSqlString(category)}'`)
        .join(', ');

      orderClauses.push(`
        CASE
          WHEN categoryPrimary IN (${categoryList}) THEN 1.5
          ELSE 1.0
        END * importance_score DESC
      `);
    } else {
      orderClauses.push('importance_score DESC');
    }

    orderClauses.push('created_at DESC');

    return `ORDER BY ${orderClauses.join(', ')}`;
  }

  private buildFTSQuery(text: string): string {
    if (!text || text.trim() === '') {
      return '*';
    }

    const cleanQuery = this.escapeSqlString(text.replace(/\*/g, ''));
    const terms = cleanQuery.split(/\s+/);

    if (terms.length === 1) {
      return `"${terms[0]}"`;
    }

    return terms.map(term => `"${term}"`).join(' OR ');
  }

  private async executeCategoryQuery(sql: string): Promise<unknown[]> {
    try {
      const prisma = this.databaseManager.getPrismaClient();
      return await prisma.$queryRawUnsafe<unknown[]>(sql);
    } catch (error) {
      throw this.handleDatabaseError(error, 'execute_category_query', sql.substring(0, 200));
    }
  }

  private processCategoryResults(results: unknown[], query: NormalizedCategoryQuery): SearchResult[] {
    const processed: SearchResult[] = [];

    for (const rawRow of results) {
      const row = rawRow as Partial<DatabaseQueryResult>;

      try {
        if (!row.memory_id) {
          throw new Error('Missing memory_id in category filter result');
        }

        const id = row.memory_id;
        const content = row.searchable_content ?? '';
        const summary = row.summary ?? '';
        const categoryPrimary = row.category_primary ?? '';
        const importanceScore = row.importance_score ?? 0.5;
        const memoryType = row.memory_type ?? 'long_term';
        const createdAt = new Date(row.created_at ?? new Date().toISOString());
        const rawMetadata = this.parseMetadata(row.metadata ?? '{}');

        const relevance = this.calculateCategoryRelevance({
          searchable_content: content,
          summary,
          memory_type: memoryType,
          category_primary: categoryPrimary,
          importance_score: importanceScore,
          created_at: createdAt,
        }, query);

        processed.push({
          id,
          content,
          metadata: query.includeMetadata ? {
            summary,
            category: categoryPrimary,
            importanceScore,
            memoryType,
            createdAt,
            ...rawMetadata,
          } : {},
          score: relevance,
          strategy: this.name,
          timestamp: createdAt,
        });
      } catch (error) {
        logWarn('Failed to process category result row', {
          component: 'CategoryFilterStrategy',
          operation: 'process_results',
          error: error instanceof Error ? error.message : String(error),
          rowId: row?.memory_id,
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
      logWarn('Failed to parse category metadata', {
        component: 'CategoryFilterStrategy',
        operation: 'parse_metadata',
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private calculateCategoryRelevance(
    row: {
      searchable_content: string;
      summary: string;
      category_primary: string;
      importance_score: number;
      memory_type: string;
      created_at: Date;
    },
    query: NormalizedCategoryQuery,
  ): number {
    let relevance = 0.3;

    if (query.categories?.includes(row.category_primary)) {
      relevance += 0.4;
    }

    if (query.categoryHierarchy?.some(hierarchy => row.category_primary.startsWith(hierarchy))) {
      relevance += 0.3;
    }

    if (query.text) {
      const content = row.searchable_content.toLowerCase();
      const summary = row.summary.toLowerCase();
      const searchText = query.text.toLowerCase();

      if (content.includes(searchText) || summary.includes(searchText)) {
        relevance += 0.2;
      }
    }

    const importance = row.importance_score ?? 0.5;
    relevance *= (0.5 + importance);

    if (row.memory_type === 'short_term') {
      relevance *= 1.05;
    }

    return Math.max(0, Math.min(1, relevance));
  }

  private escapeSqlString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, '\'\'');
  }
}
