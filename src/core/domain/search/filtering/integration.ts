/**
 * Integration layer for advanced filtering engine using existing SearchService architecture
 * Properly leverages the SearchFilterProcessor that's already integrated into SearchService
 */

import { FilterEngine, FilterBuilder } from './FilterEngine';
import { FilterOperator, FilterType } from './types';
import { SearchQuery, SearchResult } from '../types';
import { SearchService } from '../SearchService';
import { DatabaseManager } from '../../../infrastructure/database/DatabaseManager';
import { logInfo, logError } from '../../../infrastructure/config/Logger';

/**
 * Proper integration service that uses the existing SearchService architecture
 * Leverages the SearchFilterProcessor that's already integrated into SearchService
 */
export class SearchFilterIntegration {
  private searchService: SearchService;
  private filterEngine: FilterEngine;

  constructor(dbManager: DatabaseManager) {
    this.searchService = new SearchService(dbManager);
    this.filterEngine = new FilterEngine();

    // Initialize SearchService asynchronously
    this.initializeSearchService();
  }

  /**
   * Initialize SearchService asynchronously
   */
  private async initializeSearchService(): Promise<void> {
    try {
      await this.searchService.initializeAsync();
      logInfo('SearchFilterIntegration initialized with SearchService', {
        component: 'SearchFilterIntegration',
        operation: 'initializeSearchService'
      });
    } catch (error) {
      logError('Failed to initialize SearchService in SearchFilterIntegration', {
        component: 'SearchFilterIntegration',
        operation: 'initializeSearchService',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Search with advanced filtering using the existing SearchService architecture
   */
  async searchWithFiltering(
    query: SearchQuery,
    filterExpression?: string
  ): Promise<SearchResult[]> {
    try {
      // Use the existing SearchService which already has SearchFilterProcessor integrated
      if (filterExpression) {
        // Set filter expression on query for integrated processing
        query.filterExpression = filterExpression;
        return await this.searchService.search(query);
      }

      // Search without additional filtering
      return await this.searchService.search(query);
    } catch (error) {
      logError('Search with filtering failed', {
        component: 'SearchFilterIntegration',
        operation: 'searchWithFiltering',
        error: error instanceof Error ? error.message : String(error),
        queryText: query.text,
        hasFilterExpression: !!filterExpression
      });
      throw error;
    }
  }

  /**
   * Search using fluent API filter builder with existing SearchService
   */
  async searchWithFluentFilter(
    query: SearchQuery,
    filterBuilder: FilterBuilder
  ): Promise<SearchResult[]> {
    try {
      const filter = filterBuilder.build();

      if (filter) {
        // For fluent filters, we need to apply them in-memory since we can't easily convert back to expressions
        // This maintains compatibility while leveraging the SearchService for base search
        const baseResults = await this.searchService.search(query);

        // Apply the fluent filter in-memory using FilterEngine
        const filterResult = await this.filterEngine.executeFilter(filter, baseResults);
        return filterResult.filteredItems as SearchResult[];
      }

      return await this.searchService.search(query);
    } catch (error) {
      logError('Search with fluent filter failed', {
        component: 'SearchFilterIntegration',
        operation: 'searchWithFluentFilter',
        error: error instanceof Error ? error.message : String(error),
        queryText: query.text
      });
      throw error;
    }
  }

  /**
   * Database query with advanced filtering using FilterEngine
   */
  async searchWithDatabaseFilter(
    baseQuery: string,
    filterExpression: string
  ): Promise<{ sql: string; parameters: unknown[] }> {
    try {
      const filter = this.filterEngine.parseFilter(filterExpression);
      return await this.filterEngine.executeFilterAsQuery(filter, baseQuery);
    } catch (error) {
      logError('Database filter query generation failed', {
        component: 'SearchFilterIntegration',
        operation: 'searchWithDatabaseFilter',
        error: error instanceof Error ? error.message : String(error),
        baseQuery,
        filterExpression
      });
      throw error;
    }
  }

  /**
   * Get the underlying SearchService instance for direct access
   */
  getSearchService(): SearchService {
    return this.searchService;
  }

  /**
   * Get the FilterEngine instance for direct access
   */
  getFilterEngine(): FilterEngine {
    return this.filterEngine;
  }

  /**
   * Example filter expressions (maintained for backward compatibility)
   */
  static getExampleFilters() {
    return {
      // Simple comparison
      simple: 'category = "important"',

      // Logical combination
      logical: 'category = "important" AND created_at > "2024-01-01"',

      // Complex nested
      complex: '(category = "important" OR priority >= 8) AND age < 30',

      // String operations
      stringOps: 'content contains "urgent" AND title starts_with "RE:"',

      // Array operations
      arrayOps: 'tags in ["urgent", "review"] AND status != "completed"',

      // Numeric ranges
      numeric: 'score >= 0.8 AND importance between [0.7, 1.0]'
    };
  }

  /**
   * Example fluent filter construction (maintained for backward compatibility)
   */
  static createExampleFluentFilter(): FilterBuilder {
    return new FilterBuilder()
      .where('category', FilterOperator.EQUALS, 'important')
      .and(
        new FilterBuilder()
          .where('priority', FilterOperator.GREATER_EQUAL, 8)
      )
      .and(
        new FilterBuilder()
          .where('status', FilterOperator.NOT_EQUALS, 'archived')
      );
  }
}

/**
 * Usage examples for the filtering engine
 */
export class FilteringExamples {
  private filterEngine: FilterEngine;

  constructor() {
    this.filterEngine = new FilterEngine();
  }

  /**
   * Example 1: Parse and execute filter expression
   */
  async example1() {
    const data = [
      { name: 'Alice', age: 25, city: 'New York' },
      { name: 'Bob', age: 30, city: 'San Francisco' },
      { name: 'Charlie', age: 35, city: 'New York' }
    ];

    const filterExpression = 'city = "New York" AND age >= 25';
    const result = await this.filterEngine.parseAndExecute(filterExpression, data);

    logInfo('Filter execution completed', {
      component: 'FilteringExamples',
      operation: 'example1',
      resultCount: result.filteredItems.length
    });
  }

  /**
   * Example 2: Using fluent API
   */
  async example2() {
    const data = [
      { product: 'Laptop', price: 1000, category: 'electronics' },
      { product: 'Book', price: 20, category: 'education' },
      { product: 'Phone', price: 800, category: 'electronics' }
    ];

    const filter = this.filterEngine.createBuilder()
      .where('category', FilterOperator.EQUALS, 'electronics')
      .and(
        this.filterEngine.createBuilder()
          .where('price', FilterOperator.LESS_THAN, 1500)
      )
      .build();

    if (filter) {
      const result = await this.filterEngine.executeFilter(filter, data);
      logInfo('Filter execution completed', {
        component: 'FilteringExamples',
        operation: 'example2',
        resultCount: result.filteredItems.length
      });
    }
  }

  /**
   * Example 3: Database query generation
   */
  async example3() {
    const baseQuery = 'SELECT * FROM memories';
    const filterExpression = 'category = "important" AND created_at > "2024-01-01"';

    const queryResult = await this.filterEngine.executeFilterAsQuery(
      this.filterEngine.parseFilter(filterExpression),
      baseQuery
    );

    logInfo('Database query generation completed', {
      component: 'FilteringExamples',
      operation: 'example3',
      sql: queryResult.sql,
      parameterCount: queryResult.parameters.length
    });
  }

  /**
   * Example 4: Filter validation
   */
  async example4() {
    const filterExpression = 'invalid_field = "value"';

    try {
      const filter = this.filterEngine.parseFilter(filterExpression);
      const validation = this.filterEngine.validateFilter(filter);

      if (!validation.isValid) {
        logInfo('Filter validation completed with errors', {
          component: 'FilteringExamples',
          operation: 'example4',
          errorCount: validation.errors.length
        });
      }
    } catch (error) {
      logError('Filter parsing failed', {
        component: 'FilteringExamples',
        operation: 'example4',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}