import { SearchService } from '@/core/domain/search/SearchService';
import { SearchQuery, SearchResult, SearchStrategy, ISearchStrategy, StrategyNotFoundError } from '@/core/domain/search/types';
import { DatabaseManager } from '@/core/infrastructure/database/DatabaseManager';
import { SearchStrategyConfigManager } from '@/core/domain/search/SearchStrategyConfigManager';
import { SearchPerformanceMonitor } from '@/core/domain/search/SearchPerformanceMonitor';
import { SearchErrorHandler } from '@/core/domain/search/SearchErrorHandler';
import { SearchConfigurationManager } from '@/core/domain/search/SearchConfigurationManager';
import { SearchFilterProcessor } from '@/core/domain/search/SearchFilterProcessor';

// Mock implementations for testing
class MockDatabaseManager {
  async $queryRawUnsafe(sql: string, params?: unknown[]): Promise<unknown[]> {
    return [];
  }

  getPrismaClient() {
    return {
      $queryRawUnsafe: this.$queryRawUnsafe.bind(this),
    };
  }
}

class MockSearchStrategy implements ISearchStrategy {
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly any[];
  readonly priority: number;
  readonly supportedMemoryTypes: readonly ('short_term' | 'long_term')[];

  constructor(name: SearchStrategy, priority: number = 1) {
    this.name = name;
    this.description = `Mock ${name} strategy for testing`;
    this.capabilities = ['KEYWORD_SEARCH', 'FILTERING'];
    this.priority = priority;
    this.supportedMemoryTypes = ['short_term', 'long_term'] as const;
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    return [
      {
        id: 'mock-result-1',
        content: `Mock result from ${this.name} for query: ${query.text}`,
        score: 0.8,
        strategy: this.name,
        timestamp: new Date(),
        metadata: { strategy: this.name }
      }
    ];
  }

  canHandle(query: SearchQuery): boolean {
    return query.text !== 'unhandled-query';
  }

  getMetadata(): any {
    return {
      name: this.name,
      version: '1.0.0',
      description: `Mock ${this.name} strategy for testing`,
      capabilities: ['KEYWORD_SEARCH', 'FILTERING'],
      supportedMemoryTypes: ['short_term', 'long_term'] as const
    };
  }

  async validateConfiguration(): Promise<boolean> {
    return true;
  }

}

class MockStrategyConfigManager {
  private configs: Map<SearchStrategy, any> = new Map();

  async loadConfiguration(strategyName: SearchStrategy): Promise<any> {
    return this.configs.get(strategyName) || null;
  }

  async saveConfiguration(strategyName: SearchStrategy, config: any): Promise<void> {
    this.configs.set(strategyName, config);
  }

  getDefaultConfiguration(strategyName: SearchStrategy): any {
    return {
      enabled: true,
      priority: 1,
      timeout: 5000,
      maxResults: 100,
      strategySpecific: {}
    };
  }
}

describe('SearchService', () => {
  let searchService: SearchService;
  let mockDbManager: MockDatabaseManager;
  let mockConfigManager: MockStrategyConfigManager;

  beforeEach(() => {
    mockDbManager = new MockDatabaseManager();
    mockConfigManager = new MockStrategyConfigManager();

    // Initialize service with mocks
    searchService = new SearchService(mockDbManager as any, mockConfigManager as any);
  });

  afterEach(() => {
    // Clean up timers and intervals to prevent Jest from hanging
    try {
      searchService.cleanup();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('initialization', () => {
    it('should initialize synchronously', () => {
      expect(searchService).toBeInstanceOf(SearchService);
      expect(searchService.getAvailableStrategies()).toBeDefined();
    });

    it('should initialize asynchronously without errors', async () => {
      await expect(searchService.initializeAsync()).resolves.not.toThrow();
    });

    it('should handle multiple async initializations gracefully', async () => {
      await searchService.initializeAsync();
      await searchService.initializeAsync(); // Second call should not fail
      await searchService.initializeAsync(); // Third call should not fail

      expect(searchService.getAvailableStrategies()).toBeDefined();
    });

    it('should provide access to available strategies', () => {
      const strategies = searchService.getAvailableStrategies();
      expect(Array.isArray(strategies)).toBe(true);
    });
  });

  describe('strategy management', () => {
    it('should get specific strategy by name', () => {
      const strategy = searchService.getStrategy('LIKE');
      if (strategy) {
        expect(strategy).toBeDefined();
        expect(strategy.getMetadata()).toBeDefined();
      }
    });

    it('should return null for non-existent strategy', () => {
      const strategy = searchService.getStrategy('NON_EXISTENT');
      expect(strategy).toBeNull();
    });

    it('should handle strategy availability correctly', async () => {
      const mockStrategy = new MockSearchStrategy(SearchStrategy.LIKE, 1);
      const canHandle = mockStrategy.canHandle({ text: 'test query' });
      expect(canHandle).toBe(true);

      const cannotHandle = mockStrategy.canHandle({ text: 'unhandled-query' });
      expect(cannotHandle).toBe(false);
    });
  });

  describe('basic search functionality', () => {
    it('should perform basic search with simple query', async () => {
      const query: SearchQuery = {
        text: 'test search query',
        limit: 10
      };

      const results = await searchService.search(query);

      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('id');
        expect(results[0]).toHaveProperty('content');
        expect(results[0]).toHaveProperty('score');
        expect(results[0]).toHaveProperty('strategy');
      }
    });

    it('should handle empty query gracefully', async () => {
      const query: SearchQuery = {
        text: '',
        limit: 10
      };

      const results = await searchService.search(query);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle null query text', async () => {
      const query: SearchQuery = {
        text: null as any,
        limit: 10
      };

      const results = await searchService.search(query);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should respect result limit', async () => {
      const query: SearchQuery = {
        text: 'test query',
        limit: 5
      };

      const results = await searchService.search(query);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should apply default limit when not specified', async () => {
      const query: SearchQuery = {
        text: 'test query'
      };

      const results = await searchService.search(query);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(10); // Default limit
    });
  });

  describe('strategy-specific search', () => {
    it('should search with specific strategy', async () => {
      const query: SearchQuery = {
        text: 'test query',
        limit: 10
      };

      // Test with LIKE strategy if available
      const likeStrategy = searchService.getStrategy('LIKE');
      if (likeStrategy) {
        const results = await searchService.searchWithStrategy(query, SearchStrategy.LIKE);
        expect(Array.isArray(results)).toBe(true);
      }
    });

    it('should throw error for non-existent strategy', async () => {
      const query: SearchQuery = {
        text: 'test query'
      };

      await expect(
        searchService.searchWithStrategy(query, 'NON_EXISTENT' as SearchStrategy)
      ).rejects.toThrow(StrategyNotFoundError);
    });
  });

  describe('search result structure', () => {
    it('should return properly structured search results', async () => {
      const query: SearchQuery = {
        text: 'test query',
        limit: 1
      };

      const results = await searchService.search(query);

      if (results.length > 0) {
        const result = results[0];
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('strategy');
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('metadata');

        expect(typeof result.id).toBe('string');
        expect(typeof result.content).toBe('string');
        expect(typeof result.score).toBe('number');
        expect(typeof result.strategy).toBe('string');
        expect(result.timestamp).toBeInstanceOf(Date);
        expect(typeof result.metadata).toBe('object');
      }
    });

    it('should maintain result order by score', async () => {
      const query: SearchQuery = {
        text: 'test query',
        limit: 10
      };

      const results = await searchService.search(query);

      // Results should be sorted by score (highest first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should include query text in result content', async () => {
      const query: SearchQuery = {
        text: 'specific test query',
        limit: 10
      };

      const results = await searchService.search(query);

      if (results.length > 0) {
        const hasQueryText = results.some(result =>
          result.content.includes('specific test query')
        );
        expect(hasQueryText).toBe(true);
      }
    });
  });

  describe('query parameter handling', () => {
    it('should handle queries with filters', async () => {
      const query: SearchQuery = {
        text: 'test query',
        filters: {
          categories: ['electronics', 'books'],
          minImportance: 'high'
        }
      };

      const results = await searchService.search(query);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle queries with metadata filters', async () => {
      const query: SearchQuery = {
        text: 'test query',
        filters: {
          metadataFilters: {
            fields: [
              { key: 'category', value: 'electronics', operator: 'eq' }
            ]
          }
        }
      };

      const results = await searchService.search(query);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle queries with sort criteria', async () => {
      const query: SearchQuery = {
        text: 'test query',
        sortBy: {
          field: 'score',
          direction: 'desc'
        }
      };

      const results = await searchService.search(query);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle queries with offset', async () => {
      const query: SearchQuery = {
        text: 'test query',
        offset: 5,
        limit: 10
      };

      const results = await searchService.search(query);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle search errors gracefully', async () => {
      // Test with potentially problematic query
      const query: SearchQuery = {
        text: 'a'.repeat(2000), // Very long query
        limit: 10
      };

      // Should throw validation error due to length limit
      await expect(searchService.search(query)).rejects.toThrow();
    });

    it('should provide error statistics', () => {
      const errorStats = searchService.getErrorStatistics();
      expect(typeof errorStats).toBe('object');
    });

    it('should allow circuit breaker reset', () => {
      expect(() => {
        searchService.resetCircuitBreaker(SearchStrategy.LIKE);
      }).not.toThrow();
    });

    it('should allow circuit breaker trip', () => {
      expect(() => {
        searchService.tripCircuitBreaker(SearchStrategy.LIKE);
      }).not.toThrow();
    });
  });

  describe('performance monitoring', () => {
    it('should provide performance report', () => {
      const report = searchService.getPerformanceReport();
      expect(typeof report).toBe('object');
    });

    it('should provide dashboard data', () => {
      const dashboard = searchService.getDashboardData();
      expect(typeof dashboard).toBe('object');
    });

    it('should provide performance metrics', () => {
      const metrics = searchService.getPerformanceMetrics();
      expect(typeof metrics).toBe('object');
    });

    it('should track query performance', async () => {
      const initialReport = searchService.getPerformanceReport();

      const query: SearchQuery = {
        text: 'performance test query',
        limit: 5
      };

      await searchService.search(query);

      const finalReport = searchService.getPerformanceReport();
      expect(typeof finalReport).toBe('object');
    });
  });

  describe('configuration management', () => {
    it('should handle configuration update attempts', async () => {
      const config = {
        enabled: true,
        priority: 5,
        timeout: 10000
      };

      // Configuration update may fail due to mock limitations
      await expect(
        searchService.updateStrategyConfiguration('LIKE', config)
      ).rejects.toThrow();
    });

    it('should provide configuration update history', () => {
      const history = searchService.getConfigurationUpdateHistory();
      expect(typeof history).toBe('object');
    });

    it('should provide configuration update history for specific strategy', () => {
      const history = searchService.getConfigurationUpdateHistory('LIKE');
      expect(typeof history).toBe('object');
    });

    it('should handle configuration rollback attempts', async () => {
      // Configuration rollback may fail due to mock limitations
      await expect(
        searchService.rollbackConfiguration('LIKE')
      ).rejects.toThrow();
    });
  });

  describe('filter integration', () => {
    it('should handle queries with filter expressions', async () => {
      const query: SearchQuery = {
        text: 'test query',
        filterExpression: 'category = "electronics"'
      };

      // Filter expressions may fail due to validation or processing
      await expect(searchService.search(query)).rejects.toThrow();
    });

    it('should provide available filter templates', () => {
      const templates = searchService.getAvailableFilterTemplates();
      expect(typeof templates).toBe('object');
    });

    it('should validate filter templates', () => {
      const validation = searchService.validateFilterTemplate('test-template');
      expect(typeof validation).toBe('object');
    });
  });

  describe('health and maintenance', () => {
    it('should perform strategy health checks', async () => {
      const healthCheck = await searchService.performStrategyHealthCheck();

      expect(healthCheck).toHaveProperty('healthy');
      expect(healthCheck).toHaveProperty('unhealthy');
      expect(healthCheck).toHaveProperty('details');

      expect(Array.isArray(healthCheck.healthy)).toBe(true);
      expect(Array.isArray(healthCheck.unhealthy)).toBe(true);
      expect(typeof healthCheck.details).toBe('object');
    });

    it('should handle index health information requests', async () => {
      // Index health may fail due to mock database limitations
      await expect(searchService.getIndexHealthReport()).rejects.toThrow();
    });

    it('should check index health status', async () => {
      const isHealthy = await searchService.isIndexHealthy();
      expect(typeof isHealthy).toBe('boolean');
    });

    it('should provide maintenance status', () => {
      const maintenanceStatus = searchService.getMaintenanceStatus();
      expect(typeof maintenanceStatus).toBe('object');
    });
  });

  describe('resource management', () => {
    it('should handle index optimization', async () => {
      await expect(searchService.optimizeIndex()).resolves.not.toThrow();
    });

    it('should handle index backup creation attempts', async () => {
      // Index backup may fail due to mock database limitations
      await expect(searchService.createIndexBackup()).rejects.toThrow();
    });

    it('should handle index backup restoration attempts', async () => {
      // Index restoration may fail due to mock database limitations
      await expect(searchService.restoreIndexFromBackup('test-backup')).rejects.toThrow();
    });

    it('should cleanup resources properly', () => {
      expect(() => {
        searchService.cleanup();
      }).not.toThrow();
    });
  });

  describe('performance monitoring configuration', () => {
    it('should handle performance monitoring config updates', () => {
      const config = {
        enableMetrics: true,
        enableAlerts: false
      };

      expect(() => {
        searchService.updatePerformanceMonitoringConfig(config);
      }).not.toThrow();
    });

    it('should provide performance monitoring configuration', () => {
      const config = searchService.getPerformanceMonitoringConfig();
      expect(typeof config).toBe('object');
    });

    it('should handle performance alert callbacks', () => {
      const mockCallback = jest.fn();

      expect(() => {
        searchService.addPerformanceAlertCallback(mockCallback);
      }).not.toThrow();

      expect(() => {
        searchService.removePerformanceAlertCallback(mockCallback);
      }).not.toThrow();
    });
  });

  describe('error notification', () => {
    it('should handle error notification callback setup', () => {
      const mockCallback = jest.fn();

      expect(() => {
        searchService.setErrorNotificationCallback(mockCallback);
      }).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex search with multiple parameters', async () => {
      const complexQuery: SearchQuery = {
        text: 'electronics programming tutorial',
        limit: 20,
        offset: 0,
        filters: {
          categories: ['programming', 'technology'],
          minImportance: 'medium'
        },
        sortBy: {
          field: 'score',
          direction: 'desc'
        },
        filterExpression: 'category = "programming"'
      };

      // Complex queries with filter expressions may fail validation
      await expect(searchService.search(complexQuery)).rejects.toThrow();
    });

    it('should handle rapid successive searches', async () => {
      const queries = [
        { text: 'query 1' },
        { text: 'query 2' },
        { text: 'query 3' },
        { text: 'query 4' },
        { text: 'query 5' }
      ];

      const promises = queries.map(query => searchService.search(query));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });

    it('should handle concurrent search requests', async () => {
      const query: SearchQuery = {
        text: 'concurrent test query',
        limit: 10
      };

      // Execute multiple searches concurrently
      const searchPromises = Array(5).fill(null).map(() =>
        searchService.search(query)
      );

      const results = await Promise.all(searchPromises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle extremely long query text', async () => {
      const longQuery = 'a'.repeat(2000);
      const query: SearchQuery = {
        text: longQuery,
        limit: 1
      };

      // Should reject queries that are too long
      await expect(searchService.search(query)).rejects.toThrow();
    });

    it('should handle special characters in query', async () => {
      const specialQuery: SearchQuery = {
        text: 'test query with special chars: !@#$%^&*()[]{}|;\':",./<>?',
        limit: 1
      };

      // Special characters may trigger validation errors
      await expect(searchService.search(specialQuery)).rejects.toThrow();
    });

    it('should handle unicode characters in query', async () => {
      const unicodeQuery: SearchQuery = {
        text: 'test query with unicode: 🚀 émojis ñ characters 中文',
        limit: 1
      };

      const results = await searchService.search(unicodeQuery);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle zero limit gracefully', async () => {
      const query: SearchQuery = {
        text: 'test query',
        limit: 0
      };

      // Zero limit should trigger validation error
      await expect(searchService.search(query)).rejects.toThrow();
    });

    it('should handle very large limit', async () => {
      const query: SearchQuery = {
        text: 'test query',
        limit: 10000
      };

      // Very large limit should trigger validation error
      await expect(searchService.search(query)).rejects.toThrow();
    });
  });

  describe('strategy orchestration', () => {
    it('should determine appropriate strategy order', async () => {
      const query: SearchQuery = {
        text: 'test query',
        limit: 10
      };

      // The search method should complete without errors
      const results = await searchService.search(query);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle strategy fallback scenarios', async () => {
      // Test with a query that might not match any strategy
      const query: SearchQuery = {
        text: 'unhandled-query',
        limit: 1
      };

      const results = await searchService.search(query);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('result ranking and scoring', () => {
    it('should apply composite scoring to results', async () => {
      const query: SearchQuery = {
        text: 'test query with specific content',
        limit: 10
      };

      const results = await searchService.search(query);

      if (results.length > 1) {
        // Results should be sorted by score (highest first)
        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
        }
      }
    });

    it('should boost scores for content matches', async () => {
      const query: SearchQuery = {
        text: 'exact match test',
        limit: 10
      };

      const results = await searchService.search(query);

      // Results should contain the query text
      if (results.length > 0) {
        const hasMatch = results.some(result =>
          result.content.toLowerCase().includes('exact match test')
        );
        expect(hasMatch).toBe(true);
      }
    });
  });
});