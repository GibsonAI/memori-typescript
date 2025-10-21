import {
  FilterNode,
  FilterType,
  FilterOperator,
  FilterValidationResult,
  FilterExecutionContext,
  FilterExecutionResult,
  FilterExpression,
  FilterSelectivityInfo,
  FilterOptimizationStats,
  OptimizedFilterResult,
  FilterExecutionHistory,
  FilterExecutionPlan,
  FilterPerformanceMetrics
} from './types';

import { logInfo, logError, logWarn } from '../../../infrastructure/config/Logger';

/**
 * Core FilterEngine class for processing complex filter combinations
 */
export class FilterEngine {
  constructor() {}

  parseFilter(filterExpression: FilterExpression): FilterNode {
    return this.parseExpression(filterExpression);
  }

  async executeFilter(
    filter: FilterNode,
    results: unknown[],
    context?: FilterExecutionContext
  ): Promise<FilterExecutionResult> {
    const validation = this.validateFilter(filter);
    if (!validation.isValid) {
      throw new FilterEngineError(
        `Invalid filter: ${validation.errors.map(e => e.message).join(', ')}`,
        'VALIDATION_ERROR',
        { validation }
      );
    }

    const startTime = Date.now();
    const filteredResults = this.executeInMemory(filter, results);
    const executionTime = Date.now() - startTime;

    return {
      filteredItems: filteredResults,
      totalCount: results.length,
      filteredCount: filteredResults.length,
      executionTime,
      strategyUsed: 'in_memory_filtering',
      metadata: {
        originalFilter: filter,
        context: context || {}
      }
    };
  }

  async executeFilterAsQuery(
    filter: FilterNode,
    baseQuery: string,
    context?: FilterExecutionContext
  ): Promise<{ sql: string; parameters: unknown[]; estimatedCost: number }> {
    const validation = this.validateFilter(filter);
    if (!validation.isValid) {
      throw new FilterEngineError(
        `Invalid filter: ${validation.errors.map(e => e.message).join(', ')}`,
        'VALIDATION_ERROR',
        { validation }
      );
    }

    return this.generateDatabaseQuery(filter, baseQuery);
  }

  validateFilter(filter: FilterNode): FilterValidationResult {
    return this.validate(filter);
  }

  createBuilder(): FilterBuilder {
    return new FilterBuilder();
  }

  async parseAndExecute(
    filterExpression: FilterExpression,
    results: unknown[],
    context?: FilterExecutionContext
  ): Promise<FilterExecutionResult> {
    const filter = this.parseFilter(filterExpression);
    return this.executeFilter(filter, results, context);
  }

  getMetadata() {
    return {
      supportedOperators: Object.values(FilterOperator),
      supportedTypes: Object.values(FilterType),
      maxNestingDepth: 10,
      maxChildrenPerNode: 100,
      performanceFeatures: [
        'query_optimization',
        'index_utilization',
        'caching',
        'parallel_processing'
      ],
      version: '1.0.0'
    };
  }

  private parseExpression(expression: string): FilterNode {
    const trimmed = expression.trim();

    if (trimmed.includes(' AND ')) {
      const parts = trimmed.split(' AND ');
      return {
        type: FilterType.LOGICAL,
        field: '',
        operator: FilterOperator.AND,
        value: null,
        children: parts.map(part => this.parseExpression(part))
      };
    }

    if (trimmed.includes(' OR ')) {
      const parts = trimmed.split(' OR ');
      return {
        type: FilterType.LOGICAL,
        field: '',
        operator: FilterOperator.OR,
        value: null,
        children: parts.map(part => this.parseExpression(part))
      };
    }

    const match = trimmed.match(/^(\w+)([=<>!]+)(.+)$/);
    if (match) {
      const [, field, operatorStr, valueStr] = match;
      const operator = this.parseOperator(operatorStr);
      const value = this.parseValue(valueStr);

      return {
        type: FilterType.COMPARISON,
        field,
        operator,
        value
      };
    }

    throw new Error(`Cannot parse filter expression: ${expression}`);
  }

  private parseOperator(opStr: string): FilterOperator {
    const opMap: Record<string, FilterOperator> = {
      '=': FilterOperator.EQUALS,
      '==': FilterOperator.EQUALS,
      '!=': FilterOperator.NOT_EQUALS,
      '<>': FilterOperator.NOT_EQUALS,
      '>': FilterOperator.GREATER_THAN,
      '<': FilterOperator.LESS_THAN,
      '>=': FilterOperator.GREATER_EQUAL,
      '<=': FilterOperator.LESS_EQUAL,
      '~': FilterOperator.CONTAINS,
      'contains': FilterOperator.CONTAINS,
      'like': FilterOperator.LIKE
    };

    return opMap[opStr] || FilterOperator.EQUALS;
  }

  private parseValue(valueStr: string): unknown {
    const trimmed = valueStr.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    const num = Number(trimmed);
    if (!isNaN(num)) return num;
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(v => v.trim());
    }
    return trimmed.replace(/^["']|["']$/g, '');
  }

  private validate(filter: FilterNode): FilterValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    if (!filter.field || typeof filter.field !== 'string') {
      errors.push({
        code: 'INVALID_FIELD',
        message: 'Filter must have a valid field name',
        field: filter.field
      });
    }

    if (!filter.operator || !Object.values(FilterOperator).includes(filter.operator)) {
      errors.push({
        code: 'INVALID_OPERATOR',
        message: 'Filter must have a valid operator',
        operator: filter.operator
      });
    }

    if (filter.children) {
      filter.children.forEach(child => {
        const childValidation = this.validate(child);
        errors.push(...childValidation.errors);
        warnings.push(...childValidation.warnings);
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  protected executeInMemory(filter: FilterNode, results: unknown[]): unknown[] {
    return results.filter(item => this.evaluateFilter(filter, item));
  }

  private evaluateFilter(filter: FilterNode, item: unknown): boolean {
    const value = (item as any)[filter.field];

    switch (filter.operator) {
      case FilterOperator.EQUALS:
        return value === filter.value;
      case FilterOperator.NOT_EQUALS:
        return value !== filter.value;
      case FilterOperator.GREATER_THAN:
        return Number(value) > Number(filter.value);
      case FilterOperator.LESS_THAN:
        return Number(value) < Number(filter.value);
      case FilterOperator.GREATER_EQUAL:
        return Number(value) >= Number(filter.value);
      case FilterOperator.LESS_EQUAL:
        return Number(value) <= Number(filter.value);
      case FilterOperator.CONTAINS:
        return String(value).includes(String(filter.value));
      case FilterOperator.STARTS_WITH:
        return String(value).startsWith(String(filter.value));
      case FilterOperator.ENDS_WITH:
        return String(value).endsWith(String(filter.value));
      case FilterOperator.IN: {
        const inArray = filter.value as unknown[];
        return inArray.includes(value);
      }
      case FilterOperator.AND: {
        return filter.children?.every(child => this.evaluateFilter(child, item)) || false;
      }
      case FilterOperator.OR: {
        return filter.children?.some(child => this.evaluateFilter(child, item)) || false;
      }
      case FilterOperator.NOT: {
        const childFilter = filter.children?.[0];
        if (!childFilter) return true;
        return !this.evaluateFilter(childFilter, item);
      }
      default:
        return true;
    }
  }

  private generateDatabaseQuery(
    filter: FilterNode,
    baseQuery: string
  ): { sql: string; parameters: unknown[]; estimatedCost: number } {
    const params: unknown[] = [];
    const conditions = this.buildSqlConditions(filter, params);
    const sql = `${baseQuery} WHERE ${conditions}`;
    return {
      sql,
      parameters: params,
      estimatedCost: 1
    };
  }

  private buildSqlConditions(filter: FilterNode, params: unknown[]): string {
    switch (filter.operator) {
      case FilterOperator.EQUALS:
        params.push(filter.value);
        return `${filter.field} = ?`;
      case FilterOperator.CONTAINS:
        params.push(`%${filter.value}%`);
        return `${filter.field} LIKE ?`;
      case FilterOperator.GREATER_THAN:
        params.push(filter.value);
        return `${filter.field} > ?`;
      case FilterOperator.LESS_THAN:
        params.push(filter.value);
        return `${filter.field} < ?`;
      case FilterOperator.AND: {
        const andConditions = filter.children?.map(child =>
          `(${this.buildSqlConditions(child, params)})`
        ).join(' AND ');
        return andConditions || '1=1';
      }
      case FilterOperator.OR: {
        const orConditions = filter.children?.map(child =>
          `(${this.buildSqlConditions(child, params)})`
        ).join(' OR ');
        return orConditions || '1=1';
      }
      default:
        return '1=1';
    }
  }
}

/**
 * Enhanced FilterEngine with push-down optimization
 */
export class OptimizedFilterEngine extends FilterEngine {
  private selectivityCache: Map<string, FilterSelectivityInfo> = new Map();
  private performanceHistory: Map<string, FilterExecutionHistory[]> = new Map();
  private optimizationStats: FilterOptimizationStats = {
    cachedSelectivityCount: 0,
    performanceHistorySize: 0,
    averageOptimizationImprovement: 0,
    totalOptimizationsApplied: 0,
    earlyTerminations: 0
  };

  /**
   * Execute filter with push-down optimization
   */
  async executeFilterOptimized(
    filter: FilterNode,
    results: unknown[],
    context?: FilterExecutionContext
  ): Promise<FilterExecutionResult> {
    const startTime = Date.now();

    try {
      // Analyze and optimize filter structure
      const optimizationResult = this.optimizeFilterOrder(filter);

      logInfo('Executing optimized filter', {
        component: 'OptimizedFilterEngine',
        operation: 'executeFilterOptimized',
        originalFilterCount: this.countFilterNodes(filter),
        optimizedFilterCount: this.countFilterNodes(optimizationResult.optimizedFilter),
        resultSetSize: results.length,
        optimizationsApplied: optimizationResult.optimizationApplied
      });

      // Execute with optimization
      const filteredResults = await this.executeOptimizedFilter(
        optimizationResult.optimizedFilter,
        results,
        optimizationResult.executionPlan
      );

      const executionTime = Date.now() - startTime;

      // Update performance history for learning
      this.updatePerformanceHistory(filter, filteredResults.length / results.length, executionTime);

      return {
        filteredItems: filteredResults,
        totalCount: results.length,
        filteredCount: filteredResults.length,
        executionTime,
        strategyUsed: 'optimized_filtering',
        metadata: {
          originalFilter: filter,
          optimizedFilter: optimizationResult.optimizedFilter,
          selectivityRatio: filteredResults.length / results.length,
          optimizationApplied: optimizationResult.optimizationApplied,
          estimatedImprovement: optimizationResult.estimatedImprovement,
          context: context || {}
        }
      };
    } catch (error) {
      logError('Optimized filter execution failed', {
        component: 'OptimizedFilterEngine',
        operation: 'executeFilterOptimized',
        error: error instanceof Error ? error.message : String(error)
      });

      // Fallback to standard execution
      return super.executeFilter(filter, results, context);
    }
  }

  /**
   * Optimize filter order by pushing down most selective filters
   */
  private optimizeFilterOrder(filter: FilterNode): OptimizedFilterResult {
    const optimizations: string[] = [];
    let optimizedFilter = filter;

    try {
      // For logical AND operations, reorder children by selectivity
      if (filter.type === FilterType.LOGICAL && filter.operator === FilterOperator.AND && filter.children) {
        const optimizedChildren = filter.children
          .map(child => ({
            filter: child,
            selectivity: this.estimateFilterSelectivity(child)
          }))
          .sort((a, b) => b.selectivity - a.selectivity) // Most selective first
          .map(item => this.optimizeFilterOrder(item.filter).optimizedFilter);

        optimizedFilter = {
          ...filter,
          children: optimizedChildren
        };
        optimizations.push('filter_reordering');
      }

      // For logical OR operations, keep current order but optimize children
      if (filter.type === FilterType.LOGICAL && filter.operator === FilterOperator.OR && filter.children) {
        const optimizedChildren = filter.children.map(child => this.optimizeFilterOrder(child).optimizedFilter);
        optimizedFilter = {
          ...filter,
          children: optimizedChildren
        };
        optimizations.push('children_optimization');
      }

      // Generate execution plan
      const executionPlan = this.generateExecutionPlan(optimizedFilter);

      // Calculate estimated improvement
      const originalCost = this.estimateFilterCost(filter);
      const optimizedCost = executionPlan.estimatedTotalCost;
      const estimatedImprovement = originalCost > 0 ? (originalCost - optimizedCost) / originalCost : 0;

      this.optimizationStats.totalOptimizationsApplied++;

      return {
        optimizedFilter,
        optimizationApplied: optimizations,
        estimatedImprovement,
        executionPlan
      };
    } catch (error) {
      logWarn('Filter optimization failed, using original filter', {
        component: 'OptimizedFilterEngine',
        operation: 'optimizeFilterOrder',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        optimizedFilter: filter,
        optimizationApplied: ['optimization_failed'],
        estimatedImprovement: 0,
        executionPlan: this.generateExecutionPlan(filter)
      };
    }
  }

  /**
   * Estimate filter selectivity based on operator and field characteristics
   */
  private estimateFilterSelectivity(filter: FilterNode): number {
    const cacheKey = this.generateFilterKey(filter);
    const cached = this.selectivityCache.get(cacheKey);

    if (cached) {
      this.optimizationStats.cachedSelectivityCount++;
      return cached.estimatedSelectivity;
    }

    let selectivity: number;

    switch (filter.operator) {
      case FilterOperator.EQUALS:
        selectivity = this.estimateEqualitySelectivity(filter);
        break;
      case FilterOperator.NOT_EQUALS:
        selectivity = 0.9; // Usually very selective (eliminates specific values)
        break;
      case FilterOperator.GREATER_THAN:
      case FilterOperator.LESS_THAN:
        selectivity = this.estimateRangeSelectivity(filter);
        break;
      case FilterOperator.CONTAINS:
      case FilterOperator.LIKE:
        selectivity = this.estimatePatternSelectivity(filter);
        break;
      case FilterOperator.IN:
        selectivity = this.estimateInSelectivity(filter);
        break;
      case FilterOperator.BETWEEN:
        selectivity = this.estimateBetweenSelectivity(filter);
        break;
      default:
        selectivity = 0.5; // Default moderate selectivity
    }

    // Adjust based on field type
    if (filter.field) {
      selectivity = this.adjustSelectivityByFieldType(filter.field, selectivity);
    }

    // Cache the result
    const selectivityInfo: FilterSelectivityInfo = {
      filterNode: filter,
      estimatedSelectivity: selectivity,
      estimatedCost: this.estimateFilterCost(filter),
      operatorCategory: this.categorizeOperator(filter.operator)
    };

    this.selectivityCache.set(cacheKey, selectivityInfo);
    return selectivity;
  }

  /**
   * Estimate selectivity for equality operations
   */
  private estimateEqualitySelectivity(filter: FilterNode): number {
    if (!filter.field || !filter.value) return 0.5;

    // Base selectivity for equality
    let selectivity = 0.8;

    // Adjust based on value specificity
    if (typeof filter.value === 'string') {
      if (filter.value.length > 10) {
        selectivity = 0.9; // Longer strings are typically more selective
      } else if (filter.value.length < 3) {
        selectivity = 0.3; // Short strings are less selective
      }
    }

    if (typeof filter.value === 'number') {
      // Numeric values are generally highly selective
      selectivity = 0.85;
    }

    return selectivity;
  }

  /**
   * Estimate selectivity for range operations
   */
  private estimateRangeSelectivity(filter: FilterNode): number {
    if (!filter.field || !filter.value) return 0.5;

    // Range operations typically eliminate ~50-70% of results
    let selectivity = 0.4;

    if (typeof filter.value === 'number') {
      // For numeric ranges, selectivity depends on the range size
      // This is a simplified estimation
      selectivity = 0.6;
    }

    return selectivity;
  }

  /**
   * Estimate selectivity for pattern matching
   */
  private estimatePatternSelectivity(filter: FilterNode): number {
    if (!filter.value || typeof filter.value !== 'string') return 0.5;

    const pattern = filter.value.toLowerCase();

    // Exact phrase matches are more selective
    if (!pattern.includes('%') && !pattern.includes('*')) {
      return 0.7;
    }

    // Wildcard patterns are less selective
    if (pattern.startsWith('%') || pattern.startsWith('*')) {
      return 0.3; // Starts-with patterns
    }

    if (pattern.endsWith('%') || pattern.endsWith('*')) {
      return 0.4; // Ends-with patterns
    }

    // Contains patterns are least selective
    return 0.2;
  }

  /**
   * Estimate selectivity for IN operations
   */
  private estimateInSelectivity(filter: FilterNode): number {
    if (!filter.value || !Array.isArray(filter.value)) return 0.5;

    const arraySize = filter.value.length;

    // More values in IN clause = more selective
    if (arraySize <= 1) return 0.8;
    if (arraySize <= 3) return 0.6;
    if (arraySize <= 10) return 0.4;
    return 0.2; // Large IN clauses
  }

  /**
   * Estimate selectivity for BETWEEN operations
   */
  private estimateBetweenSelectivity(filter: FilterNode): number {
    // BETWEEN is typically quite selective for most data types
    return 0.7;
  }

  /**
   * Adjust selectivity based on field type characteristics
   */
  private adjustSelectivityByFieldType(fieldName: string, baseSelectivity: number): number {
    // Field-specific adjustments based on common patterns

    if (fieldName.includes('id') || fieldName.includes('uuid')) {
      // ID fields are typically highly selective
      return Math.max(baseSelectivity, 0.9);
    }

    if (fieldName.includes('category') || fieldName.includes('type')) {
      // Category fields have moderate selectivity
      return (baseSelectivity + 0.6) / 2;
    }

    if (fieldName.includes('score') || fieldName.includes('importance')) {
      // Score fields depend on the range but are generally selective
      return (baseSelectivity + 0.7) / 2;
    }

    if (fieldName.includes('content') || fieldName.includes('description')) {
      // Text content fields are less selective for exact matches
      return Math.min(baseSelectivity, 0.3);
    }

    return baseSelectivity;
  }

  /**
   * Categorize operator for optimization strategies
   */
  private categorizeOperator(operator: FilterOperator): 'equality' | 'range' | 'pattern' | 'logical' {
    switch (operator) {
      case FilterOperator.EQUALS:
      case FilterOperator.NOT_EQUALS:
        return 'equality';
      case FilterOperator.GREATER_THAN:
      case FilterOperator.LESS_THAN:
      case FilterOperator.GREATER_EQUAL:
      case FilterOperator.LESS_EQUAL:
      case FilterOperator.BETWEEN:
        return 'range';
      case FilterOperator.CONTAINS:
      case FilterOperator.LIKE:
      case FilterOperator.STARTS_WITH:
      case FilterOperator.ENDS_WITH:
        return 'pattern';
      default:
        return 'logical';
    }
  }

  /**
   * Estimate execution cost for a filter
   */
  private estimateFilterCost(filter: FilterNode): number {
    const baseCosts: Record<FilterOperator, number> = {
      [FilterOperator.EQUALS]: 1,
      [FilterOperator.NOT_EQUALS]: 1,
      [FilterOperator.GREATER_THAN]: 1,
      [FilterOperator.LESS_THAN]: 1,
      [FilterOperator.GREATER_EQUAL]: 1,
      [FilterOperator.LESS_EQUAL]: 1,
      [FilterOperator.CONTAINS]: 3,
      [FilterOperator.LIKE]: 5,
      [FilterOperator.REGEX]: 10,
      [FilterOperator.IN]: 2,
      [FilterOperator.NOT_IN]: 2,
      [FilterOperator.BETWEEN]: 2,
      [FilterOperator.AND]: 1,
      [FilterOperator.OR]: 1,
      [FilterOperator.NOT]: 1,
      [FilterOperator.BEFORE]: 1,
      [FilterOperator.AFTER]: 1,
      [FilterOperator.WITHIN]: 2,
      [FilterOperator.AGE_LESS_THAN]: 1,
      [FilterOperator.AGE_GREATER_THAN]: 1,
      [FilterOperator.NEAR]: 5,
      [FilterOperator.WITHIN_RADIUS]: 8,
      [FilterOperator.CONTAINS_POINT]: 10,
      [FilterOperator.SIMILAR_TO]: 15,
      [FilterOperator.RELATED_TO]: 15,
      [FilterOperator.STARTS_WITH]: 2,
      [FilterOperator.ENDS_WITH]: 2
    };

    return baseCosts[filter.operator] || 1;
  }

  /**
   * Execute optimized filter with early termination
   */
  private async executeOptimizedFilter(
    filter: FilterNode,
    results: unknown[],
    executionPlan: FilterExecutionPlan
  ): Promise<unknown[]> {
    // For AND operations, apply filters in selectivity order
    if (filter.type === FilterType.LOGICAL && filter.operator === FilterOperator.AND && filter.children) {
      let currentResults = results;

      for (let i = 0; i < filter.children.length; i++) {
        const childFilter = filter.children[i];
        const startTime = Date.now();

        currentResults = this.executeInMemory(childFilter, currentResults);

        const executionTime = Date.now() - startTime;

        // Record execution history
        this.recordExecutionHistory(childFilter, results.length, currentResults.length, executionTime);

        // Early termination if result set becomes too small
        if (currentResults.length === 0) {
          this.optimizationStats.earlyTerminations++;
          logInfo('Early termination due to empty results', {
            component: 'OptimizedFilterEngine',
            operation: 'executeOptimizedFilter',
            filterIndex: i,
            remainingResults: currentResults.length,
            originalResults: results.length
          });
          break;
        }

        // Early termination if remaining results are below threshold
        if (currentResults.length < 10 && results.length > 100) {
          this.optimizationStats.earlyTerminations++;
          logInfo('Early termination due to highly selective filter', {
            component: 'OptimizedFilterEngine',
            operation: 'executeOptimizedFilter',
            filterIndex: i,
            remainingResults: currentResults.length,
            originalResults: results.length
          });
          break;
        }
      }

      return currentResults;
    }

    // For other operations, use standard execution
    return this.executeInMemory(filter, results);
  }

  /**
   * Generate cache key for filter selectivity
   */
  private generateFilterKey(filter: FilterNode): string {
    return `${filter.field}_${filter.operator}_${String(filter.value)}_${filter.type}`;
  }

  /**
   * Update performance history for learning from actual results
   */
  private updatePerformanceHistory(filter: FilterNode, actualSelectivity: number, executionTime: number): void {
    const key = this.generateFilterKey(filter);

    if (!this.performanceHistory.has(key)) {
      this.performanceHistory.set(key, []);
    }

    const history = this.performanceHistory.get(key)!;
    history.push({
      executionTime,
      inputSize: 0, // Will be updated by executeOptimizedFilter
      outputSize: 0, // Will be updated by executeOptimizedFilter
      timestamp: new Date(),
      cacheHit: false
    });

    // Keep only recent history (last 100 entries)
    if (history.length > 100) {
      history.shift();
    }

    this.optimizationStats.performanceHistorySize = this.performanceHistory.size;
  }

  /**
   * Record detailed execution history
   */
  private recordExecutionHistory(filter: FilterNode, inputSize: number, outputSize: number, executionTime: number): void {
    const key = this.generateFilterKey(filter);
    const history = this.performanceHistory.get(key);

    if (history && history.length > 0) {
      const lastEntry = history[history.length - 1];
      lastEntry.inputSize = inputSize;
      lastEntry.outputSize = outputSize;
      lastEntry.executionTime = executionTime;
    }
  }

  /**
   * Count filter nodes for complexity analysis
   */
  private countFilterNodes(filter: FilterNode): number {
    if (!filter.children || filter.children.length === 0) {
      return 1;
    }

    return 1 + filter.children.reduce((sum, child) => sum + this.countFilterNodes(child), 0);
  }

  /**
   * Generate execution plan for optimized execution
   */
  private generateExecutionPlan(filter: FilterNode): FilterExecutionPlan {
    const executionOrder: FilterNode[] = [];
    const parallelGroups: FilterNode[][] = [];
    const earlyTerminationPoints: number[] = [];
    const cacheOpportunities: string[] = [];

    this.analyzeExecutionPlan(filter, executionOrder, parallelGroups, earlyTerminationPoints, cacheOpportunities);

    return {
      executionOrder,
      parallelGroups,
      estimatedTotalCost: this.estimateFilterCost(filter),
      earlyTerminationPoints,
      cacheOpportunities
    };
  }

  /**
   * Analyze filter structure to generate execution plan
   */
  private analyzeExecutionPlan(
    filter: FilterNode,
    executionOrder: FilterNode[],
    parallelGroups: FilterNode[][],
    earlyTerminationPoints: number[],
    cacheOpportunities: string[]
  ): void {
    if (filter.type === FilterType.LOGICAL && filter.operator === FilterOperator.AND && filter.children) {
      // For AND operations, add each child to execution order
      filter.children.forEach((child, index) => {
        executionOrder.push(child);

        // Check for early termination opportunities
        const selectivity = this.estimateFilterSelectivity(child);
        if (selectivity > 0.8) {
          earlyTerminationPoints.push(index);
        }

        // Check for caching opportunities
        if (this.estimateFilterCost(child) > 5) {
          cacheOpportunities.push(child.field);
        }

        this.analyzeExecutionPlan(child, executionOrder, parallelGroups, earlyTerminationPoints, cacheOpportunities);
      });
    } else {
      executionOrder.push(filter);
    }
  }

  /**
   * Get optimization statistics for monitoring
   */
  getOptimizationStats(): FilterOptimizationStats {
    return { ...this.optimizationStats };
  }

  /**
   * Clear optimization caches
   */
  clearOptimizationCaches(): void {
    this.selectivityCache.clear();
    this.performanceHistory.clear();
    this.optimizationStats = {
      cachedSelectivityCount: 0,
      performanceHistorySize: 0,
      averageOptimizationImprovement: 0,
      totalOptimizationsApplied: 0,
      earlyTerminations: 0
    };

    logInfo('Optimization caches cleared', {
      component: 'OptimizedFilterEngine',
      operation: 'clearOptimizationCaches'
    });
  }
}

/**
 * Filter Builder for fluent API construction
 */
export class FilterBuilder {
  private currentNode?: FilterNode;

  where(field: string, operator: FilterOperator, value: unknown): FilterBuilder {
    this.currentNode = {
      type: this.inferFilterType(operator),
      field,
      operator,
      value,
      metadata: {}
    };
    return this;
  }

  and(builder: FilterBuilder): FilterBuilder {
    if (!this.currentNode) {
      throw new FilterEngineError('Cannot apply AND - no base filter defined', 'BUILDER_ERROR');
    }

    const otherFilter = builder.build();
    if (!otherFilter) {
      throw new FilterEngineError('Cannot apply AND - other filter is empty', 'BUILDER_ERROR');
    }

    this.currentNode = {
      type: FilterType.LOGICAL,
      field: '', // Logical operators don't have a specific field
      operator: FilterOperator.AND,
      value: null,
      children: [this.currentNode, otherFilter],
      metadata: {}
    };
    return this;
  }

  or(builder: FilterBuilder): FilterBuilder {
    if (!this.currentNode) {
      throw new FilterEngineError('Cannot apply OR - no base filter defined', 'BUILDER_ERROR');
    }

    const otherFilter = builder.build();
    if (!otherFilter) {
      throw new FilterEngineError('Cannot apply OR - other filter is empty', 'BUILDER_ERROR');
    }

    this.currentNode = {
      type: FilterType.LOGICAL,
      field: '',
      operator: FilterOperator.OR,
      value: null,
      children: [this.currentNode, otherFilter],
      metadata: {}
    };
    return this;
  }

  not(): FilterBuilder {
    if (!this.currentNode) {
      throw new FilterEngineError('Cannot apply NOT - no base filter defined', 'BUILDER_ERROR');
    }

    this.currentNode = {
      type: FilterType.LOGICAL,
      field: '',
      operator: FilterOperator.NOT,
      value: null,
      children: [this.currentNode],
      metadata: { negate: true }
    };
    return this;
  }

  build(): FilterNode | null {
    return this.currentNode || null;
  }

  private inferFilterType(operator: FilterOperator): FilterType {
    // Comparison operators
    if ([
      FilterOperator.EQUALS, FilterOperator.NOT_EQUALS, FilterOperator.GREATER_THAN,
      FilterOperator.LESS_THAN, FilterOperator.GREATER_EQUAL, FilterOperator.LESS_EQUAL,
      FilterOperator.CONTAINS, FilterOperator.STARTS_WITH, FilterOperator.ENDS_WITH,
      FilterOperator.IN, FilterOperator.NOT_IN, FilterOperator.BETWEEN, FilterOperator.LIKE
    ].includes(operator)) {
      return FilterType.COMPARISON;
    }

    // Logical operators
    if ([FilterOperator.AND, FilterOperator.OR, FilterOperator.NOT].includes(operator)) {
      return FilterType.LOGICAL;
    }

    // Temporal operators
    if ([FilterOperator.BEFORE, FilterOperator.AFTER, FilterOperator.WITHIN].includes(operator)) {
      return FilterType.TEMPORAL;
    }

    // Spatial operators
    if ([FilterOperator.NEAR, FilterOperator.WITHIN_RADIUS].includes(operator)) {
      return FilterType.SPATIAL;
    }

    // Semantic operators
    if ([FilterOperator.SIMILAR_TO, FilterOperator.RELATED_TO].includes(operator)) {
      return FilterType.SEMANTIC;
    }

    return FilterType.COMPARISON; // Default fallback
  }
}

/**
 * Performance optimizer for filter execution
 */
class FilterPerformanceOptimizer {
  optimize(filter: FilterNode): FilterNode {
    // Apply various optimization strategies
    let optimized = this.reorderFilters(filter);
    optimized = this.eliminateRedundantNodes(optimized);
    optimized = this.pushDownFilters(optimized);
    return optimized;
  }

  private reorderFilters(filter: FilterNode): FilterNode {
    // Reorder filters to put cheapest operations first
    if (filter.type === FilterType.LOGICAL && filter.children) {
      const reorderedChildren = filter.children.map(child => this.reorderFilters(child));

      if (filter.operator === FilterOperator.AND) {
        // For AND operations, put cheapest filters first
        return {
          ...filter,
          children: this.sortByCost(reorderedChildren)
        };
      } else if (filter.operator === FilterOperator.OR) {
        // For OR operations, put most selective filters first
        return {
          ...filter,
          children: this.sortBySelectivity(reorderedChildren)
        };
      }
    }

    return filter;
  }

  private eliminateRedundantNodes(filter: FilterNode): FilterNode {
    // Remove redundant or contradictory filters
    if (filter.children) {
      const filteredChildren = filter.children
        .map(child => this.eliminateRedundantNodes(child))
        .filter(child => !this.isRedundant(child));

      return {
        ...filter,
        children: filteredChildren
      };
    }

    return filter;
  }

  private pushDownFilters(filter: FilterNode): FilterNode {
    // Push filters down to reduce the search space early
    // This is a simplified version - full implementation would be more complex
    return filter;
  }

  private sortByCost(filters: FilterNode[]): FilterNode[] {
    // Sort filters by estimated execution cost
    return filters.sort((a, b) => this.estimateCost(a) - this.estimateCost(b));
  }

  private sortBySelectivity(filters: FilterNode[]): FilterNode[] {
    // Sort filters by estimated selectivity (how much data they filter out)
    return filters.sort((a, b) => this.estimateSelectivity(b) - this.estimateSelectivity(a));
  }

  private estimateCost(filter: FilterNode): number {
    // Estimate execution cost based on operator type
    const costMap: Record<FilterOperator, number> = {
      [FilterOperator.EQUALS]: 1,
      [FilterOperator.NOT_EQUALS]: 1,
      [FilterOperator.CONTAINS]: 5,
      [FilterOperator.LIKE]: 10,
      [FilterOperator.REGEX]: 20,
      [FilterOperator.IN]: 3,
      [FilterOperator.AND]: 1,
      [FilterOperator.OR]: 2,
      [FilterOperator.NOT]: 2,
      [FilterOperator.BEFORE]: 1,
      [FilterOperator.AFTER]: 1,
      [FilterOperator.WITHIN]: 3,
      [FilterOperator.AGE_LESS_THAN]: 1,
      [FilterOperator.AGE_GREATER_THAN]: 1,
      [FilterOperator.NEAR]: 5,
      [FilterOperator.WITHIN_RADIUS]: 8,
      [FilterOperator.CONTAINS_POINT]: 5,
      [FilterOperator.SIMILAR_TO]: 15,
      [FilterOperator.RELATED_TO]: 15,
      [FilterOperator.GREATER_THAN]: 1,
      [FilterOperator.LESS_THAN]: 1,
      [FilterOperator.GREATER_EQUAL]: 1,
      [FilterOperator.LESS_EQUAL]: 1,
      [FilterOperator.STARTS_WITH]: 3,
      [FilterOperator.ENDS_WITH]: 3,
      [FilterOperator.NOT_IN]: 4,
      [FilterOperator.BETWEEN]: 2
    };

    return costMap[filter.operator] || 1;
  }

  private estimateSelectivity(filter: FilterNode): number {
    // Estimate selectivity (0-1, where 1 means very selective)
    const selectivityMap: Record<FilterOperator, number> = {
      [FilterOperator.EQUALS]: 0.9,
      [FilterOperator.NOT_EQUALS]: 0.8,
      [FilterOperator.CONTAINS]: 0.3,
      [FilterOperator.LIKE]: 0.4,
      [FilterOperator.REGEX]: 0.2,
      [FilterOperator.IN]: 0.7,
      [FilterOperator.AND]: 0.8,
      [FilterOperator.OR]: 0.3,
      [FilterOperator.NOT]: 0.5,
      [FilterOperator.BEFORE]: 0.6,
      [FilterOperator.AFTER]: 0.6,
      [FilterOperator.WITHIN]: 0.5,
      [FilterOperator.AGE_LESS_THAN]: 0.6,
      [FilterOperator.AGE_GREATER_THAN]: 0.6,
      [FilterOperator.NEAR]: 0.4,
      [FilterOperator.WITHIN_RADIUS]: 0.3,
      [FilterOperator.CONTAINS_POINT]: 0.4,
      [FilterOperator.SIMILAR_TO]: 0.2,
      [FilterOperator.RELATED_TO]: 0.2,
      [FilterOperator.GREATER_THAN]: 0.5,
      [FilterOperator.LESS_THAN]: 0.5,
      [FilterOperator.GREATER_EQUAL]: 0.5,
      [FilterOperator.LESS_EQUAL]: 0.5,
      [FilterOperator.STARTS_WITH]: 0.7,
      [FilterOperator.ENDS_WITH]: 0.7,
      [FilterOperator.NOT_IN]: 0.6,
      [FilterOperator.BETWEEN]: 0.8
    };

    return selectivityMap[filter.operator] || 0.5;
  }

  private isRedundant(filter: FilterNode): boolean {
    // Check if filter is redundant (e.g., always true/false)
    // Simplified implementation
    return false;
  }
}

/**
 * Filter Engine Error Class
 */
export class FilterEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FilterEngineError';
  }
}