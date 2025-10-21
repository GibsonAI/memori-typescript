import { AdvancedFilterEngine, FilterTemplateManager } from '../../../src/core/domain/search/filtering/AdvancedFilterEngine';
import { FilterCombinationStrategy, FilterType, FilterOperator } from '../../../src/core/domain/search/filtering/types';
import { FilterBuilder, FilterEngine } from '../../../src/core/domain/search/filtering/FilterEngine';

describe('AdvancedFilterEngine', () => {
  let engine: AdvancedFilterEngine;

  beforeEach(() => {
    engine = new AdvancedFilterEngine();
  });

  describe('combineFilters', () => {
    it('should combine filters with INTERSECTION strategy', () => {
      const filter1 = new FilterBuilder()
        .where('category', FilterOperator.EQUALS, 'important')
        .build()!;

      const filter2 = new FilterBuilder()
        .where('priority', FilterOperator.GREATER_THAN, 5)
        .build()!;

      const combined = engine.combineFilters(FilterCombinationStrategy.INTERSECTION, [filter1, filter2]);

      expect(combined.type).toBe(FilterType.LOGICAL);
      expect(combined.operator).toBe(FilterOperator.AND);
      expect(combined.children).toHaveLength(2);
      expect(combined.metadata?.combinationStrategy).toBe(FilterCombinationStrategy.INTERSECTION);
    });

    it('should combine filters with UNION strategy', () => {
      const filter1 = new FilterBuilder()
        .where('status', FilterOperator.EQUALS, 'active')
        .build()!;

      const filter2 = new FilterBuilder()
        .where('status', FilterOperator.EQUALS, 'pending')
        .build()!;

      const combined = engine.combineFilters(FilterCombinationStrategy.UNION, [filter1, filter2]);

      expect(combined.type).toBe(FilterType.LOGICAL);
      expect(combined.operator).toBe(FilterOperator.OR);
      expect(combined.children).toHaveLength(2);
      expect(combined.metadata?.combinationStrategy).toBe(FilterCombinationStrategy.UNION);
    });

    it('should combine filters with CASCADE strategy', () => {
      const filter1 = new FilterBuilder()
        .where('category', FilterOperator.EQUALS, 'urgent')
        .build()!;

      const filter2 = new FilterBuilder()
        .where('priority', FilterOperator.GREATER_THAN, 8)
        .build()!;

      const combined = engine.combineFilters(FilterCombinationStrategy.CASCADE, [filter1, filter2]);

      expect(combined.type).toBe(FilterType.LOGICAL);
      expect(combined.operator).toBe(FilterOperator.AND);
      expect(combined.metadata?.combinationStrategy).toBe(FilterCombinationStrategy.CASCADE);
      expect(combined.metadata?.optimizationHints).toContain('cascade_optimization');
    });

    it('should combine filters with WEIGHTED strategy', () => {
      const filter1 = new FilterBuilder()
        .where('score', FilterOperator.GREATER_THAN, 0.8)
        .build()!;

      const filter2 = new FilterBuilder()
        .where('rating', FilterOperator.GREATER_THAN, 4)
        .build()!;

      const combined = engine.combineFilters(FilterCombinationStrategy.WEIGHTED, [filter1, filter2]);

      expect(combined.type).toBe(FilterType.LOGICAL);
      expect(combined.operator).toBe(FilterOperator.OR);
      expect(combined.metadata?.combinationStrategy).toBe(FilterCombinationStrategy.WEIGHTED);
      expect(combined.metadata?.optimizationHints).toContain('weighted_scoring');
    });

    it('should throw error for empty filter list', () => {
      expect(() => {
        engine.combineFilters(FilterCombinationStrategy.INTERSECTION, []);
      }).toThrow('Cannot combine empty filter list');
    });

    // TODO: Fix enum handling for unsupported strategy validation
    // it('should throw error for unsupported strategy', () => {
    //   const filter = new FilterBuilder()
    //     .where('field', FilterOperator.EQUALS, 'value')
    //     .build()!;

    //   expect(() => {
    //     engine.combineFilters('invalid_strategy' as any, [filter]);
    //   }).toThrow(FilterEngineError);
    // });
  });

  describe('optimizeFilterChain', () => {
    it('should optimize filter chain with cost estimation', () => {
      const filters = [
        new FilterBuilder().where('category', FilterOperator.EQUALS, 'test').build()!,
        new FilterBuilder().where('priority', FilterOperator.GREATER_THAN, 5).build()!,
      ];

      const optimized = engine.optimizeFilterChain(filters);

      expect(optimized.executionOrder).toHaveLength(2);
      expect(optimized.estimatedCost).toBeGreaterThan(0);
      expect(optimized.optimizationHints).toBeDefined();
    });

    it('should create parallel groups for independent filters', () => {
      const filters = [
        new FilterBuilder().where('category', FilterOperator.EQUALS, 'test').build()!,
        new FilterBuilder().where('priority', FilterOperator.GREATER_THAN, 5).build()!,
        new FilterBuilder().where('status', FilterOperator.EQUALS, 'active').build()!,
      ];

      const optimized = engine.optimizeFilterChain(filters);

      expect(optimized.parallelGroups).toBeDefined();
      expect(optimized.parallelGroups.length).toBeGreaterThan(0);
    });
  });

  describe('createFilterTemplate', () => {
    it('should create filter from valid template', () => {
      const templateManager = engine.getTemplateManager();
      templateManager.registerTemplate('recent_important', {
        name: 'recent_important',
        description: 'Recent important memories',
        parameters: [
          {
            name: 'days',
            type: 'number' as any,
            required: true,
          },
        ],
        filterExpression: 'category = "important" AND created_at > "{days}"',
      });

      const filter = engine.createFilterTemplate('recent_important', { days: 7 });

      expect(filter).toBeDefined();
      expect(filter.type).toBe(FilterType.COMPARISON);
    });

    it('should throw error for non-existent template', () => {
      expect(() => {
        engine.createFilterTemplate('non_existent', {});
      }).toThrow('Template not found');
    });
  });

  describe('validateComplexExpression', () => {
    it('should validate correct expression', () => {
      const result = engine.validateComplexExpression('category = "important" AND priority > 5');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect syntax errors', () => {
      const result = engine.validateComplexExpression('category = "important" AND category2');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should provide suggestions for complex expressions', () => {
      const complexExpression = 'a=1 AND b=2 AND c=3 AND d=4 AND e=5 AND f=6 AND g=7 AND h=8 AND i=9 AND j=10';
      const result = engine.validateComplexExpression(complexExpression);

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });
  });

  describe('executeFilterWithMetrics', () => {
    it('should execute filter and return metrics', async () => {
      const filter = new FilterBuilder()
        .where('priority', FilterOperator.GREATER_THAN, 7)
        .build()!;

      const testData = [
        { category: 'important', priority: 8 },
        { category: 'normal', priority: 5 },
        { category: 'important', priority: 3 },
      ];

      const result = await engine.executeFilterWithMetrics(filter, testData);

      expect(result.filteredItems).toHaveLength(1); // Only one item with priority > 7
      expect(result.metrics).toBeDefined();
      expect(result.metrics.executionTime).toBeGreaterThan(0);
      expect(result.metrics.optimizationApplied).toContain('basic_optimization');
    });
  });
});

describe('FilterTemplateManager', () => {
  let manager: FilterTemplateManager;

  beforeEach(() => {
    manager = new FilterTemplateManager();
  });

  describe('template management', () => {
    it('should register and retrieve template', () => {
      const template = {
        name: 'test_template',
        description: 'Test template',
        parameters: [],
        filterExpression: 'field = "value"',
      };

      manager.registerTemplate('test_template', template);
      const retrieved = manager.getTemplate('test_template');

      expect(retrieved).toEqual(template);
    });

    it('should return null for non-existent template', () => {
      const template = manager.getTemplate('non_existent');
      expect(template).toBeNull();
    });

    it('should list available templates', () => {
      manager.registerTemplate('template1', {
        name: 'template1',
        description: 'Template 1',
        parameters: [],
        filterExpression: 'field = "value1"',
      });

      manager.registerTemplate('template2', {
        name: 'template2',
        description: 'Template 2',
        parameters: [],
        filterExpression: 'field = "value2"',
      });

      const templates = manager.listAvailableTemplates();
      expect(templates).toContain('template1');
      expect(templates).toContain('template2');
    });

    it('should validate template correctly', () => {
      const validTemplate = {
        name: 'valid_template',
        description: 'Valid template',
        parameters: [],
        filterExpression: 'field = "value"',
      };

      const result = manager.validateTemplate(validTemplate);
      expect(result.isValid).toBe(true);

      const invalidTemplate = {
        name: '',
        description: 'Invalid template',
        parameters: [],
        filterExpression: '',
      };

      const invalidResult = manager.validateTemplate(invalidTemplate);
      expect(invalidResult.isValid).toBe(false);
    });
  });
});