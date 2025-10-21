/**
 * MetadataFilterStrategy - Comprehensive metadata field filtering
 *
 * Provides advanced metadata search with validation, aggregation, and caching
 * while leveraging the shared BaseSearchStrategy infrastructure for
 * sanitisation, metrics, and error handling.
 */

import { SearchQuery, SearchResult, SearchStrategy } from '../types';
import {
  SearchStrategyConfig,
  SearchStrategyMetadata,
  SearchCapability,
} from '../SearchStrategy';
import { BaseSearchStrategy } from '../strategies/BaseSearchStrategy';
import { DatabaseManager } from '../../../infrastructure/database/DatabaseManager';
import { logError, logWarn, logInfo } from '../../../infrastructure/config/Logger';

interface MetadataFilterQuery extends SearchQuery {
  metadataFilters?: {
    fields?: MetadataField[];
    aggregation?: MetadataAggregation;
    validation?: MetadataValidation;
  };
  metadataOptions?: {
    includeNested?: boolean;
    enableTypeChecking?: boolean;
    enableAggregation?: boolean;
    maxFieldDepth?: number;
  };
}

export interface MetadataField {
  key: string;
  value: unknown;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'exists' | 'type';
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
}

export interface MetadataAggregation {
  enabled: boolean;
  groupBy?: string[];
  aggregations?: {
    count?: boolean;
    distinct?: string[];
    min?: string[];
    max?: string[];
    avg?: string[];
  };
  having?: MetadataField[];
}

export interface MetadataValidation {
  strict: boolean;
  requiredFields?: string[];
  fieldTypes?: Record<string, string>;
  customValidators?: Array<{
    field: string;
    validator: (value: unknown) => boolean;
    message: string;
  }>;
}

export type MetadataFilterStrategyConfig = MetadataFilterStrategyOptions;

interface MetadataFilterStrategyOptions {
  fields: {
    enableNestedAccess: boolean;
    maxDepth: number;
    enableTypeValidation: boolean;
    enableFieldDiscovery: boolean;
  };
  aggregation: {
    enableAggregation: boolean;
    maxGroupFields: number;
    enableComplexAggregation: boolean;
  };
  validation: {
    strictValidation: boolean;
    enableCustomValidators: boolean;
    failOnInvalidMetadata: boolean;
  };
  performance: {
    enableQueryOptimization: boolean;
    enableResultCaching: boolean;
    maxExecutionTime: number;
    batchSize: number;
    cacheSize: number;
  };
}

interface MetadataQuery {
  fields: MetadataField[];
  aggregation?: MetadataAggregation;
  validation?: MetadataValidation;
  options: MetadataFilterQuery['metadataOptions'];
}

const DEFAULT_OPTIONS: MetadataFilterStrategyOptions = {
  fields: {
    enableNestedAccess: true,
    maxDepth: 5,
    enableTypeValidation: true,
    enableFieldDiscovery: true,
  },
  aggregation: {
    enableAggregation: false,
    maxGroupFields: 3,
    enableComplexAggregation: true,
  },
  validation: {
    strictValidation: false,
    enableCustomValidators: true,
    failOnInvalidMetadata: false,
  },
  performance: {
    enableQueryOptimization: true,
    enableResultCaching: false,
    maxExecutionTime: 10000,
    batchSize: 100,
    cacheSize: 100,
  },
};

export class MetadataFilterStrategy extends BaseSearchStrategy {
  readonly name = SearchStrategy.METADATA_FILTER;
  readonly priority = 9;
  readonly supportedMemoryTypes = ['short_term', 'long_term'] as const;
  readonly description = 'Comprehensive metadata field filtering with validation and aggregation';
  readonly capabilities = [
    SearchCapability.FILTERING,
    SearchCapability.RELEVANCE_SCORING,
  ] as const;

  private readonly options: MetadataFilterStrategyOptions;
  private readonly cache = new Map<string, { result: SearchResult[]; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: SearchStrategyConfig, databaseManager: DatabaseManager) {
    super(config, databaseManager);
    this.options = this.mergeOptions(config.strategySpecific as Partial<MetadataFilterStrategyOptions> | undefined);
  }

  canHandle(query: SearchQuery): boolean {
    return this.hasMetadataFilters(query) || this.containsMetadataPatterns(query.text ?? '');
  }

  protected getCapabilities(): readonly SearchCapability[] {
    return this.capabilities;
  }

  protected async executeSearch(query: SearchQuery): Promise<SearchResult[]> {
    const cacheKey = this.generateCacheKey(query);

    if (this.options.performance.enableResultCaching) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp <= this.CACHE_TTL) {
        return cached.result;
      }
    }

    const metadataQuery = this.parseMetadataQuery(query);
    const sql = this.buildMetadataSQL(query, metadataQuery);
    const rows = await this.executeMetadataQuery(sql, this.getQueryParameters(query, metadataQuery));
    let results = this.processMetadataResults(rows, query, metadataQuery);

    if (this.shouldApplyAggregation(query)) {
      results = await this.applyMetadataAggregation(results, query);
    }

    if (this.options.performance.enableResultCaching) {
      this.cacheResult(cacheKey, results);
    }

    return results;
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
              fields: { type: 'object' },
              aggregation: { type: 'object' },
              validation: { type: 'object' },
              performance: { type: 'object' },
            },
          },
        },
        required: ['priority', 'timeout'],
      },
      performanceMetrics: {
        averageResponseTime: 180,
        throughput: 250,
        memoryUsage: 12,
      },
    };
  }

  protected validateStrategyConfiguration(): boolean {
    if (this.options.fields.maxDepth < 1 || this.options.fields.maxDepth > 20) {
      return false;
    }

    if (this.options.performance.batchSize < 10 || this.options.performance.batchSize > 5000) {
      return false;
    }

    if (this.options.performance.maxExecutionTime < 1000 || this.options.performance.maxExecutionTime > 60000) {
      return false;
    }

    return true;
  }

  private mergeOptions(strategySpecific?: Partial<MetadataFilterStrategyOptions>): MetadataFilterStrategyOptions {
    if (!strategySpecific) {
      return DEFAULT_OPTIONS;
    }

    return {
      fields: {
        ...DEFAULT_OPTIONS.fields,
        ...strategySpecific.fields,
      },
      aggregation: {
        ...DEFAULT_OPTIONS.aggregation,
        ...strategySpecific.aggregation,
      },
      validation: {
        ...DEFAULT_OPTIONS.validation,
        ...strategySpecific.validation,
      },
      performance: {
        ...DEFAULT_OPTIONS.performance,
        ...strategySpecific.performance,
      },
    };
  }

  private hasMetadataFilters(query: SearchQuery): boolean {
    const metadataQuery = query as MetadataFilterQuery;
    return Boolean(metadataQuery.metadataFilters?.fields?.length);
  }

  private containsMetadataPatterns(text: string): boolean {
    if (!text || !this.options.fields.enableFieldDiscovery) {
      return false;
    }

    const metadataPatterns = [
      /\b(metadata|meta)\s*[=:]\s*[\w{]/i,
      /\b(field|property)\s*[=:]\s*\w+/i,
      /\b(key|value)\s*[=:]\s*[\w"']/i,
      /\bjson_extract\s*\(/i,
      /\$[\.\w]+/
    ];

    return metadataPatterns.some(pattern => pattern.test(text));
  }

  private parseMetadataQuery(query: SearchQuery): MetadataQuery {
    const metadataQuery = query as MetadataFilterQuery;
    const fields: MetadataField[] = [];

    if (metadataQuery.metadataFilters?.fields) {
      fields.push(
        ...metadataQuery.metadataFilters.fields
          .map(field => this.sanitizeMetadataField(field))
          .filter((field): field is MetadataField => Boolean(field)),
      );
    }

    if (query.text && this.options.fields.enableFieldDiscovery) {
      const parsedFields = this.parseMetadataFromText(query.text);
      fields.push(...parsedFields);
    }

    return {
      fields,
      aggregation: metadataQuery.metadataFilters?.aggregation,
      validation: metadataQuery.metadataFilters?.validation,
      options: metadataQuery.metadataOptions || {},
    };
  }

  private sanitizeMetadataField(field: MetadataField): MetadataField | null {
    const sanitizedKey = this.sanitizeFieldKey(field.key);
    if (!sanitizedKey) {
      return null;
    }

    return {
      ...field,
      key: sanitizedKey,
    };
  }

  private sanitizeFieldKey(key: string): string | null {
    if (typeof key !== 'string' || key.length === 0) {
      return null;
    }

    const sanitized = key.replace(/[^a-zA-Z0-9_.]/g, '');
    if (!sanitized) {
      return null;
    }

    if (!this.options.fields.enableNestedAccess && sanitized.includes('.')) {
      return sanitized.split('.')[0];
    }

    return sanitized;
  }

  private parseMetadataFromText(text: string): MetadataField[] {
    const fields: MetadataField[] = [];

    const metadataPattern = /(?:metadata|meta)\s*\.\s*(\w+)\s*[=:]\s*["']?([^"'\s]+)["']?/gi;
    let match;

    while ((match = metadataPattern.exec(text)) !== null) {
      const key = this.sanitizeFieldKey(match[1]);
      if (!key) continue;

      fields.push({
        key,
        value: match[2],
        operator: 'eq',
        type: this.inferFieldType(match[2])
      });
    }

    const fieldPattern = /(?:field|property)\s*[=:]\s*(\w+)/gi;
    while ((match = fieldPattern.exec(text)) !== null) {
      const sanitizedKey = this.sanitizeFieldKey(match[1]);
      if (!sanitizedKey) {
        continue;
      }

      const keyValuePattern = new RegExp(`\\b${sanitizedKey}\\s*[=:]\\s*["']?([^"'\\s]+)["']?`, 'gi');
      const keyMatch = keyValuePattern.exec(text);
      if (keyMatch) {
        fields.push({
          key: sanitizedKey,
          value: keyMatch[1],
          operator: 'eq',
          type: this.inferFieldType(keyMatch[1])
        });
      }
    }

    return fields;
  }

  private inferFieldType(value: string): MetadataField['type'] {
    if (value === 'true' || value === 'false') return 'boolean';
    if (!Number.isNaN(Number(value))) return 'number';
    if (value.startsWith('[') && value.endsWith(']')) return 'array';
    if (value.startsWith('{') && value.endsWith('}')) return 'object';
    return 'string';
  }

  private buildMetadataSQL(query: SearchQuery, metadataQuery: MetadataQuery): string {
    const limit = Math.min(query.limit ?? this.config.maxResults, this.config.maxResults);
    const offset = Math.max(0, query.offset ?? 0);
    const whereClause = this.buildMetadataWhereClause(query, metadataQuery);
    const orderByClause = this.buildMetadataOrderByClause(query, metadataQuery);

    return `
      SELECT
        id AS memory_id,
        searchableContent AS searchable_content,
        summary,
        processedData AS metadata,
        retentionType AS memory_type,
        categoryPrimary AS category_primary,
        importanceScore AS importance_score,
        createdAt AS created_at,
        '${this.name}' as search_strategy,
        ${this.buildMetadataRelevanceCalculation(metadataQuery)} as metadata_relevance_score
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
      ) AS metadata_memories
      ${orderByClause}
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  private buildMetadataWhereClause(query: SearchQuery, metadataQuery: MetadataQuery): string {
    const conditions: string[] = [];

    const namespace = (this.databaseManager as unknown as { currentNamespace?: string }).currentNamespace;
    if (namespace) {
      conditions.push(`json_extract(metadata, '$.namespace') = '${this.escapeSqlString(namespace)}'`);
    }

    if (query.text && query.text.trim()) {
      conditions.push(this.buildTextSearchCondition(query.text));
    }

    const metadataConditions = metadataQuery.fields
      .map(field => this.buildMetadataFieldCondition(field))
      .filter((condition): condition is string => Boolean(condition));

    if (metadataConditions.length > 0) {
      conditions.push(`(${metadataConditions.join(' AND ')})`);
    }

    return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  }

  private buildMetadataFieldCondition(field: MetadataField): string | null {
    const { key, value, operator, type } = field;

    if (!this.validateMetadataField(key, type)) {
      return null;
    }

    const jsonPath = this.options.fields.enableNestedAccess ?
      `$.${key.replace(/\./g, '.$.')}` : `$.${key}`;

    switch (operator) {
      case 'eq':
        return `json_extract(metadata, '${jsonPath}') = '${this.escapeSqlString(String(value))}'`;
      case 'ne':
        return `json_extract(metadata, '${jsonPath}') != '${this.escapeSqlString(String(value))}'`;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        if (type === 'number') {
          const numValue = Number(value);
          const op = operator === 'gt' ? '>' : operator === 'gte' ? '>=' :
            operator === 'lt' ? '<' : '<=';
          return `CAST(json_extract(metadata, '${jsonPath}') AS REAL) ${op} ${numValue}`;
        }
        return null;
      case 'contains':
        return `json_extract(metadata, '${jsonPath}') LIKE '%${this.escapeSqlString(String(value))}%'`;
      case 'in':
        if (Array.isArray(value)) {
          const values = value.map(v => `'${this.escapeSqlString(String(v))}'`).join(', ');
          return `json_extract(metadata, '${jsonPath}') IN (${values})`;
        }
        return null;
      case 'exists':
        return `json_extract(metadata, '${jsonPath}') IS NOT NULL`;
      case 'type':
        return `json_type(metadata, '${jsonPath}') = '${value}'`;
      default:
        return null;
    }
  }

  private buildTextSearchCondition(searchText: string): string {
    const terms = searchText.split(/\s+/).filter(term => term.length > 0);
    if (terms.length === 0) {
      return '1=1';
    }

    const conditions = terms.map(term => {
      const escapedTerm = this.escapeSqlString(term);
      return `(
        searchableContent LIKE '%${escapedTerm}%' ESCAPE '\\' OR
        summary LIKE '%${escapedTerm}%' ESCAPE '\\'
      )`;
    });

    return `(${conditions.join(' OR ')})`;
  }

  private buildMetadataRelevanceCalculation(metadataQuery: MetadataQuery): string {
    let calculation = '0.5';

    if (metadataQuery.fields.length > 0) {
      const boosts = metadataQuery.fields.map(field => {
        const jsonPath = this.options.fields.enableNestedAccess ?
          `$.${field.key.replace(/\./g, '.$.')}` : `$.${field.key}`;

        return `CASE WHEN json_extract(processedData, '${jsonPath}') IS NOT NULL THEN 0.2 ELSE 0.0 END`;
      });

      calculation = `(${calculation} + ${boosts.join(' + ')})`;
    }

    return calculation;
  }

  private buildMetadataOrderByClause(query: SearchQuery, _metadataQuery: MetadataQuery): string {
    const parts = ['metadata_relevance_score DESC'];

    if (query.sortBy) {
      const direction = query.sortBy.direction === 'asc' ? 'ASC' : 'DESC';
      parts.push(`${query.sortBy.field} ${direction}`);
    } else {
      parts.push('importance_score DESC', 'created_at DESC');
    }

    return `ORDER BY ${parts.join(', ')}`;
  }

  private getQueryParameters(_query: SearchQuery, _metadataQuery: MetadataQuery): unknown[] {
    return [];
  }

  private async executeMetadataQuery(sql: string, parameters: unknown[]): Promise<unknown[]> {
    try {
      const prisma = this.databaseManager.getPrismaClient();
      const result = await prisma.$queryRawUnsafe(sql, ...parameters);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      throw this.handleDatabaseError(error, 'execute_metadata_query', sql.substring(0, 200));
    }
  }

  private processMetadataResults(
    results: unknown[],
    query: SearchQuery,
    metadataQuery: MetadataQuery
  ): SearchResult[] {
    const processed: SearchResult[] = [];

    for (const rawRow of results) {
      const row = rawRow as Record<string, unknown>;

      try {
        const id = String(row.memory_id ?? row.id ?? '');
        if (!id) {
          throw new Error('Missing memory identifier');
        }

        const content = String(row.searchable_content ?? row.searchableContent ?? '');
        const summary = String(row.summary ?? '');
        const metadataJson = String(row.metadata ?? row.processedData ?? '{}');
        const metadata = this.extractMetadata(metadataJson);

        if (metadataQuery.validation && !this.validateMetadata(metadata, metadataQuery.validation).isValid) {
          continue;
        }

        const relevance = this.calculateMetadataRelevance(
          this.extractMetadataFields(metadata),
          metadataQuery,
          query,
        );

        processed.push({
          id,
          content,
          metadata: {
            summary,
            category: row.category_primary,
            importanceScore: row.importance_score,
            ...metadata,
          },
          score: Math.max(0, Math.min(1, relevance)),
          strategy: this.name,
          timestamp: new Date(String(row.created_at ?? Date.now())),
        });
      } catch (error) {
        logWarn('Failed to process metadata result row', {
          component: 'MetadataFilterStrategy',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return processed;
  }

  private shouldApplyAggregation(query: SearchQuery): boolean {
    const metadataQuery = query as MetadataFilterQuery;

    return Boolean(
      (metadataQuery.metadataFilters?.aggregation?.enabled && this.options.aggregation.enableAggregation) ||
      metadataQuery.metadataOptions?.enableAggregation,
    );
  }

  private async applyMetadataAggregation(
    results: SearchResult[],
    query: SearchQuery
  ): Promise<SearchResult[]> {
    const metadataQuery = query as MetadataFilterQuery;
    const aggregation = metadataQuery.metadataFilters?.aggregation;

    if (!aggregation || !aggregation.enabled) {
      return results;
    }

    if (!aggregation.groupBy || aggregation.groupBy.length === 0) {
      return results;
    }

    const groups = this.groupResultsByFields(results, aggregation.groupBy);
    return Array.from(groups.entries()).map(([groupKey, groupResults]) =>
      this.createAggregatedResult(groupKey, groupResults, aggregation),
    );
  }

  private extractMetadata(metadataJson: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(metadataJson);
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
    } catch (error) {
      logWarn('Failed to parse metadata JSON', {
        component: 'MetadataFilterStrategy',
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private extractMetadataFields(metadata: Record<string, unknown>): MetadataField[] {
    const fields: MetadataField[] = [];

    const extractFields = (obj: Record<string, unknown>, path: string[] = []) => {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = [...path, key];
        const fieldKey = fullPath.join('.');

        fields.push({
          key: fieldKey,
          value,
          operator: 'exists',
          type: this.inferFieldType(String(value)),
        });

        if (value && typeof value === 'object' && !Array.isArray(value) && path.length < this.options.fields.maxDepth) {
          extractFields(value as Record<string, unknown>, fullPath);
        }
      }
    };

    extractFields(metadata);
    return fields;
  }

  private validateMetadataField(fieldName: string, expectedType?: string): boolean {
    if (!fieldName) {
      return false;
    }

    if (expectedType && this.options.fields.enableTypeValidation) {
      // Additional type validation can be implemented as needed
    }

    return true;
  }

  private validateMetadata(
    metadata: Record<string, unknown>,
    validation: MetadataValidation
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (validation.requiredFields) {
      for (const requiredField of validation.requiredFields) {
        if (!(requiredField in metadata)) {
          errors.push(`Required field '${requiredField}' is missing`);
        }
      }
    }

    if (validation.fieldTypes) {
      for (const [field, expectedType] of Object.entries(validation.fieldTypes)) {
        const value = metadata[field];
        if (value !== undefined) {
          const actualType = this.inferFieldType(String(value));
          if (actualType !== expectedType) {
            errors.push(`Field '${field}' has type '${actualType}', expected '${expectedType}'`);
          }
        }
      }
    }

    if (validation.customValidators && this.options.validation.enableCustomValidators) {
      for (const validator of validation.customValidators) {
        const value = metadata[validator.field];
        if (!validator.validator(value)) {
          errors.push(`Custom validation failed for '${validator.field}': ${validator.message}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private calculateMetadataRelevance(
    extractedFields: MetadataField[],
    metadataQuery: MetadataQuery,
    query: SearchQuery,
  ): number {
    let relevance = 0.3;

    const matchedFields = extractedFields.filter(field =>
      metadataQuery.fields.some(queryField =>
        queryField.key === field.key &&
        this.compareMetadataValues(field.value, queryField.value, queryField.operator),
      ),
    );

    if (matchedFields.length > 0) {
      relevance += matchedFields.length * 0.2;
    }

    return Math.max(0, Math.min(1, relevance));
  }

  private compareMetadataValues(value: unknown, filterValue: unknown, operator: string): boolean {
    switch (operator) {
      case 'eq':
        return value == filterValue;
      case 'ne':
        return value != filterValue;
      case 'contains':
        return String(value).includes(String(filterValue));
      case 'in':
        return Array.isArray(filterValue) && filterValue.includes(value);
      case 'exists':
        return value !== null && value !== undefined;
      default:
        return false;
    }
  }

  private cacheResult(cacheKey: string, results: SearchResult[]): void {
    this.cache.set(cacheKey, { result: results, timestamp: Date.now() });

    if (this.cache.size > this.options.performance.cacheSize) {
      const oldestKey = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0]?.[0];
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cleanupCache();
  }

  private generateCacheKey(query: SearchQuery): string {
    const metadataQuery = query as MetadataFilterQuery;
    return JSON.stringify({
      text: query.text,
      metadataFilters: metadataQuery.metadataFilters,
      limit: query.limit,
      offset: query.offset,
    });
  }

  private escapeSqlString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "''");
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }

  private groupResultsByFields(results: SearchResult[], groupBy: string[]): Map<string, SearchResult[]> {
    const groups = new Map<string, SearchResult[]>();

    for (const result of results) {
      const metadata = result.metadata ?? {};
      const keyParts = groupBy.map(field => {
        const value = this.getNestedMetadataValue(metadata, field);
        return `${field}:${value ?? 'unknown'}`;
      });

      const groupKey = keyParts.join('|');
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }

      groups.get(groupKey)!.push(result);
    }

    return groups;
  }

  private createAggregatedResult(
    groupKey: string,
    groupResults: SearchResult[],
    aggregation: MetadataAggregation,
  ): SearchResult {
    const scoreTotal = groupResults.reduce((total, result) => total + result.score, 0);
    const averageScore = groupResults.length > 0 ? scoreTotal / groupResults.length : 0;

    return {
      id: `metadata_group_${groupKey}`,
      content: `Metadata group ${groupKey}`,
      metadata: {
        aggregated: true,
        groupKey,
        statistics: {
          count: groupResults.length,
          averageScore,
        },
        aggregation,
      },
      score: Math.max(0, Math.min(1, averageScore)),
      strategy: this.name,
      timestamp: new Date(),
    };
  }

  private getNestedMetadataValue(metadata: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, metadata);
  }
}
