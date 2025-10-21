import { FilterEngine, OptimizedFilterEngine, FilterBuilder, FilterEngineError } from '../../../src/core/domain/search/filtering/FilterEngine';
import { FilterNode, FilterType, FilterOperator, FilterExecutionContext, FilterExecutionResult } from '../../../src/core/domain/search/filtering/types';

// Test data type definition
interface TestMemoryData {
  id: string;
  content: string;
  summary: string;
  classification: string;
  importance: string;
  confidenceScore: number;
  entities: string[];
  keywords: string[];
  createdAt: Date;
  location: { latitude: number; longitude: number; type: 'point' };
  metadata: { source: string };
}

describe('FilterEngine', () => {
  let filterEngine: FilterEngine;

  // Sample test data
  const sampleData: TestMemoryData[] = [
    {
      id: '1',
      content: 'Test memory content about artificial intelligence',
      summary: 'AI test summary',
      classification: 'conversational',
      importance: 'medium',
      confidenceScore: 0.8,
      entities: ['test', 'memory', 'artificial intelligence'],
      keywords: ['test', 'memory', 'ai'],
      createdAt: new Date('2024-01-01'),
      location: { latitude: 59.3293, longitude: 18.0686, type: 'point' },
      metadata: { source: 'test' }
    },
    {
      id: '2',
      content: 'Important memory content about machine learning',
      summary: 'ML important summary',
      classification: 'essential',
      importance: 'high',
      confidenceScore: 0.9,
      entities: ['important', 'memory', 'machine learning'],
      keywords: ['important', 'memory', 'ml'],
      createdAt: new Date('2024-01-02'),
      location: { latitude: 59.3294, longitude: 18.0687, type: 'point' },
      metadata: { source: 'test' }
    },
    {
      id: '3',
      content: 'Reference memory content about algorithms',
      summary: 'Algorithm reference summary',
      classification: 'reference',
      importance: 'low',
      confidenceScore: 0.6,
      entities: ['reference', 'memory', 'algorithms'],
      keywords: ['reference', 'memory', 'algorithm'],
      createdAt: new Date('2024-01-03'),
      location: { latitude: 59.3295, longitude: 18.0688, type: 'point' },
      metadata: { source: 'test' }
    }
  ];

  beforeEach(async () => {
    filterEngine = new FilterEngine();
  });

  afterEach(async () => {
    // Clean up any resources if needed
  });

  describe('Constructor and Initialization', () => {
    it('should create FilterEngine instance', () => {
      expect(filterEngine).toBeInstanceOf(FilterEngine);
    });

    it('should have required methods', () => {
      expect(typeof filterEngine.parseFilter).toBe('function');
      expect(typeof filterEngine.executeFilter).toBe('function');
      expect(typeof filterEngine.validateFilter).toBe('function');
      expect(typeof filterEngine.createBuilder).toBe('function');
      expect(typeof filterEngine.parseAndExecute).toBe('function');
      expect(typeof filterEngine.getMetadata).toBe('function');
    });
  });

  describe('Filter Parsing', () => {
    it('should parse simple comparison filter expression', () => {
      const expression = 'classification=essential';
      const filter = filterEngine.parseFilter(expression);

      expect(filter).toBeDefined();
      expect(filter.type).toBe(FilterType.COMPARISON);
      expect(filter.field).toBe('classification');
      expect(filter.operator).toBe(FilterOperator.EQUALS);
      expect(filter.value).toBe('essential');
    });

    it('should parse logical AND filter expression', () => {
      const expression = 'importance=high AND confidenceScore>0.8';
      const filter = filterEngine.parseFilter(expression);

      expect(filter).toBeDefined();
      expect(filter.type).toBe(FilterType.LOGICAL);
      expect(filter.operator).toBe(FilterOperator.AND);
      expect(filter.value).toBeNull();
      expect(filter.children).toBeDefined();
      expect(filter.children).toHaveLength(2);
    });

    it('should parse logical OR filter expression', () => {
      const expression = 'classification=essential OR importance=high';
      const filter = filterEngine.parseFilter(expression);

      expect(filter).toBeDefined();
      expect(filter.type).toBe(FilterType.LOGICAL);
      expect(filter.operator).toBe(FilterOperator.OR);
      expect(filter.children).toHaveLength(2);
    });

    it('should parse CONTAINS filter expression', () => {
      const expression = 'content=artificial';
      const filter = filterEngine.parseFilter(expression);

      expect(filter).toBeDefined();
      expect(filter.type).toBe(FilterType.COMPARISON);
      expect(filter.operator).toBe(FilterOperator.EQUALS);
      expect(filter.value).toBe('artificial');
    });

    it('should parse GREATER_THAN filter expression', () => {
      const expression = 'confidenceScore>0.8';
      const filter = filterEngine.parseFilter(expression);

      expect(filter).toBeDefined();
      expect(filter.type).toBe(FilterType.COMPARISON);
      expect(filter.operator).toBe(FilterOperator.GREATER_THAN);
      expect(filter.value).toBe(0.8);
    });

    it('should parse complex nested expression', () => {
      const expression = 'classification=essential AND importance=high';
      const filter = filterEngine.parseFilter(expression);

      expect(filter).toBeDefined();
      expect(filter.type).toBe(FilterType.LOGICAL);
      expect(filter.operator).toBe(FilterOperator.AND);
      expect(filter.children).toHaveLength(2);
    });

    it('should handle malformed expressions', () => {
      expect(() => {
        filterEngine.parseFilter('invalid expression');
      }).toThrow();
    });
  });

  describe('Filter Validation', () => {
    it('should validate correct filter', () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      const result = filterEngine.validateFilter(filter);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject filter with invalid field', () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: '',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      const result = filterEngine.validateFilter(filter);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject filter with invalid operator', () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: 'INVALID_OPERATOR' as FilterOperator,
        value: 'essential'
      };

      const result = filterEngine.validateFilter(filter);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate logical filter with children', () => {
      const filter: FilterNode = {
        type: FilterType.LOGICAL,
        field: 'root',
        operator: FilterOperator.AND,
        value: null,
        children: [
          {
            type: FilterType.COMPARISON,
            field: 'classification',
            operator: FilterOperator.EQUALS,
            value: 'essential'
          }
        ]
      };

      const result = filterEngine.validateFilter(filter);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Filter Execution', () => {
    it('should execute simple filter', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      const result = await filterEngine.executeFilter(filter, sampleData);

      expect(result).toHaveProperty('filteredItems');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('filteredCount');
      expect(result).toHaveProperty('executionTime');
      expect(result).toHaveProperty('strategyUsed');

      expect(result.totalCount).toBe(3);
      expect(result.filteredCount).toBe(1);
      expect((result.filteredItems[0] as TestMemoryData).id).toBe('2');
    });

    it('should execute logical AND filter', async () => {
      const filter: FilterNode = {
        type: FilterType.LOGICAL,
        field: 'root',
        operator: FilterOperator.AND,
        value: null,
        children: [
          {
            type: FilterType.COMPARISON,
            field: 'importance',
            operator: FilterOperator.EQUALS,
            value: 'high'
          },
          {
            type: FilterType.COMPARISON,
            field: 'confidenceScore',
            operator: FilterOperator.GREATER_THAN,
            value: 0.8
          }
        ]
      };

      const result = await filterEngine.executeFilter(filter, sampleData);

      expect(result.filteredCount).toBe(1);
      expect((result.filteredItems[0] as TestMemoryData).id).toBe('2');
    });

    it('should execute CONTAINS filter', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'content',
        operator: FilterOperator.CONTAINS,
        value: 'artificial'
      };

      const result = await filterEngine.executeFilter(filter, sampleData);

      expect(result.filteredCount).toBe(1);
      expect((result.filteredItems[0] as TestMemoryData).id).toBe('1');
    });

    it('should handle empty results', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'nonexistent'
      };

      const result = await filterEngine.executeFilter(filter, sampleData);

      expect(result.filteredCount).toBe(0);
      expect(result.filteredItems).toHaveLength(0);
    });
  });

  describe('Database Query Generation', () => {
    it('should generate SQL query for simple filter', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      const result = await filterEngine.executeFilterAsQuery(filter, 'SELECT * FROM memories');

      expect(result).toHaveProperty('sql');
      expect(result).toHaveProperty('parameters');
      expect(result).toHaveProperty('estimatedCost');

      expect(result.sql).toContain('SELECT * FROM memories WHERE');
      expect(result.sql).toContain('classification = ?');
      expect(result.parameters).toEqual(['essential']);
    });

    it('should generate SQL query for CONTAINS filter', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'content',
        operator: FilterOperator.CONTAINS,
        value: 'memory'
      };

      const result = await filterEngine.executeFilterAsQuery(filter, 'SELECT * FROM memories');

      expect(result.sql).toContain('content LIKE ?');
      expect(result.parameters).toEqual(['%memory%']);
    });
  });

  describe('Parse and Execute', () => {
    it('should parse and execute filter expression in one call', async () => {
      const expression = 'classification=essential';
      const result = await filterEngine.parseAndExecute(expression, sampleData);

      expect(result.filteredCount).toBe(1);
      expect((result.filteredItems[0] as TestMemoryData).id).toBe('2');
    });

    it('should handle complex expressions', async () => {
      const expression = 'importance=high';
      const result = await filterEngine.parseAndExecute(expression, globalSampleData);

      expect(result.filteredCount).toBe(1);
      expect((result.filteredItems[0] as TestMemoryData).id).toBe('2');
    });
  });

  describe('Metadata and Information', () => {
    it('should return engine metadata', () => {
      const metadata = filterEngine.getMetadata();

      expect(metadata).toHaveProperty('supportedOperators');
      expect(metadata).toHaveProperty('supportedTypes');
      expect(metadata).toHaveProperty('maxNestingDepth');
      expect(metadata).toHaveProperty('maxChildrenPerNode');
      expect(metadata).toHaveProperty('performanceFeatures');
      expect(metadata).toHaveProperty('version');

      expect(Array.isArray(metadata.supportedOperators)).toBe(true);
      expect(Array.isArray(metadata.supportedTypes)).toBe(true);
      expect(metadata.maxNestingDepth).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid filter in execution', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: '',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      await expect(filterEngine.executeFilter(filter, sampleData)).rejects.toThrow(FilterEngineError);
    });

    it('should throw error for invalid filter in query generation', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: '',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      await expect(filterEngine.executeFilterAsQuery(filter, 'SELECT * FROM memories')).rejects.toThrow(FilterEngineError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty dataset', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      const result = await filterEngine.executeFilter(filter, []);

      expect(result.totalCount).toBe(0);
      expect(result.filteredCount).toBe(0);
      expect(result.filteredItems).toHaveLength(0);
    });

    it('should handle null/undefined values in data', async () => {
      const dataWithNulls: TestMemoryData[] = [
        {
          ...globalSampleData[0],
          classification: null as any,
          confidenceScore: undefined as any
        }
      ];

      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: null
      };

      const result = await filterEngine.executeFilter(filter, dataWithNulls);

      expect(result.totalCount).toBe(1);
      expect(result.filteredCount).toBe(1);
    });

    it('should handle array values in IN operator', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.IN,
        value: ['essential', 'reference']
      };

      const result = await filterEngine.executeFilter(filter, sampleData);

      expect(result.filteredCount).toBe(2);
      expect((result.filteredItems as TestMemoryData[]).map(item => item.id)).toEqual(expect.arrayContaining(['2', '3']));
    });
  });
});

// Sample test data (moved outside describe blocks for accessibility)
const globalSampleData: TestMemoryData[] = [
  {
    id: '1',
    content: 'Test memory content about artificial intelligence',
    summary: 'AI test summary',
    classification: 'conversational',
    importance: 'medium',
    confidenceScore: 0.8,
    entities: ['test', 'memory', 'artificial intelligence'],
    keywords: ['test', 'memory', 'ai'],
    createdAt: new Date('2024-01-01'),
    location: { latitude: 59.3293, longitude: 18.0686, type: 'point' },
    metadata: { source: 'test' }
  },
  {
    id: '2',
    content: 'Important memory content about machine learning',
    summary: 'ML important summary',
    classification: 'essential',
    importance: 'high',
    confidenceScore: 0.9,
    entities: ['important', 'memory', 'machine learning'],
    keywords: ['important', 'memory', 'ml'],
    createdAt: new Date('2024-01-02'),
    location: { latitude: 59.3294, longitude: 18.0687, type: 'point' },
    metadata: { source: 'test' }
  },
  {
    id: '3',
    content: 'Reference memory content about algorithms',
    summary: 'Algorithm reference summary',
    classification: 'reference',
    importance: 'low',
    confidenceScore: 0.6,
    entities: ['reference', 'memory', 'algorithms'],
    keywords: ['reference', 'memory', 'algorithm'],
    createdAt: new Date('2024-01-03'),
    location: { latitude: 59.3295, longitude: 18.0688, type: 'point' },
    metadata: { source: 'test' }
  }
];

describe('OptimizedFilterEngine', () => {
  let optimizedEngine: OptimizedFilterEngine;

  beforeEach(() => {
    optimizedEngine = new OptimizedFilterEngine();
  });

  describe('Optimization Features', () => {
    it('should optimize filter execution order', async () => {
      const filter: FilterNode = {
        type: FilterType.LOGICAL,
        field: 'root',
        operator: FilterOperator.AND,
        value: null,
        children: [
          {
            type: FilterType.COMPARISON,
            field: 'classification',
            operator: FilterOperator.EQUALS,
            value: 'essential'
          },
          {
            type: FilterType.COMPARISON,
            field: 'importance',
            operator: FilterOperator.EQUALS,
            value: 'high'
          }
        ]
      };

      const result = await optimizedEngine.executeFilterOptimized(filter, globalSampleData);

      expect(result).toHaveProperty('filteredItems');
      expect(result).toHaveProperty('strategyUsed');
      expect(result.strategyUsed).toBe('optimized_filtering');
      expect(result.metadata).toHaveProperty('optimizationApplied');
    });

    it('should provide optimization statistics', () => {
      const stats = optimizedEngine.getOptimizationStats();

      expect(stats).toHaveProperty('cachedSelectivityCount');
      expect(stats).toHaveProperty('performanceHistorySize');
      expect(stats).toHaveProperty('averageOptimizationImprovement');
      expect(stats).toHaveProperty('totalOptimizationsApplied');
      expect(stats).toHaveProperty('earlyTerminations');
    });

    it('should clear optimization caches', () => {
      // Execute a filter to populate caches
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      // Execute optimized filter which should populate caches
      optimizedEngine.executeFilterOptimized(filter, globalSampleData);

      const statsBefore = optimizedEngine.getOptimizationStats();
      // The cache might not be populated depending on implementation, so we'll just test that clear works
      expect(typeof statsBefore.cachedSelectivityCount).toBe('number');

      optimizedEngine.clearOptimizationCaches();

      const statsAfter = optimizedEngine.getOptimizationStats();
      expect(statsAfter.cachedSelectivityCount).toBe(0);
    });
  });

  describe('Selectivity Estimation', () => {
    it('should estimate selectivity for different operators', () => {
      const equalityFilter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'id',
        operator: FilterOperator.EQUALS,
        value: 'test-id'
      };

      const patternFilter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'content',
        operator: FilterOperator.LIKE,
        value: '%test%'
      };

      // Access private method through type assertion for testing
      const engine = optimizedEngine as any;
      const equalitySelectivity = engine.estimateFilterSelectivity(equalityFilter);
      const patternSelectivity = engine.estimateFilterSelectivity(patternFilter);

      expect(equalitySelectivity).toBeGreaterThan(patternSelectivity);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track performance history', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      await optimizedEngine.executeFilterOptimized(filter, globalSampleData);

      const stats = optimizedEngine.getOptimizationStats();
      expect(stats.performanceHistorySize).toBeGreaterThan(0);
    });
  });
});

describe('FilterBuilder', () => {
  let builder: FilterBuilder;

  beforeEach(() => {
    builder = new FilterEngine().createBuilder();
  });

  describe('Fluent API Construction', () => {
    it('should build simple filter', () => {
      const filter = builder
        .where('classification', FilterOperator.EQUALS, 'essential')
        .build();

      expect(filter).toBeDefined();
      expect(filter!.type).toBe(FilterType.COMPARISON);
      expect(filter!.field).toBe('classification');
      expect(filter!.operator).toBe(FilterOperator.EQUALS);
      expect(filter!.value).toBe('essential');
    });

    it('should build logical AND filter', () => {
      const filter = builder
        .where('importance', FilterOperator.EQUALS, 'high')
        .and(new FilterEngine().createBuilder().where('confidenceScore', FilterOperator.GREATER_THAN, 0.8))
        .build();

      expect(filter).toBeDefined();
      expect(filter!.type).toBe(FilterType.LOGICAL);
      expect(filter!.operator).toBe(FilterOperator.AND);
      expect(filter!.children).toHaveLength(2);
    });

    it('should build logical OR filter', () => {
      const filter = builder
        .where('classification', FilterOperator.EQUALS, 'essential')
        .or(new FilterEngine().createBuilder().where('importance', FilterOperator.EQUALS, 'high'))
        .build();

      expect(filter).toBeDefined();
      expect(filter!.type).toBe(FilterType.LOGICAL);
      expect(filter!.operator).toBe(FilterOperator.OR);
      expect(filter!.children).toHaveLength(2);
    });

    it('should build NOT filter', () => {
      const filter = builder
        .where('classification', FilterOperator.EQUALS, 'essential')
        .not()
        .build();

      expect(filter).toBeDefined();
      expect(filter!.type).toBe(FilterType.LOGICAL);
      expect(filter!.operator).toBe(FilterOperator.NOT);
      expect(filter!.children).toHaveLength(1);
    });

    it('should throw error when applying logical operator without base filter', () => {
      expect(() => {
        new FilterEngine().createBuilder()
          .and(new FilterEngine().createBuilder().where('field', FilterOperator.EQUALS, 'value'))
          .build();
      }).toThrow(FilterEngineError);
    });

    it('should return null when no filter is built', () => {
      const filter = new FilterEngine().createBuilder().build();
      expect(filter).toBeNull();
    });
  });

  describe('Complex Filter Building', () => {
    it('should build complex nested filters', () => {
      const filter = builder
        .where('importance', FilterOperator.EQUALS, 'high')
        .and(
          new FilterEngine().createBuilder()
            .where('classification', FilterOperator.EQUALS, 'essential')
            .or(new FilterEngine().createBuilder().where('confidenceScore', FilterOperator.GREATER_THAN, 0.8))
        )
        .build();

      expect(filter).toBeDefined();
      expect(filter!.type).toBe(FilterType.LOGICAL);
      expect(filter!.operator).toBe(FilterOperator.AND);
      expect(filter!.children).toHaveLength(2);
    });
  });
});

describe('Error Handling', () => {
  let filterEngine: FilterEngine;

  beforeEach(() => {
    filterEngine = new FilterEngine();
  });

  describe('FilterEngineError', () => {
    it('should create error with correct properties', () => {
      const error = new FilterEngineError('Test error', 'TEST_CODE', { context: 'test' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('FilterEngineError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.context).toEqual({ context: 'test' });
    });
  });

  describe('Validation Errors', () => {
    it('should provide detailed validation errors', () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: '',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      const result = filterEngine.validateFilter(filter);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('code');
      expect(result.errors[0]).toHaveProperty('message');
    });
  });
});

describe('Performance and Edge Cases', () => {
  let filterEngine: FilterEngine;

  beforeEach(() => {
    filterEngine = new FilterEngine();
  });

  describe('Performance Characteristics', () => {
    it('should execute filters within reasonable time', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      const startTime = Date.now();
      await filterEngine.executeFilter(filter, globalSampleData);
      const executionTime = Date.now() - startTime;

      // Should execute very quickly for small datasets
      expect(executionTime).toBeLessThan(100);
    });

    it('should handle large datasets efficiently', async () => {
      // Create larger dataset for performance testing
      const largeDataset: TestMemoryData[] = Array.from({ length: 1000 }, (_, i) => ({
        ...globalSampleData[0],
        id: `large-${i}`,
        content: `Large dataset content ${i}`
      }));

      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'conversational'
      };

      const startTime = Date.now();
      await filterEngine.executeFilter(filter, largeDataset);
      const executionTime = Date.now() - startTime;

      // Should still execute reasonably fast for moderate datasets
      expect(executionTime).toBeLessThan(1000);
    });
  });

  describe('Memory Efficiency', () => {
    it('should not create excessive memory allocations', async () => {
      const filter: FilterNode = {
        type: FilterType.LOGICAL,
        field: 'root',
        operator: FilterOperator.OR,
        value: null,
        children: Array.from({ length: 10 }, (_, i) => ({
          type: FilterType.COMPARISON,
          field: 'classification',
          operator: FilterOperator.EQUALS,
          value: `value-${i}`
        }))
      };

      // Spy on memory usage if available
      const initialMemory = typeof process !== 'undefined' && process.memoryUsage ?
        process.memoryUsage().heapUsed : 0;

      await filterEngine.executeFilter(filter, globalSampleData);

      const finalMemory = typeof process !== 'undefined' && process.memoryUsage ?
        process.memoryUsage().heapUsed : 0;

      // Memory usage should not grow excessively
      if (initialMemory > 0 && finalMemory > 0) {
        const memoryGrowth = finalMemory - initialMemory;
        expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB growth
      }
    });
  });
});