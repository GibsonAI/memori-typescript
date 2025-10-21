import { FilterExecutor } from '../../../src/core/domain/search/filtering/FilterExecutor';
import { FilterNode, FilterType, FilterOperator, FilterExecutionContext } from '../../../src/core/domain/search/filtering/types';

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

describe('FilterExecutor', () => {
  let filterExecutor: FilterExecutor;

  // Sample test data
  const sampleData: TestMemoryData[] = [
    {
      id: '1',
      content: 'Test memory content',
      summary: 'Test summary',
      classification: 'conversational',
      importance: 'medium',
      confidenceScore: 0.8,
      entities: ['test', 'memory'],
      keywords: ['test', 'memory'],
      createdAt: new Date('2024-01-01'),
      location: { latitude: 59.3293, longitude: 18.0686, type: 'point' as const },
      metadata: { source: 'test' }
    },
    {
      id: '2',
      content: 'Important memory content',
      summary: 'Important summary',
      classification: 'essential',
      importance: 'high',
      confidenceScore: 0.9,
      entities: ['important', 'memory'],
      keywords: ['important', 'memory'],
      createdAt: new Date('2024-01-02'),
      location: { latitude: 59.3294, longitude: 18.0687, type: 'point' as const },
      metadata: { source: 'test' }
    },
    {
      id: '3',
      content: 'Reference memory content',
      summary: 'Reference summary',
      classification: 'reference',
      importance: 'low',
      confidenceScore: 0.6,
      entities: ['reference', 'memory'],
      keywords: ['reference', 'memory'],
      createdAt: new Date('2024-01-03'),
      location: { latitude: 59.3295, longitude: 18.0688, type: 'point' as const },
      metadata: { source: 'test' }
    }
  ];

  beforeEach(async () => {
    filterExecutor = new FilterExecutor();
  });

  afterEach(async () => {
    // Clean up any resources if needed
  });

  describe('Constructor and Initialization', () => {
    it('should create FilterExecutor instance', () => {
      expect(filterExecutor).toBeInstanceOf(FilterExecutor);
    });

    it('should have required methods', () => {
      expect(typeof filterExecutor.executeInMemory).toBe('function');
      expect(typeof filterExecutor.executeWithResult).toBe('function');
      expect(typeof filterExecutor.generateDatabaseQuery).toBe('function');
      expect(typeof filterExecutor.executeBatch).toBe('function');
    });
  });

  describe('In-Memory Filter Execution', () => {
    it('should execute simple comparison filter', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect((result[0] as TestMemoryData).id).toBe('2');
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

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(result).toHaveLength(1);
      expect((result[0] as TestMemoryData).id).toBe('2');
    });

    it('should execute logical OR filter', async () => {
      const filter: FilterNode = {
        type: FilterType.LOGICAL,
        field: 'root',
        operator: FilterOperator.OR,
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
            value: 'low'
          }
        ]
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(result).toHaveLength(2);
      expect((result as TestMemoryData[]).map((item: TestMemoryData) => item.id)).toEqual(expect.arrayContaining(['2', '3']));
    });

    it('should execute CONTAINS filter', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'content',
        operator: FilterOperator.CONTAINS,
        value: 'Important'
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(result).toHaveLength(1);
      expect((result[0] as TestMemoryData).id).toBe('2');
    });

    it('should execute GREATER_THAN filter', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'confidenceScore',
        operator: FilterOperator.GREATER_THAN,
        value: 0.7
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(result).toHaveLength(2);
      expect((result as TestMemoryData[]).map(item => item.id)).toEqual(expect.arrayContaining(['1', '2']));
    });
  });

  describe('Filter Execution with Results', () => {
    it('should return detailed execution results', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      const result = await filterExecutor.executeWithResult(filter, sampleData);

      expect(result).toHaveProperty('filteredItems');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('filteredCount');
      expect(result).toHaveProperty('executionTime');
      expect(result).toHaveProperty('strategyUsed');
      expect(result).toHaveProperty('metadata');

      expect(result.totalCount).toBe(3);
      expect(result.filteredCount).toBe(1);
      expect(result.strategyUsed).toBe('in_memory_filtering');
    });

    it('should handle empty results', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'nonexistent'
      };

      const result = await filterExecutor.executeWithResult(filter, sampleData);

      expect(result.totalCount).toBe(3);
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

      const result = filterExecutor.generateDatabaseQuery(filter, 'SELECT * FROM memories');

      expect(result).toHaveProperty('sql');
      expect(result).toHaveProperty('parameters');
      expect(result).toHaveProperty('estimatedCost');
      expect(result).toHaveProperty('canUseIndex');

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

      const result = filterExecutor.generateDatabaseQuery(filter, 'SELECT * FROM memories');

      expect(result.sql).toContain('content LIKE ?');
      expect(result.parameters).toEqual(['%memory%']);
    });

    it('should generate SQL query for logical AND filter', async () => {
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

      const result = filterExecutor.generateDatabaseQuery(filter, 'SELECT * FROM memories');

      expect(result.sql).toContain('AND');
      expect(result.parameters).toHaveLength(2);
    });
  });

  describe('Batch Execution', () => {
    it('should execute multiple filters in batch', async () => {
      const filters: FilterNode[] = [
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
          value: 'low'
        }
      ];

      const results = await filterExecutor.executeBatch(filters, sampleData);

      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result).toHaveProperty('filteredItems');
        expect(result).toHaveProperty('totalCount');
        expect(result).toHaveProperty('filteredCount');
      });
    });

    it('should handle empty filter array', async () => {
      const results = await filterExecutor.executeBatch([], sampleData);

      expect(results).toHaveLength(0);
    });
  });

  describe('Temporal Filters', () => {
    it('should execute BEFORE filter', async () => {
      const filter: FilterNode = {
        type: FilterType.TEMPORAL,
        field: 'createdAt',
        operator: FilterOperator.BEFORE,
        value: new Date('2024-01-02')
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(result).toHaveLength(1);
      expect((result[0] as TestMemoryData).id).toBe('1');
    });

    it('should execute AFTER filter', async () => {
      const filter: FilterNode = {
        type: FilterType.TEMPORAL,
        field: 'createdAt',
        operator: FilterOperator.AFTER,
        value: new Date('2024-01-02')
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(result).toHaveLength(1);
      expect((result[0] as TestMemoryData).id).toBe('3');
    });
  });

  describe('Spatial Filters', () => {
    it('should handle NEAR filter', async () => {
      const filter: FilterNode = {
        type: FilterType.SPATIAL,
        field: 'location',
        operator: FilterOperator.NEAR,
        value: { latitude: 59.3293, longitude: 18.0686, type: 'point' }
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      // Should return the item with matching coordinates
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle WITHIN_RADIUS filter', async () => {
      const filter: FilterNode = {
        type: FilterType.SPATIAL,
        field: 'location',
        operator: FilterOperator.WITHIN_RADIUS,
        value: { radius: 1.0 } // 1km radius
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      // Should return items within the radius
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('LIKE Pattern Matching', () => {
    it('should match LIKE patterns correctly', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'content',
        operator: FilterOperator.LIKE,
        value: 'Test%'
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(result).toHaveLength(1);
      expect((result[0] as TestMemoryData).id).toBe('1');
    });

    it('should handle wildcard patterns', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'content',
        operator: FilterOperator.LIKE,
        value: '%memory%'
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(result).toHaveLength(3); // All items contain 'memory'
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid field access gracefully', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'nonexistent.field',
        operator: FilterOperator.EQUALS,
        value: 'test'
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(Array.isArray(result)).toBe(true);
      // Should return empty array for non-existent fields
      expect(result).toHaveLength(0);
    });

    it('should handle malformed regex patterns', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'content',
        operator: FilterOperator.REGEX,
        value: '[invalid-regex'
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(Array.isArray(result)).toBe(true);
      // Should return empty array for invalid regex
      expect(result).toHaveLength(0);
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

      const result = await filterExecutor.executeInMemory(filter, []);

      expect(result).toHaveLength(0);
    });

    it('should handle null/undefined filter values', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: null
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle array values in IN operator', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.IN,
        value: ['essential', 'reference']
      };

      const result = await filterExecutor.executeInMemory(filter, sampleData);

      expect(result).toHaveLength(2);
      expect((result as TestMemoryData[]).map((item: TestMemoryData) => item.id)).toEqual(expect.arrayContaining(['2', '3']));
    });
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
      await filterExecutor.executeInMemory(filter, sampleData);
      const executionTime = Date.now() - startTime;

      // Should execute very quickly for small datasets
      expect(executionTime).toBeLessThan(100);
    });

    it('should estimate query costs correctly', async () => {
      const simpleFilter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'id',
        operator: FilterOperator.EQUALS,
        value: 'test'
      };

      const complexFilter: FilterNode = {
        type: FilterType.LOGICAL,
        field: 'root',
        operator: FilterOperator.AND,
        value: null,
        children: [
          {
            type: FilterType.COMPARISON,
            field: 'classification',
            operator: FilterOperator.LIKE,
            value: '%test%'
          },
          {
            type: FilterType.TEMPORAL,
            field: 'createdAt',
            operator: FilterOperator.BEFORE,
            value: new Date()
          }
        ]
      };

      const simpleQuery = filterExecutor.generateDatabaseQuery(simpleFilter, 'SELECT * FROM test');
      const complexQuery = filterExecutor.generateDatabaseQuery(complexFilter, 'SELECT * FROM test');

      expect(complexQuery.estimatedCost).toBeGreaterThan(simpleQuery.estimatedCost);
    });
  });

  describe('Context and Metadata', () => {
    it('should handle execution context', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'essential'
      };

      const context: FilterExecutionContext = {
        dataSource: 'memory',
        memoryType: 'long_term',
        namespace: 'test-namespace',
        userId: 'test-user'
      };

      const result = await filterExecutor.executeWithResult(filter, sampleData, context);

      expect(result.metadata.context).toEqual(context);
    });

    it('should preserve filter metadata in results', async () => {
      const filter: FilterNode = {
        type: FilterType.COMPARISON,
        field: 'classification',
        operator: FilterOperator.EQUALS,
        value: 'essential',
        metadata: {
          description: 'Test filter',
          weight: 1.0
        }
      };

      const result = await filterExecutor.executeWithResult(filter, sampleData);

      expect(result.metadata.originalFilter).toEqual(filter);
    });
  });
});