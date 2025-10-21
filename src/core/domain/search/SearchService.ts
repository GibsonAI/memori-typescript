import { SearchStrategy, SearchQuery, SearchResult, ISearchStrategy, ISearchService, StrategyNotFoundError, SearchStrategyConfig } from './types';
import { SearchError, SearchValidationError, SearchErrorCategory, SearchStrategyError, SearchTimeoutError } from './SearchStrategy';
import { SearchIndexManager } from './SearchIndexManager';
import { LikeSearchStrategy } from './LikeSearchStrategy';
import { RecentMemoriesStrategy } from './RecentMemoriesStrategy';
import { RelationshipSearchStrategy } from './strategies/RelationshipSearchStrategy';
import { SQLiteFTSStrategy } from './strategies/SQLiteFTSStrategy';
import { SemanticSearchStrategy } from './strategies/SemanticSearchStrategy';
import { CategoryFilterStrategy } from './filtering/CategoryFilterStrategy';
import { TemporalFilterStrategy } from './filtering/TemporalFilterStrategy';
import { MetadataFilterStrategy } from './filtering/MetadataFilterStrategy';
import { DatabaseManager } from '../../infrastructure/database/DatabaseManager';
import { SearchStrategyConfigManager } from './SearchStrategyConfigManager';
import { SearchPerformanceMonitor } from './SearchPerformanceMonitor';
import { SearchErrorHandler } from './SearchErrorHandler';
import { SearchConfigurationManager } from './SearchConfigurationManager';
import { SearchFilterProcessor } from './SearchFilterProcessor';
import { logError, logWarn, logInfo } from '../../infrastructure/config/Logger';
import {
  sanitizeString,
  sanitizeSearchQuery,
  sanitizeJsonInput,
  SanitizationError,
  ValidationError,
  containsDangerousPatterns
} from '../../infrastructure/config/SanitizationUtils';

/**
 * Lightweight SearchService orchestrator using composition with extracted modules
 * Refactored to use ~300-500 lines instead of 4410+ lines by delegating to specialized modules
 */
export class SearchService implements ISearchService {
  private strategies: Map<SearchStrategy, ISearchStrategy> = new Map();
  private strategyConfigs: Map<SearchStrategy, SearchStrategyConfig> = new Map();
  private dbManager: DatabaseManager;
  private configManager: SearchStrategyConfigManager;
  private searchIndexManager: SearchIndexManager;
  private performanceMonitor: SearchPerformanceMonitor;
  private errorHandler: SearchErrorHandler;
  private configurationManager: SearchConfigurationManager;
  private filterProcessor: SearchFilterProcessor;
  private _isInitialized: boolean = false;

  constructor(dbManager: DatabaseManager, configManager?: SearchStrategyConfigManager) {
    this.dbManager = dbManager;
    this.configManager = configManager || new SearchStrategyConfigManager();
    this.searchIndexManager = new SearchIndexManager(this.dbManager);
    this.performanceMonitor = new SearchPerformanceMonitor();
    this.errorHandler = new SearchErrorHandler();
    this.configurationManager = new SearchConfigurationManager();
    this.filterProcessor = new SearchFilterProcessor();

    // Initialize strategies synchronously but defer async operations
    this.initializeStrategiesSync();
  }

  /**
   * Initialize SearchService asynchronously
   */
  public async initializeAsync(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    try {
       await this.initializeStrategies();
       this._isInitialized = true;
       logInfo('SearchService fully initialized', { component: 'SearchService', operation: 'initializeAsync' });
     } catch (error) {
       logError('Failed to initialize SearchService', {
         component: 'SearchService',
         operation: 'initializeAsync',
         error: error instanceof Error ? error.message : String(error)
       });
       throw error;
     }
  }

  /**
   * Synchronous initialization of basic components
   */
  private initializeStrategiesSync(): void {
    // Initialize basic components synchronously
    logInfo('Initializing search strategies...', { component: 'SearchService', operation: 'initializeStrategiesSync' });
  }

  /**
   * Initialize all available search strategies
   */
  private async initializeStrategies(): Promise<void> {
    try {
      // Initialize configuration manager and load configurations
      await this.initializeStrategyConfigurations();

      // Initialize strategies with their configurations
      await this.initializeFTSStrategy();
      await this.initializeLikeStrategy();
      await this.initializeRecentStrategy();
      await this.initializeSemanticStrategy();
      await this.initializeCategoryFilterStrategy();
      await this.initializeTemporalFilterStrategy();
      await this.initializeMetadataFilterStrategy();
      await this.initializeRelationshipStrategy();

    } catch (error) {
      logError('Failed to initialize search strategies', {
        component: 'SearchService',
        operation: 'initializeStrategies',
        error: error instanceof Error ? error.message : String(error)
      });
      // Fall back to basic initialization
      this.initializeStrategiesFallback();
    }
  }

  /**
   * Initialize strategy configurations
   */
  private async initializeStrategyConfigurations(): Promise<void> {
    const strategyNames = Object.values(SearchStrategy);

    for (const strategyName of strategyNames) {
      try {
        // Try to load existing configuration
        let config = await this.configManager.loadConfiguration(strategyName);

        // If no configuration exists, use default
        if (!config) {
          config = this.configManager.getDefaultConfiguration(strategyName);
          // Save the default configuration for future use
          await this.configManager.saveConfiguration(strategyName, config);
        }

        // Cache the configuration for this strategy
        this.strategyConfigs.set(strategyName, config);
      } catch (error) {
        logWarn(`Failed to load configuration for ${strategyName}, using defaults`, {
          component: 'SearchService',
          operation: 'initializeStrategyConfigurations',
          strategyName,
          error: error instanceof Error ? error.message : String(error)
        });
        // Use default configuration as fallback
        const config = this.configManager.getDefaultConfiguration(strategyName);
        this.strategyConfigs.set(strategyName, config);
      }
    }
  }

  /**
   * Initialize FTS5 strategy with configuration
   */
  private async initializeFTSStrategy(): Promise<void> {
    const config = this.strategyConfigs.get(SearchStrategy.FTS5);

    if (config?.enabled) {
      const ftsStrategy = new SQLiteFTSStrategy(config, this.dbManager);

      // Apply FTS5-specific configuration
      if (config.strategySpecific) {
        const ftsConfig = config.strategySpecific as Record<string, unknown>;
        if (ftsConfig.bm25Weights && typeof ftsConfig.bm25Weights === 'object') {
          // Update BM25 weights if configured - safely merge with existing weights
          try {
            (ftsStrategy as unknown as { bm25Weights?: Record<string, number> }).bm25Weights = {
              ...(ftsStrategy as unknown as { bm25Weights?: Record<string, number> }).bm25Weights,
              ...ftsConfig.bm25Weights as Record<string, number>
            };
          } catch (error) {
            logWarn('Failed to apply FTS5 BM25 weights configuration', {
              component: 'SearchService',
              operation: 'initializeFTSStrategy',
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
        if (typeof ftsConfig.queryTimeout === 'number') {
          (ftsStrategy as unknown as { queryTimeout?: number }).queryTimeout = ftsConfig.queryTimeout;
        }
        if (typeof ftsConfig.resultBatchSize === 'number') {
          (ftsStrategy as unknown as { resultBatchSize?: number }).resultBatchSize = ftsConfig.resultBatchSize;
        }
      }

      this.strategies.set(SearchStrategy.FTS5, ftsStrategy);
    }
  }

  /**
   * Initialize LIKE strategy with configuration
   */
  private async initializeLikeStrategy(): Promise<void> {
    const config = this.strategyConfigs.get(SearchStrategy.LIKE);

    if (config?.enabled) {
      const likeStrategy = new LikeSearchStrategy(config, this.dbManager);
      this.strategies.set(SearchStrategy.LIKE, likeStrategy);
    }
  }

  /**
   * Initialize Recent Memories strategy with configuration
   */
  private async initializeRecentStrategy(): Promise<void> {
    const config = this.strategyConfigs.get(SearchStrategy.RECENT);

    if (config?.enabled) {
      const strategyConfig = {
        enabled: config.enabled,
        priority: config.priority,
        timeout: config.timeout,
        maxResults: config.maxResults,
        minScore: config.scoring?.baseWeight || 0.1
      };

      const recentStrategy = new RecentMemoriesStrategy({
        strategyName: SearchStrategy.RECENT,
        ...strategyConfig,
      }, this.dbManager);

      // Apply strategy-specific configuration
      if (config.strategySpecific) {
        const recentConfig = config.strategySpecific as Record<string, unknown>;
        // Update time windows if configured
        if (recentConfig.timeWindows && typeof recentConfig.timeWindows === 'object') {
          (recentStrategy as unknown as { timeWindows?: Record<string, unknown> }).timeWindows = {
            ...(recentStrategy as unknown as { timeWindows?: Record<string, unknown> }).timeWindows,
            ...(recentConfig.timeWindows as Record<string, unknown>)
          };
        }
        if (typeof recentConfig.maxAge === 'number') {
          (recentStrategy as unknown as { maxAge?: number }).maxAge = recentConfig.maxAge;
        }
      }

      this.strategies.set(SearchStrategy.RECENT, recentStrategy);
    }
  }

  /**
   * Initialize Semantic strategy with configuration
   */
  private async initializeSemanticStrategy(): Promise<void> {
    const config = this.strategyConfigs.get(SearchStrategy.SEMANTIC);

    if (config?.enabled) {
      const semanticStrategy = new SemanticSearchStrategy(config, this.dbManager);

      // Apply semantic-specific configuration
      if (config.strategySpecific) {
        // Store configuration for runtime use
        (semanticStrategy as unknown as { config?: Record<string, unknown> }).config = config.strategySpecific as Record<string, unknown>;
      }

      this.strategies.set(SearchStrategy.SEMANTIC, semanticStrategy);
    }
  }

  /**
   * Initialize Category Filter strategy with configuration
   */
  private async initializeCategoryFilterStrategy(): Promise<void> {
    const config = this.strategyConfigs.get(SearchStrategy.CATEGORY_FILTER);

    if (config?.enabled) {
      this.strategies.set(
        SearchStrategy.CATEGORY_FILTER,
        new CategoryFilterStrategy(config, this.dbManager),
      );
    }
  }

  /**
   * Initialize Temporal Filter strategy with configuration
   */
  private async initializeTemporalFilterStrategy(): Promise<void> {
    const config = this.strategyConfigs.get(SearchStrategy.TEMPORAL_FILTER);

    if (config?.enabled) {
      this.strategies.set(
        SearchStrategy.TEMPORAL_FILTER,
        new TemporalFilterStrategy(config, this.dbManager),
      );
    }
  }

  /**
   * Initialize Metadata Filter strategy with configuration
  */
 private async initializeMetadataFilterStrategy(): Promise<void> {
    const config = this.strategyConfigs.get(SearchStrategy.METADATA_FILTER);

    if (config?.enabled) {
      this.strategies.set(
        SearchStrategy.METADATA_FILTER,
        new MetadataFilterStrategy(config, this.dbManager),
      );
    }
  }

  /**
   * Initialize Relationship strategy with configuration
   */
  private async initializeRelationshipStrategy(): Promise<void> {
    const config = this.strategyConfigs.get(SearchStrategy.RELATIONSHIP);

    if (config?.enabled) {
      const relationshipStrategy = new RelationshipSearchStrategy(config, this.dbManager);

      // Apply relationship-specific configuration
      if (config.strategySpecific) {
        const relationshipConfig = config.strategySpecific as Record<string, unknown>;

        // Update relationship configuration with type safety
        if (typeof relationshipConfig.maxDepth === 'number') {
          (relationshipStrategy as unknown as { maxDepth?: number }).maxDepth = relationshipConfig.maxDepth;
        }
        if (typeof relationshipConfig.minRelationshipStrength === 'number') {
          (relationshipStrategy as unknown as { minRelationshipStrength?: number }).minRelationshipStrength = relationshipConfig.minRelationshipStrength;
        }
        if (typeof relationshipConfig.minRelationshipConfidence === 'number') {
          (relationshipStrategy as unknown as { minRelationshipConfidence?: number }).minRelationshipConfidence = relationshipConfig.minRelationshipConfidence;
        }
        if (typeof relationshipConfig.includeRelationshipPaths === 'boolean') {
          (relationshipStrategy as unknown as { includeRelationshipPaths?: boolean }).includeRelationshipPaths = relationshipConfig.includeRelationshipPaths;
        }
        if (typeof relationshipConfig.traversalStrategy === 'string') {
          (relationshipStrategy as unknown as { traversalStrategy?: string }).traversalStrategy = relationshipConfig.traversalStrategy;
        }
      }

      this.strategies.set(SearchStrategy.RELATIONSHIP, relationshipStrategy);
    }
   }

  /**
   * Fallback strategy initialization (when configuration loading fails)
   */
  private initializeStrategiesFallback(): void {
    const defaultFtsConfig = this.strategyConfigs.get(SearchStrategy.FTS5) ||
      this.configManager.getDefaultConfiguration(SearchStrategy.FTS5);
    this.strategies.set(
      SearchStrategy.FTS5,
      new SQLiteFTSStrategy(defaultFtsConfig, this.dbManager)
    );
    const defaultLikeConfig = this.strategyConfigs.get(SearchStrategy.LIKE) ||
      this.configManager.getDefaultConfiguration(SearchStrategy.LIKE);
    this.strategies.set(
      SearchStrategy.LIKE,
      new LikeSearchStrategy(defaultLikeConfig, this.dbManager)
    );
    const defaultCategoryConfig = this.strategyConfigs.get(SearchStrategy.CATEGORY_FILTER) ||
      this.configManager.getDefaultConfiguration(SearchStrategy.CATEGORY_FILTER);
    this.strategies.set(
      SearchStrategy.CATEGORY_FILTER,
      new CategoryFilterStrategy(defaultCategoryConfig, this.dbManager),
    );
    this.strategies.set(SearchStrategy.RECENT, new RecentMemoriesStrategy({
      strategyName: SearchStrategy.RECENT,
      enabled: true,
      priority: 3,
      timeout: 5000,
      maxResults: 100,
      minScore: 0.1
    }, this.dbManager));
    const defaultSemanticConfig = this.strategyConfigs.get(SearchStrategy.SEMANTIC) ||
      this.configManager.getDefaultConfiguration(SearchStrategy.SEMANTIC);
    this.strategies.set(
      SearchStrategy.SEMANTIC,
      new SemanticSearchStrategy(defaultSemanticConfig, this.dbManager)
    );

    // Add Temporal Filter Strategy
    const defaultTemporalConfig = this.strategyConfigs.get(SearchStrategy.TEMPORAL_FILTER) ||
      this.configManager.getDefaultConfiguration(SearchStrategy.TEMPORAL_FILTER);
    this.strategies.set(
      SearchStrategy.TEMPORAL_FILTER,
      new TemporalFilterStrategy(defaultTemporalConfig, this.dbManager),
    );

    // Add Metadata Filter Strategy
    const defaultMetadataConfig = this.strategyConfigs.get(SearchStrategy.METADATA_FILTER) ||
      this.configManager.getDefaultConfiguration(SearchStrategy.METADATA_FILTER);
    this.strategies.set(
      SearchStrategy.METADATA_FILTER,
      new MetadataFilterStrategy(defaultMetadataConfig, this.dbManager),
    );

    // Add Relationship Search Strategy
    const relationshipConfig = this.strategyConfigs.get(SearchStrategy.RELATIONSHIP) ||
      this.configManager.getDefaultConfiguration(SearchStrategy.RELATIONSHIP);
    this.strategies.set(
      SearchStrategy.RELATIONSHIP,
      new RelationshipSearchStrategy(relationshipConfig, this.dbManager)
    );
  }

  /**
   * Main search method that orchestrates multiple strategies using extracted modules
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const startTime = Date.now();

    try {
      // Validate and sanitize input using extracted utilities
      const validation = this.validateSearchInput(query);
      if (!validation.isValid) {
        throw new SearchValidationError(
          `Invalid search query: ${validation.errors.join(', ')}`,
          'searchQuery',
          query.text || '',
          'search_service',
          {
            strategy: 'search_service',
            operation: 'search_validation',
            query: query.text,
            parameters: { limit: query.limit, offset: query.offset },
            timestamp: new Date(),
          }
        );
      }

      const results: SearchResult[] = [];
      const seenIds = new Set<string>();

      // Determine strategy execution order based on query characteristics
      const strategyOrder = this.determineStrategyOrder(query);

      // Execute strategies using error handler for circuit breaking and recovery
      for (const strategyName of strategyOrder) {
        const strategy = this.strategies.get(strategyName);
        if (!strategy) continue;

        try {
          // Use error handler for circuit breaker protection
          const strategyResults = await this.errorHandler.executeWithCircuitBreaker(
            strategyName,
            () => this.executeStrategy(strategy, query)
          );

          // Deduplicate results across strategies
          for (const result of strategyResults) {
            if (!seenIds.has(result.id)) {
              seenIds.add(result.id);
              results.push(result);
            }
          }

          // Stop if we have enough results
          if (results.length >= (query.limit || 10)) break;

        } catch (error) {
          // Use SearchErrorHandler for comprehensive error handling and recovery
          const errorContext = this.errorHandler.createErrorContext('strategy_execution', strategyName, query, {
            strategyOrder: strategyOrder.join(', '),
            currentResultCount: results.length,
          });

          this.errorHandler.trackError(strategyName, error, errorContext);

          // Use SearchErrorHandler's recovery mechanisms
          if (this.errorHandler.shouldRetryStrategy(strategyName, error)) {
            try {
              const recoveryResults = await this.errorHandler.attemptStrategyRecovery(strategyName, query, error);
              for (const result of recoveryResults) {
                if (!seenIds.has(result.id)) {
                  seenIds.add(result.id);
                  results.push(result);
                }
              }
            } catch (recoveryError) {
              if (this.errorHandler.shouldFallbackToAlternative(strategyName, error)) {
                await this.executeFallbackStrategy(strategyName, query, results, seenIds);
              }
            }
          } else if (this.errorHandler.shouldFallbackToAlternative(strategyName, error)) {
            await this.executeFallbackStrategy(strategyName, query, results, seenIds);
          }
          continue;
        }
      }

      // Apply advanced filtering using extracted filter processor
      if (query.filterExpression) {
        try {
          const filteredResults = await this.filterProcessor.applyAdvancedFilter(results, query.filterExpression, query);
          const finalResults = this.rankAndSortResults(filteredResults, query);

          // Track performance metrics using extracted performance monitor
          const queryTime = Date.now() - startTime;
          this.performanceMonitor.updatePerformanceMetrics(queryTime);

          return finalResults;
        } catch (error) {
          logWarn('Advanced filter execution failed, falling back to regular results', {
            component: 'SearchService',
            operation: 'search',
            error: error instanceof Error ? error.message : String(error)
          });
          // Fall back to regular results if filtering fails
        }
      }

      // Track performance metrics using extracted performance monitor
      const queryTime = Date.now() - startTime;
      this.performanceMonitor.updatePerformanceMetrics(queryTime);

      return this.rankAndSortResults(results, query);

    } catch (error) {
      // Track performance metrics even for failed queries
      const queryTime = Date.now() - startTime;
      this.performanceMonitor.updatePerformanceMetrics(queryTime);

      throw new SearchError(
        `Search operation failed: ${error instanceof Error ? error.message : String(error)}`,
        'search_service',
        {
          strategy: 'search_service',
          operation: 'orchestrated_search',
          query: query.text,
          parameters: { limit: query.limit, offset: query.offset },
          timestamp: new Date(),
        },
        error instanceof Error ? error : undefined,
        SearchErrorCategory.EXECUTION,
      );
    }
  }

  /**
   * Search with a specific strategy
   */
  async searchWithStrategy(query: SearchQuery, strategy: SearchStrategy): Promise<SearchResult[]> {
    const startTime = Date.now();

    const searchStrategy = this.strategies.get(strategy);
    if (!searchStrategy) {
      throw new StrategyNotFoundError(strategy);
    }

    try {
      // Use error handler for circuit breaker protection
      const results = await this.errorHandler.executeWithCircuitBreaker(
        strategy,
        () => this.executeStrategy(searchStrategy, query)
      );

      // Track performance metrics with enhanced monitoring - only track errors for actual failures
      const queryTime = Date.now() - startTime;
      const primaryStrategy = results.length > 0 ? results[0].strategy as SearchStrategy : SearchStrategy.LIKE;
      // A search is successful if it executes without errors, even if no results are found
      const success = true; // Strategy executed successfully, just no results found
      const queryComplexity = this.performanceMonitor.calculateQueryComplexity(query);

      this.performanceMonitor.recordQueryMetrics(primaryStrategy, success, queryTime, queryComplexity);

      return this.rankAndSortResults(results, query);
    } catch (error) {
      // Create comprehensive error context
      const errorContext = this.errorHandler.createErrorContext('search_with_strategy', strategy, query);
      this.errorHandler.trackError(strategy, error, errorContext);

      // Attempt strategy-specific recovery
      try {
        const recoveryResults = await this.errorHandler.attemptStrategyRecovery(strategy, query, error);
        return this.rankAndSortResults(recoveryResults, query);
      } catch (recoveryError) {
        // If recovery fails, throw the original error with enhanced context
        throw new SearchStrategyError(
          strategy,
          `Strategy ${strategy} failed: ${error instanceof Error ? error.message : String(error)}`,
          'search_with_strategy',
          {
            query: query.text,
            limit: query.limit,
            offset: query.offset,
            errorContext: errorContext,
            recoveryAttempted: true,
            recoveryFailed: true,
          },
          error instanceof Error ? error : undefined,
        );
      }
    }
  }

  /**
   * Get all available strategies
   */
  getAvailableStrategies(): SearchStrategy[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Health check for all search strategies
   */
  async performStrategyHealthCheck(): Promise<{
    healthy: SearchStrategy[];
    unhealthy: SearchStrategy[];
    details: Record<SearchStrategy, { available: boolean; error?: string }>;
  }> {
    const healthy: SearchStrategy[] = [];
    const unhealthy: SearchStrategy[] = [];
    const details: Record<SearchStrategy, { available: boolean; error?: string }> = {} as any;

    for (const [strategyName, strategy] of this.strategies) {
      try {
        // Test strategy availability and basic functionality
        const isAvailable = await this.testStrategyAvailability(strategy);
        details[strategyName] = { available: isAvailable };

        if (isAvailable) {
          healthy.push(strategyName);
        } else {
          unhealthy.push(strategyName);
          details[strategyName].error = 'Strategy not available or failed health check';
        }
      } catch (error) {
        unhealthy.push(strategyName);
        details[strategyName] = {
          available: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    return { healthy, unhealthy, details };
  }

  /**
   * Test if a strategy is available and functioning
   */
  private async testStrategyAvailability(strategy: ISearchStrategy): Promise<boolean> {
    try {
      // Basic validation check
      await strategy.validateConfiguration();

      // Test with a simple query to verify the strategy can execute
      if (strategy.canHandle({ text: 'test', limit: 1 })) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get a specific strategy by name
   */
  getStrategy(name: string): ISearchStrategy | null {
    const strategy = this.strategies.get(name as SearchStrategy);
    return strategy || null;
  }

  /**
   * Execute a single strategy with error handling
   */
  private async executeStrategy(strategy: ISearchStrategy, query: SearchQuery): Promise<SearchResult[]> {
    const timeout = 5000; // 5 second timeout

    return Promise.race([
      strategy.search(query),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new SearchTimeoutError(
          strategy.name,
          timeout,
          'strategy_execution',
          { query: query.text, strategy: strategy.name }
        )), timeout);
      })
    ]);
  }

 /**
  * Validate and sanitize search input parameters using extracted utilities
  */
 private validateSearchInput(query: SearchQuery): { isValid: boolean; errors: string[] } {
   const errors: string[] = [];

   try {
     // Use sanitization utilities for query text
     if (query.text) {
       if (typeof query.text !== 'string') {
         errors.push('Query text must be a string');
       } else {
         const sanitizedQuery = sanitizeSearchQuery(query.text, {
           fieldName: 'query.text',
           allowWildcards: true,
           allowBoolean: false
         });

         const queryDangers = containsDangerousPatterns(sanitizedQuery);
         if (queryDangers.hasSQLInjection || queryDangers.hasXSS || queryDangers.hasCommandInjection) {
           errors.push('Query contains dangerous patterns');
         }

         query.text = sanitizedQuery;
       }
     }

     // Basic length validation
     if (query.text && query.text.length > 1000) {
       errors.push('Query text is too long (max 1000 characters)');
     }

     // Validate numeric parameters
     if (query.limit !== undefined && (typeof query.limit !== 'number' || query.limit < 1 || query.limit > 1000)) {
       errors.push('Limit must be a number between 1 and 1000');
     }

     if (query.offset !== undefined && (typeof query.offset !== 'number' || query.offset < 0 || query.offset > 10000)) {
       errors.push('Offset must be a number between 0 and 10000');
     }

     // Use SearchFilterProcessor for advanced filter validation
     if (query.filterExpression) {
       if (typeof query.filterExpression !== 'string') {
         errors.push('Filter expression must be a string');
       } else {
         // Basic sanitization first
         const sanitizedFilter = sanitizeString(query.filterExpression, {
           fieldName: 'query.filterExpression',
           maxLength: 2000,
           allowHtml: false,
           allowNewlines: true
         });

         const filterDangers = containsDangerousPatterns(sanitizedFilter);
         if (filterDangers.hasSQLInjection || filterDangers.hasXSS || filterDangers.hasCommandInjection) {
           errors.push('Filter expression contains dangerous patterns');
         } else {
           // Use SearchFilterProcessor for advanced validation
           const filterValidation = this.filterProcessor.validateFilterExpression(sanitizedFilter);
           if (!filterValidation.isValid) {
             errors.push(`Invalid filter expression: ${filterValidation.error}`);
           } else {
             query.filterExpression = sanitizedFilter;
           }
         }
       }
     }

     // Basic filters validation
     if (query.filters) {
       if (typeof query.filters !== 'object') {
         errors.push('Filters must be an object');
       } else {
         // Validate importance levels
         if (query.filters.minImportance && !['low', 'medium', 'high', 'critical'].includes(query.filters.minImportance as string)) {
           errors.push('Invalid minimum importance level');
         }

         // Validate and sanitize categories
         if (query.filters.categories) {
           if (!Array.isArray(query.filters.categories)) {
             errors.push('Categories filter must be an array');
           } else {
             query.filters.categories = query.filters.categories.map((cat: string) =>
               sanitizeString(cat, {
                 fieldName: 'query.filters.categories',
                 maxLength: 100,
                 allowNewlines: false
               })
             );
           }
         }

         // Validate metadata filters
         if (query.filters.metadataFilters) {
           if (typeof query.filters.metadataFilters !== 'object') {
             errors.push('Metadata filters must be an object');
           } else {
             try {
               query.filters.metadataFilters = sanitizeJsonInput(
                 JSON.stringify(query.filters.metadataFilters),
                 { fieldName: 'query.filters.metadataFilters', maxSize: 10000 }
               );
             } catch (error) {
               errors.push('Invalid metadata filters format');
             }
           }
         }
       }
     }

     // Validate sort criteria
     if (query.sortBy) {
       if (typeof query.sortBy !== 'object' || !query.sortBy.field || !query.sortBy.direction) {
         errors.push('SortBy must have field and direction properties');
       } else {
         query.sortBy.field = sanitizeString(query.sortBy.field, {
           fieldName: 'query.sortBy.field',
           maxLength: 100,
           allowNewlines: false
         });

         if (!['asc', 'desc', 'ASC', 'DESC'].includes(query.sortBy.direction)) {
           errors.push('Sort direction must be asc or desc');
         }
       }
     }

     return {
       isValid: errors.length === 0,
       errors
     };

   } catch (error) {
     if (error instanceof SanitizationError || error instanceof ValidationError) {
       return {
         isValid: false,
         errors: [error.message]
       };
     }

     return {
       isValid: false,
       errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`]
     };
   }
 }

  /**
    * Determine the order of strategy execution based on query characteristics
    */
   private determineStrategyOrder(query: SearchQuery): SearchStrategy[] {
     // If query is empty, prioritize recent memories
     if (!query.text || query.text.trim() === '') {
       return [SearchStrategy.RECENT];
     }

     const strategies: SearchStrategy[] = [];
     const availableStrategies = Array.from(this.strategies.keys());

     // Let each strategy determine if it can handle the query, then prioritize
     const capableStrategies = availableStrategies
       .map(strategyName => ({ strategy: strategyName, instance: this.strategies.get(strategyName)! }))
       .filter(({ instance }) => instance.canHandle(query))
       .sort((a, b) => b.instance.priority - a.instance.priority) // Higher priority first
       .map(({ strategy }) => strategy);

     // Add capable strategies in priority order
     strategies.push(...capableStrategies);

     // Add filter strategies for specific filter types
     if (query.filters?.categories && !strategies.includes(SearchStrategy.CATEGORY_FILTER)) {
       strategies.unshift(SearchStrategy.CATEGORY_FILTER); // Insert at beginning for high priority
     }

     if (this.hasTemporalFilters(query) && !strategies.includes(SearchStrategy.TEMPORAL_FILTER)) {
       strategies.splice(1, 0, SearchStrategy.TEMPORAL_FILTER); // Insert after primary strategies
     }

     if (query.filters?.metadataFilters && !strategies.includes(SearchStrategy.METADATA_FILTER)) {
       strategies.splice(2, 0, SearchStrategy.METADATA_FILTER); // Insert after temporal filter
     }

     // Add semantic search for complex queries if not already included
     if (this.isComplexQuery(query.text) && !strategies.includes(SearchStrategy.SEMANTIC)) {
       strategies.push(SearchStrategy.SEMANTIC);
     }

     // Ensure LIKE is always available as final fallback
     if (!strategies.includes(SearchStrategy.LIKE)) {
       strategies.push(SearchStrategy.LIKE);
     }

     return strategies;
   }


  /**
   * Rank and sort results based on relevance and query criteria
   */
  private rankAndSortResults(results: SearchResult[], query: SearchQuery): SearchResult[] {
    // Calculate composite scores for ranking
    results.forEach(result => {
      result.score = this.calculateCompositeScore(result, query);
    });

    // Sort by composite score
    results.sort((a, b) => b.score - a.score);

    // Apply limit
    const limit = query.limit || 10;
    return results.slice(0, limit);
  }

  /**
   * Calculate composite score for ranking results
   */
  private calculateCompositeScore(result: SearchResult, query: SearchQuery): number {
    let score = result.score;

    // Boost score based on strategy priority
    const strategy = this.strategies.get(result.strategy as SearchStrategy);
    if (strategy) {
      score *= (1 + strategy.priority / 100);
    }

    // Apply query-specific boosts
    if (query.text && result.content.toLowerCase().includes(query.text.toLowerCase())) {
      score *= 1.2; // Boost exact matches
    }

    return score;
  }

  /**
    * Determine if a query is complex and should use semantic search
    */
   private isComplexQuery(query: string): boolean {
     if (!query) return false;
     const words = query.split(/\s+/).length;
     return words > 5 || query.length > 100;
   }

   /**
    * Check if query text contains category keywords
    */
   private hasCategoryKeywords(query: string): boolean {
     if (!query) return false;

     const categoryKeywords = [
       'category', 'type', 'kind', 'programming', 'database', 'framework', 'language',
       'personal', 'work', 'project'
     ];

     const lowerQuery = query.toLowerCase();
     return categoryKeywords.some(keyword => lowerQuery.includes(keyword));
   }

   /**
    * Check if query text contains temporal keywords
    */
   private hasTemporalKeywords(query: string): boolean {
     if (!query) return false;

     const temporalKeywords = [
       'time', 'date', 'when', 'before', 'after', 'recent', 'old', 'new',
       'today', 'yesterday', 'week', 'month', 'year', 'ago'
     ];

     const lowerQuery = query.toLowerCase();
     return temporalKeywords.some(keyword => lowerQuery.includes(keyword));
   }

   /**
    * Check if query has temporal filters
    */
   private hasTemporalFilters(query: SearchQuery): boolean {
     if (!query.filters) return false;

     const temporalFields = ['createdAfter', 'createdBefore', 'since', 'until', 'age', 'timeRange'];
     return temporalFields.some(field => field in query.filters!);
   }

   /**
    * Check if query text contains metadata keywords
    */
   private hasMetadataKeywords(query: string): boolean {
     if (!query) return false;

     const metadataKeywords = ['metadata', 'meta', 'field', 'property'];

     const lowerQuery = query.toLowerCase();
     return metadataKeywords.some(keyword => lowerQuery.includes(keyword));
   }

  /**
   * Execute fallback strategy when primary strategy fails
   */
  private async executeFallbackStrategy(failedStrategy: SearchStrategy, query: SearchQuery, results: SearchResult[], seenIds: Set<string>): Promise<void> {
    // Determine appropriate fallback strategy
    let fallbackStrategy: SearchStrategy;

    switch (failedStrategy) {
      case SearchStrategy.FTS5:
        fallbackStrategy = SearchStrategy.LIKE;
        break;
      case SearchStrategy.LIKE:
        fallbackStrategy = SearchStrategy.RECENT;
        break;
      default:
        fallbackStrategy = SearchStrategy.RECENT;
        break;
    }

    const fallbackStrategyInstance = this.strategies.get(fallbackStrategy);
    if (!fallbackStrategyInstance) {
      logWarn(`No fallback strategy available for ${failedStrategy}`, {
        component: 'SearchService',
        operation: 'executeFallbackStrategy',
        failedStrategy,
        fallbackStrategy
      });
      return;
    }

    try {
      logInfo(`Executing fallback strategy ${fallbackStrategy} for failed strategy ${failedStrategy}`, {
        component: 'SearchService',
        operation: 'executeFallbackStrategy',
        failedStrategy,
        fallbackStrategy
      });
      const fallbackResults = await this.executeStrategy(fallbackStrategyInstance, query);

      // Add fallback results that haven't been seen before
      for (const result of fallbackResults) {
        if (!seenIds.has(result.id)) {
          seenIds.add(result.id);
          results.push(result);
        }
      }
    } catch (fallbackError) {
      logWarn(`Fallback strategy ${fallbackStrategy} also failed`, {
        component: 'SearchService',
        operation: 'executeFallbackStrategy',
        failedStrategy,
        fallbackStrategy,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      });
    }
  }


  // ===== DELEGATION METHODS TO EXTRACTED MODULES =====

  /**
   * Get index health report using extracted SearchIndexManager
   */
  public async getIndexHealthReport() {
    return await this.searchIndexManager.getIndexHealthReport();
  }

  /**
   * Check if index health is acceptable for search operations
   */
  public async isIndexHealthy(): Promise<boolean> {
    try {
      const report = await this.getIndexHealthReport();
      return report.health !== 'corrupted' && report.health !== 'critical';
    } catch (error) {
      logError('Failed to check index health', {
        component: 'SearchService',
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Perform index optimization using extracted SearchIndexManager
   */
  public async optimizeIndex() {
    return await this.searchIndexManager.optimizeIndex();
  }

  /**
   * Create index backup using extracted SearchIndexManager
   */
  public async createIndexBackup() {
    return await this.searchIndexManager.createBackup();
  }

  /**
   * Restore index from backup using extracted SearchIndexManager
   */
  public async restoreIndexFromBackup(backupId: string): Promise<boolean> {
    return await this.searchIndexManager.restoreFromBackup(backupId);
  }

  /**
   * Get performance report using extracted SearchPerformanceMonitor
   */
  public getPerformanceReport() {
    return this.performanceMonitor.getPerformanceReport();
  }

  /**
   * Get dashboard data using extracted SearchPerformanceMonitor
   */
  public getDashboardData() {
    return this.performanceMonitor.getDashboardData();
  }

  /**
   * Get error statistics using extracted SearchErrorHandler
   */
  public getErrorStatistics() {
    return this.errorHandler.getErrorStatistics();
  }

  /**
   * Reset circuit breaker using extracted SearchErrorHandler
   */
  public resetCircuitBreaker(strategyName: SearchStrategy): void {
    this.errorHandler.resetCircuitBreaker(strategyName);
  }

  /**
   * Force circuit breaker to open using extracted SearchErrorHandler
   */
  public tripCircuitBreaker(strategyName: SearchStrategy): void {
    this.errorHandler.tripCircuitBreaker(strategyName);
  }

  /**
   * Get available filter templates using extracted SearchFilterProcessor
   */
  public getAvailableFilterTemplates() {
    return this.filterProcessor.getAvailableFilterTemplates();
  }

  /**
   * Validate filter template using extracted SearchFilterProcessor
   */
  public validateFilterTemplate(templateName: string) {
    return this.filterProcessor.validateFilterTemplate(templateName);
  }

  /**
    * Update strategy configuration using extracted SearchConfigurationManager
    */
   async updateStrategyConfiguration(strategyName: string, config: Record<string, unknown>): Promise<void> {
     return await this.configurationManager.updateStrategyConfiguration(strategyName, config);
   }

  /**
   * Get configuration update history using extracted SearchConfigurationManager
   */
  getConfigurationUpdateHistory(strategyName?: string) {
    return this.configurationManager.getConfigurationUpdateHistory(strategyName);
  }

  /**
   * Rollback configuration using extracted SearchConfigurationManager
   */
  async rollbackConfiguration(strategyName: string): Promise<void> {
    return await this.configurationManager.rollbackConfiguration(strategyName);
  }

  /**
    * Set error notification callback using extracted SearchErrorHandler
    */
   public setErrorNotificationCallback(callback: (error: unknown) => void): void {
     this.errorHandler.setErrorNotificationCallback(callback);
   }

  /**
   * Get maintenance status using extracted SearchIndexManager
   */
  public getMaintenanceStatus() {
    return this.searchIndexManager.getMaintenanceStatus();
  }

  /**
    * Add performance alert callback using extracted SearchPerformanceMonitor
    */
   public addPerformanceAlertCallback(callback: (alert: unknown) => void): void {
     this.performanceMonitor.addPerformanceAlertCallback(callback);
   }

   /**
    * Remove performance alert callback using extracted SearchPerformanceMonitor
    */
   public removePerformanceAlertCallback(callback: (alert: unknown) => void): void {
     this.performanceMonitor.removePerformanceAlertCallback(callback);
   }

   /**
    * Update performance monitoring configuration using extracted SearchPerformanceMonitor
    */
   public updatePerformanceMonitoringConfig(config: Record<string, unknown>): void {
     this.performanceMonitor.updatePerformanceMonitoringConfig(config);
   }

  /**
   * Get performance monitoring configuration using extracted SearchPerformanceMonitor
   */
  public getPerformanceMonitoringConfig() {
    return this.performanceMonitor.getPerformanceMonitoringConfig();
  }

  /**
   * Get performance metrics using extracted SearchPerformanceMonitor
   */
  public getPerformanceMetrics() {
    return this.performanceMonitor.getPerformanceMetrics();
  }

  /**
   * Cleanup all resources and stop background processes
   */
  public cleanup(): void {
    try {
      // Stop performance monitoring
      this.performanceMonitor.cleanup();

      // Stop search index maintenance schedule
      this.searchIndexManager.stopMaintenanceSchedule();

      // Clear strategy configurations
      this.strategies.clear();
      this.strategyConfigs.clear();

      // Clear error handler resources - reset all circuit breakers
      const allStrategies = Object.values(SearchStrategy);
      for (const strategy of allStrategies) {
        this.errorHandler.resetCircuitBreaker(strategy);
      }

      logInfo('SearchService cleanup completed successfully', {
        component: 'SearchService',
        operation: 'cleanup'
      });
    } catch (error) {
      logError('Error during SearchService cleanup', {
        component: 'SearchService',
        operation: 'cleanup',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
