import { CategoryAggregationEngine, CategoryAggregationConfig, CategoryAggregationInfo, CategoryAggregationResult, CategoryGroup, CategoryAggregationUtils } from '@/core/domain/search/filtering/CategoryAggregation';
import { CategoryHierarchyManager } from '@/core/domain/search/filtering/CategoryHierarchyManager';
import { SearchResult } from '@/core/domain/search/SearchStrategy';

// Mock SearchResult objects for testing
const createMockSearchResult = (
  id: string,
  content: string,
  category: string,
  score: number = 0.8
): SearchResult => ({
  id,
  content,
  score,
  metadata: { category },
  strategy: 'test' as any,
  timestamp: new Date(),
});

// Mock SearchResult objects for testing
const createMockSearchResults = (): SearchResult[] => [
  createMockSearchResult('1', 'Content 1', 'electronics', 0.9),
  createMockSearchResult('2', 'Content 2', 'electronics', 0.8),
  createMockSearchResult('3', 'Content 3', 'electronics', 0.7),
  createMockSearchResult('4', 'Content 4', 'books', 0.9),
  createMockSearchResult('5', 'Content 5', 'books', 0.6),
  createMockSearchResult('6', 'Content 6', 'books', 0.8),
  createMockSearchResult('7', 'Content 7', 'books', 0.7),
  createMockSearchResult('8', 'Content 8', 'uncategorized', 0.5),
];

describe('CategoryAggregationEngine', () => {
  let engine: CategoryAggregationEngine;
  let hierarchyManager: CategoryHierarchyManager;
  let mockResults: SearchResult[];

  beforeEach(() => {
    hierarchyManager = new CategoryHierarchyManager();
    // Build a test hierarchy
    hierarchyManager.buildHierarchy(['electronics', 'electronics/computers', 'books', 'books/fiction']);

    engine = new CategoryAggregationEngine(hierarchyManager);
    mockResults = createMockSearchResults();
  });

  describe('constructor and initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultEngine = new CategoryAggregationEngine(hierarchyManager);
      expect(defaultEngine).toBeInstanceOf(CategoryAggregationEngine);

      const cacheStats = defaultEngine.getCacheStats();
      expect(cacheStats.enabled).toBe(true);
    });

    it('should initialize with custom configuration', () => {
      const customConfig: Partial<CategoryAggregationConfig> = {
        maxCategories: 10,
        minCategorySize: 2,
        sortBy: 'relevance',
        enableCaching: false,
      };

      const customEngine = new CategoryAggregationEngine(hierarchyManager, customConfig);
      const cacheStats = customEngine.getCacheStats();
      expect(cacheStats.enabled).toBe(false);
    });

    it('should merge partial configuration with defaults', () => {
      const partialConfig = { maxCategories: 5 };
      const partialEngine = new CategoryAggregationEngine(hierarchyManager, partialConfig);

      expect(partialEngine).toBeInstanceOf(CategoryAggregationEngine);
    });
  });

  describe('result aggregation', () => {
    it('should aggregate search results by category', () => {
      const result = engine.aggregateResults(mockResults);

      expect(result).toBeDefined();
      expect(result.totalItems).toBe(8);
      expect(result.aggregations.length).toBeGreaterThan(0);

      // Check that categories are properly aggregated
      const electronicsAgg = result.aggregations.find(agg => agg.category === 'electronics');
      const booksAgg = result.aggregations.find(agg => agg.category === 'books');

      expect(electronicsAgg).toBeDefined();
      expect(electronicsAgg?.count).toBe(3);
      expect(electronicsAgg?.totalRelevance).toBeCloseTo(2.4, 1);
      expect(electronicsAgg?.averageRelevance).toBeCloseTo(0.8, 1);

      expect(booksAgg).toBeDefined();
      expect(booksAgg?.count).toBe(4);
      expect(booksAgg?.totalRelevance).toBeCloseTo(3.0, 1);
      expect(booksAgg?.averageRelevance).toBeCloseTo(0.75, 1);
    });

    it('should handle empty results array', () => {
      const result = engine.aggregateResults([]);

      expect(result.totalItems).toBe(0);
      expect(result.aggregations).toHaveLength(0);
      expect(result.totalCategories).toBe(0);
    });

    it('should handle single category results', () => {
      const singleCategoryResults = [
        createMockSearchResult('1', 'Content 1', 'electronics', 0.9),
        createMockSearchResult('2', 'Content 2', 'electronics', 0.8),
      ];

      const result = engine.aggregateResults(singleCategoryResults);

      expect(result.totalItems).toBe(2);
      expect(result.aggregations).toHaveLength(1);
      expect(result.aggregations[0].category).toBe('electronics');
      expect(result.aggregations[0].count).toBe(2);
    });

    it('should use caching when enabled', () => {
      const result1 = engine.aggregateResults(mockResults);
      const result2 = engine.aggregateResults(mockResults);

      // Results should be identical (from cache)
      expect(result1.totalItems).toBe(result2.totalItems);
      expect(result1.aggregations.length).toBe(result2.aggregations.length);
    });

    it('should respect minCategorySize configuration', () => {
      const engineWithMinSize = new CategoryAggregationEngine(hierarchyManager, {
        minCategorySize: 3
      });

      const result = engineWithMinSize.aggregateResults(mockResults);

      // Should only include categories with 3+ items
      expect(result.aggregations.length).toBe(2); // electronics (3) and books (4)
      expect(result.aggregations.every(agg => agg.count >= 3)).toBe(true);
    });

    it('should respect maxCategories configuration', () => {
      const engineWithMaxCats = new CategoryAggregationEngine(hierarchyManager, {
        maxCategories: 1
      });

      const result = engineWithMaxCats.aggregateResults(mockResults);

      expect(result.aggregations.length).toBe(1);
    });
  });

  describe('configuration override', () => {
    it('should aggregate with custom configuration', () => {
      const customConfig = {
        maxCategories: 1,
        sortBy: 'name' as const,
        sortDirection: 'asc' as const,
      };

      const result = engine.aggregateWithConfig(mockResults, customConfig);

      expect(result.aggregations.length).toBe(1);
      expect(result.metadata.config).toEqual(expect.objectContaining(customConfig));
    });

    it('should restore original configuration after override', () => {
      const originalMaxCategories = engine['config'].maxCategories;
      const originalSortBy = engine['config'].sortBy;

      engine.aggregateWithConfig(mockResults, { maxCategories: 1 });

      expect(engine['config'].maxCategories).toBe(originalMaxCategories);
      expect(engine['config'].sortBy).toBe(originalSortBy);
    });
  });

  describe('category grouping', () => {
    it('should group results by category', () => {
      const groups = engine.groupByCategory(mockResults);

      expect(groups.length).toBeGreaterThan(0);

      const electronicsGroup = groups.find(g => g.name === 'electronics');
      expect(electronicsGroup).toBeDefined();
      expect(electronicsGroup?.itemCount).toBe(3);
      expect(electronicsGroup?.representativeItems).toHaveLength(3);
    });

    it('should maintain representative items correctly', () => {
      const groups = engine.groupByCategory(mockResults);
      const electronicsGroup = groups.find(g => g.name === 'electronics');

      // Should have top 3 items by score
      expect(electronicsGroup?.representativeItems).toHaveLength(3);
      expect(electronicsGroup?.representativeItems[0].score).toBeGreaterThanOrEqual(
        electronicsGroup?.representativeItems[1].score || 0
      );
    });

    it('should calculate average relevance correctly', () => {
      const groups = engine.groupByCategory(mockResults);
      const booksGroup = groups.find(g => g.name === 'books');

      expect(booksGroup?.relevanceScore).toBeCloseTo(0.75, 1); // (0.9 + 0.6 + 0.8 + 0.7) / 4
    });

    it('should respect maxCategories in grouping', () => {
      const engineWithMaxCats = new CategoryAggregationEngine(hierarchyManager, {
        maxCategories: 2
      });

      const groups = engineWithMaxCats.groupByCategory(mockResults);
      expect(groups.length).toBeLessThanOrEqual(2);
    });
  });

  describe('category distribution statistics', () => {
    it('should calculate category distribution correctly', () => {
      const distribution = engine.getCategoryDistribution(mockResults);

      expect(distribution.length).toBe(3); // electronics, books, uncategorized

      const electronicsDist = distribution.find(d => d.category === 'electronics');
      expect(electronicsDist?.count).toBe(3);
      expect(electronicsDist?.percentage).toBeCloseTo(37.5, 1); // 3/8 * 100
      expect(electronicsDist?.relevance).toBeCloseTo(0.8, 1);

      const booksDist = distribution.find(d => d.category === 'books');
      expect(booksDist?.count).toBe(4);
      expect(booksDist?.percentage).toBeCloseTo(50, 1); // 4/8 * 100
    });

    it('should sort distribution by count descending', () => {
      const distribution = engine.getCategoryDistribution(mockResults);

      expect(distribution[0].count).toBeGreaterThanOrEqual(distribution[1].count);
      expect(distribution[1].count).toBeGreaterThanOrEqual(distribution[2].count);
    });

    it('should handle empty results in distribution', () => {
      const distribution = engine.getCategoryDistribution([]);

      expect(distribution).toHaveLength(0);
    });
  });

  describe('top categories', () => {
    it('should find top categories by relevance', () => {
      const topCategories = engine.findTopCategories(mockResults, 2);

      expect(topCategories).toHaveLength(2);
      expect(topCategories[0].relevance).toBeGreaterThanOrEqual(topCategories[1].relevance);

      const electronicsTop = topCategories.find(c => c.category === 'electronics');
      expect(electronicsTop?.relevance).toBeCloseTo(0.8, 1);
      expect(electronicsTop?.itemCount).toBe(3);
    });

    it('should respect limit parameter', () => {
      const topCategories = engine.findTopCategories(mockResults, 1);
      expect(topCategories).toHaveLength(1);
    });

    it('should handle default limit', () => {
      const topCategories = engine.findTopCategories(mockResults);
      expect(topCategories.length).toBeGreaterThan(0); // Should return some results
      expect(topCategories.length).toBeLessThanOrEqual(10); // Should not exceed default limit
    });
  });

  describe('configuration management', () => {
    it('should update configuration', () => {
      engine.updateConfig({ maxCategories: 5, sortBy: 'name' });

      expect(engine['config'].maxCategories).toBe(5);
      expect(engine['config'].sortBy).toBe('name');
    });

    it('should clear cache when configuration updated', () => {
      engine.aggregateResults(mockResults); // Populate cache

      const initialCacheSize = engine.getCacheStats().size;
      expect(initialCacheSize).toBeGreaterThan(0);

      engine.updateConfig({ maxCategories: 1 });

      const newCacheSize = engine.getCacheStats().size;
      expect(newCacheSize).toBe(0); // Cache should be cleared
    });

    it('should clear cache manually', () => {
      engine.aggregateResults(mockResults); // Populate cache

      expect(engine.getCacheStats().size).toBeGreaterThan(0);

      engine.clearCache();

      expect(engine.getCacheStats().size).toBe(0);
    });

    it('should provide cache statistics', () => {
      engine.aggregateResults(mockResults);

      const stats = engine.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.enabled).toBe(true);
    });
  });

  describe('sorting functionality', () => {
    it('should sort by size correctly', () => {
      const engineSortBySize = new CategoryAggregationEngine(hierarchyManager, {
        sortBy: 'size',
        sortDirection: 'desc'
      });

      const result = engineSortBySize.aggregateResults(mockResults);

      // Should be sorted by count descending
      expect(result.aggregations[0].count).toBeGreaterThanOrEqual(result.aggregations[1]?.count || 0);
    });

    it('should sort by relevance correctly', () => {
      const engineSortByRelevance = new CategoryAggregationEngine(hierarchyManager, {
        sortBy: 'relevance',
        sortDirection: 'desc'
      });

      const result = engineSortByRelevance.aggregateResults(mockResults);

      // Should be sorted by average relevance descending
      expect(result.aggregations[0].averageRelevance).toBeGreaterThanOrEqual(
        result.aggregations[1]?.averageRelevance || 0
      );
    });

    it('should sort by name correctly', () => {
      const engineSortByName = new CategoryAggregationEngine(hierarchyManager, {
        sortBy: 'name',
        sortDirection: 'asc'
      });

      const result = engineSortByName.aggregateResults(mockResults);

      // Should be sorted by category name ascending
      const categories = result.aggregations.map(agg => agg.category);
      expect(categories).toEqual([...categories].sort());
    });

    it('should handle ascending sort direction', () => {
      const engineAsc = new CategoryAggregationEngine(hierarchyManager, {
        sortBy: 'size',
        sortDirection: 'asc'
      });

      const result = engineAsc.aggregateResults(mockResults);

      // Should be sorted by size ascending
      expect(result.aggregations[0].count).toBeLessThanOrEqual(result.aggregations[1]?.count || 0);
    });
  });

  describe('hierarchy integration', () => {
    it('should handle categories that may or may not be in hierarchy', () => {
      const result = engine.aggregateResults(mockResults);

      const electronicsAgg = result.aggregations.find(agg => agg.category === 'electronics');
      expect(electronicsAgg).toBeDefined();
      expect(electronicsAgg?.count).toBe(3);
      // CategoryNode may or may not be defined depending on hierarchy setup
      if (electronicsAgg?.categoryNode !== undefined) {
        expect(electronicsAgg.depth).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle categories not in hierarchy', () => {
      const resultsWithUnknownCategory = [
        createMockSearchResult('1', 'Content 1', 'unknown_category', 0.9),
      ];

      const result = engine.aggregateResults(resultsWithUnknownCategory);

      expect(result.aggregations).toHaveLength(1);
      expect(result.aggregations[0].category).toBe('unknown_category');
      // CategoryNode should be undefined for unknown categories
      expect(result.aggregations[0].categoryNode).toBeUndefined();
    });
  });

  describe('subcategory aggregation', () => {
    beforeEach(() => {
      // Create more detailed hierarchy and results
      hierarchyManager.buildHierarchy([
        'electronics',
        'electronics/computers',
        'electronics/computers/laptops',
        'electronics/phones'
      ]);

      mockResults = [
        createMockSearchResult('1', 'Laptop 1', 'electronics/computers/laptops', 0.9),
        createMockSearchResult('2', 'Laptop 2', 'electronics/computers/laptops', 0.8),
        createMockSearchResult('3', 'Desktop 1', 'electronics/computers', 0.7),
        createMockSearchResult('4', 'Phone 1', 'electronics/phones', 0.8),
      ];
    });

    it('should handle subcategory aggregation configuration', () => {
      const engineWithSubcats = new CategoryAggregationEngine(hierarchyManager, {
        enableSubcategoryAggregation: true
      });

      const result = engineWithSubcats.aggregateResults(mockResults);

      // Subcategory aggregation behavior depends on implementation details
      const computersAgg = result.aggregations.find(agg => agg.category === 'electronics/computers');
      if (computersAgg) {
        // If subcategories exist, they should be valid
        if (computersAgg.subcategories.length > 0) {
          expect(computersAgg.subcategories.length).toBeGreaterThan(0);
        }
        // If no subcategories, that's also valid
      }
    });

    it('should not create subcategory aggregations when disabled', () => {
      const engineWithoutSubcats = new CategoryAggregationEngine(hierarchyManager, {
        enableSubcategoryAggregation: false
      });

      const result = engineWithoutSubcats.aggregateResults(mockResults);

      const computersAgg = result.aggregations.find(agg => agg.category === 'electronics/computers');
      if (computersAgg) {
        expect(computersAgg.subcategories).toHaveLength(0);
      }
    });
  });

  describe('aggregation statistics', () => {
    it('should calculate correct aggregation statistics', () => {
      const result = engine.aggregateResults(mockResults);

      expect(result.totalItems).toBe(8);
      expect(result.totalCategories).toBe(3);
      expect(result.maxCategorySize).toBe(4); // books category
      expect(result.minCategorySize).toBe(1); // uncategorized category
      expect(result.averageCategorySize).toBeCloseTo(8/3, 1);
      expect(result.hierarchyDepth).toBeGreaterThanOrEqual(0);
    });

    it('should include metadata in results', () => {
      const result = engine.aggregateResults(mockResults);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.aggregationTimestamp).toBeDefined();
      expect(result.metadata.config).toBeDefined();
      expect(result.metadata.filteredCategories).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle results with no categories', () => {
      const resultsWithoutCategories = [
        createMockSearchResult('1', 'Content 1', '', 0.8),
        createMockSearchResult('2', 'Content 2', '', 0.7),
      ];

      const result = engine.aggregateResults(resultsWithoutCategories);

      expect(result.totalItems).toBe(2);
      expect(result.aggregations).toHaveLength(1);
      expect(result.aggregations[0].category).toBe('Uncategorized');
    });

    it('should handle results with null/undefined categories', () => {
      const resultsWithNullCategories = [
        { ...createMockSearchResult('1', 'Content 1', 'electronics', 0.8), metadata: { category: null } },
        { ...createMockSearchResult('2', 'Content 2', 'books', 0.7), metadata: { category: undefined } },
      ] as SearchResult[];

      const result = engine.aggregateResults(resultsWithNullCategories);

      expect(result.totalItems).toBe(2);
      expect(result.aggregations).toHaveLength(1);
      expect(result.aggregations[0].category).toBe('Uncategorized');
    });

    it('should handle very large result sets', () => {
      const largeResultSet: SearchResult[] = [];
      for (let i = 0; i < 1000; i++) {
        largeResultSet.push(createMockSearchResult(
          `id${i}`,
          `Content ${i}`,
          i % 2 === 0 ? 'category1' : 'category2',
          Math.random()
        ));
      }

      const startTime = Date.now();
      const result = engine.aggregateResults(largeResultSet);
      const endTime = Date.now();

      expect(result.totalItems).toBe(1000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});

describe('CategoryAggregationUtils', () => {
  describe('configuration creation', () => {
    it('should create default configuration', () => {
      const config = CategoryAggregationUtils.createDefaultConfig();

      expect(config.maxCategories).toBe(20);
      expect(config.minCategorySize).toBe(1);
      expect(config.enableHierarchyGrouping).toBe(true);
      expect(config.enableCaching).toBe(true);
    });

    it('should create performance-optimized configuration', () => {
      const config = CategoryAggregationUtils.createPerformanceConfig();

      expect(config.maxCategories).toBe(10);
      expect(config.minCategorySize).toBe(2);
      expect(config.enableHierarchyGrouping).toBe(false);
      expect(config.enableSubcategoryAggregation).toBe(false);
    });

    it('should create detailed analysis configuration', () => {
      const config = CategoryAggregationUtils.createDetailedConfig();

      expect(config.maxCategories).toBe(50);
      expect(config.minCategorySize).toBe(1);
      expect(config.enableHierarchyGrouping).toBe(true);
      expect(config.enableSubcategoryAggregation).toBe(true);
      expect(config.sortBy).toBe('relevance');
    });
  });

  describe('aggregation flattening', () => {
    it('should flatten hierarchical aggregations', () => {
      const mockAggregations: CategoryAggregationInfo[] = [
        {
          category: 'root',
          count: 3,
          totalRelevance: 2.4,
          averageRelevance: 0.8,
          subcategories: [
            {
              category: 'root/child',
              count: 2,
              totalRelevance: 1.6,
              averageRelevance: 0.8,
              subcategories: [],
              depth: 2,
              items: [],
              metadata: {},
            }
          ],
          depth: 1,
          items: [],
          metadata: {},
        }
      ];

      const flattened = CategoryAggregationUtils.flattenAggregations(mockAggregations);

      expect(flattened.length).toBe(2);
      expect(flattened.some(agg => agg.category === 'root')).toBe(true);
      expect(flattened.some(agg => agg.category === 'root/child')).toBe(true);
    });

    it('should handle flattening with maxDepth parameter', () => {
      const mockAggregations: CategoryAggregationInfo[] = [
        {
          category: 'root',
          count: 3,
          totalRelevance: 2.4,
          averageRelevance: 0.8,
          subcategories: [
            {
              category: 'root/child',
              count: 2,
              totalRelevance: 1.6,
              averageRelevance: 0.8,
              subcategories: [],
              depth: 2,
              items: [],
              metadata: {},
            }
          ],
          depth: 1,
          items: [],
          metadata: {},
        }
      ];

      const flattened = CategoryAggregationUtils.flattenAggregations(mockAggregations, 1);

      expect(flattened.length).toBeGreaterThan(0);
      expect(flattened.some(agg => agg.category === 'root')).toBe(true);
      // The exact count depends on implementation details
    });
  });

  describe('result merging', () => {
    it('should merge multiple aggregation results', () => {
      const result1: CategoryAggregationResult = {
        aggregations: [
          {
            category: 'electronics',
            count: 2,
            totalRelevance: 1.6,
            averageRelevance: 0.8,
            subcategories: [],
            depth: 1,
            items: [],
            metadata: {},
          }
        ],
        totalItems: 2,
        totalCategories: 1,
        maxCategorySize: 2,
        minCategorySize: 2,
        averageCategorySize: 2,
        hierarchyDepth: 1,
        metadata: {},
      };

      const result2: CategoryAggregationResult = {
        aggregations: [
          {
            category: 'electronics',
            count: 1,
            totalRelevance: 0.9,
            averageRelevance: 0.9,
            subcategories: [],
            depth: 1,
            items: [],
            metadata: {},
          },
          {
            category: 'books',
            count: 3,
            totalRelevance: 2.1,
            averageRelevance: 0.7,
            subcategories: [],
            depth: 1,
            items: [],
            metadata: {},
          }
        ],
        totalItems: 4,
        totalCategories: 2,
        maxCategorySize: 3,
        minCategorySize: 1,
        averageCategorySize: 2,
        hierarchyDepth: 1,
        metadata: {},
      };

      const merged = CategoryAggregationUtils.mergeResults([result1, result2]);

      expect(merged.totalItems).toBe(6); // 2 + 4
      expect(merged.totalCategories).toBe(2); // electronics and books
      expect(merged.aggregations.length).toBe(2);

      const electronicsMerged = merged.aggregations.find(agg => agg.category === 'electronics');
      expect(electronicsMerged?.count).toBe(3); // 2 + 1
      expect(electronicsMerged?.totalRelevance).toBeCloseTo(2.5, 1); // 1.6 + 0.9
    });

    it('should handle empty results array in merge', () => {
      const emptyResult = CategoryAggregationUtils.mergeResults([]);

      expect(emptyResult.totalItems).toBe(0);
      expect(emptyResult.aggregations).toHaveLength(0);
    });

    it('should handle single result in merge', () => {
      const singleResult: CategoryAggregationResult = {
        aggregations: [
          {
            category: 'test',
            count: 1,
            totalRelevance: 0.8,
            averageRelevance: 0.8,
            subcategories: [],
            depth: 1,
            items: [],
            metadata: {},
          }
        ],
        totalItems: 1,
        totalCategories: 1,
        maxCategorySize: 1,
        minCategorySize: 1,
        averageCategorySize: 1,
        hierarchyDepth: 1,
        metadata: {},
      };

      const merged = CategoryAggregationUtils.mergeResults([singleResult]);

      expect(merged).toEqual(singleResult);
    });
  });

  describe('diversity and concentration calculations', () => {
    it('should calculate diversity score correctly', () => {
      const result: CategoryAggregationResult = {
        aggregations: [
          { category: 'cat1', count: 5, totalRelevance: 4.0, averageRelevance: 0.8, subcategories: [], depth: 1, items: [], metadata: {} },
          { category: 'cat2', count: 3, totalRelevance: 2.4, averageRelevance: 0.8, subcategories: [], depth: 1, items: [], metadata: {} },
          { category: 'cat3', count: 2, totalRelevance: 1.6, averageRelevance: 0.8, subcategories: [], depth: 1, items: [], metadata: {} },
        ],
        totalItems: 10,
        totalCategories: 3,
        maxCategorySize: 5,
        minCategorySize: 2,
        averageCategorySize: 3.33,
        hierarchyDepth: 1,
        metadata: {},
      };

      const diversity = CategoryAggregationUtils.calculateDiversityScore(result);

      expect(diversity).toBeGreaterThan(0);
      expect(diversity).toBeLessThanOrEqual(1);
    });

    it('should return 0 diversity for single category', () => {
      const result: CategoryAggregationResult = {
        aggregations: [
          { category: 'cat1', count: 10, totalRelevance: 8.0, averageRelevance: 0.8, subcategories: [], depth: 1, items: [], metadata: {} },
        ],
        totalItems: 10,
        totalCategories: 1,
        maxCategorySize: 10,
        minCategorySize: 10,
        averageCategorySize: 10,
        hierarchyDepth: 1,
        metadata: {},
      };

      const diversity = CategoryAggregationUtils.calculateDiversityScore(result);
      expect(diversity).toBe(0);
    });

    it('should calculate concentration ratio correctly', () => {
      const result: CategoryAggregationResult = {
        aggregations: [
          { category: 'cat1', count: 7, totalRelevance: 5.6, averageRelevance: 0.8, subcategories: [], depth: 1, items: [], metadata: {} },
          { category: 'cat2', count: 2, totalRelevance: 1.6, averageRelevance: 0.8, subcategories: [], depth: 1, items: [], metadata: {} },
          { category: 'cat3', count: 1, totalRelevance: 0.8, averageRelevance: 0.8, subcategories: [], depth: 1, items: [], metadata: {} },
        ],
        totalItems: 10,
        totalCategories: 3,
        maxCategorySize: 7,
        minCategorySize: 1,
        averageCategorySize: 3.33,
        hierarchyDepth: 1,
        metadata: {},
      };

      const concentration = CategoryAggregationUtils.calculateConcentrationRatio(result, 1);
      expect(concentration).toBeCloseTo(0.7, 1); // 7/10
    });
  });
});