import { FilterNode, FilterType, FilterOperator } from './types';

/**
 * FilterBuilder class for fluent API filter construction
 */
export class FilterBuilder {
  private currentNode?: FilterNode;

  /**
   * Create a comparison filter
   */
  where(field: string, operator: FilterOperator, value: unknown): FilterBuilder {
    this.currentNode = {
      type: this.inferFilterType(operator),
      field,
      operator,
      value
    };
    return this;
  }

  /**
   * Combine with AND logic
   */
  and(builder: FilterBuilder): FilterBuilder {
    if (!this.currentNode) {
      throw new FilterBuilderError('Cannot apply AND - no base filter defined');
    }

    const otherFilter = builder.build();
    if (!otherFilter) {
      throw new FilterBuilderError('Cannot apply AND - other filter is empty');
    }

    this.currentNode = {
      type: FilterType.LOGICAL,
      field: '',
      operator: FilterOperator.AND,
      value: null,
      children: [this.currentNode, otherFilter]
    };
    return this;
  }

  /**
   * Combine with OR logic
   */
  or(builder: FilterBuilder): FilterBuilder {
    if (!this.currentNode) {
      throw new FilterBuilderError('Cannot apply OR - no base filter defined');
    }

    const otherFilter = builder.build();
    if (!otherFilter) {
      throw new FilterBuilderError('Cannot apply OR - other filter is empty');
    }

    this.currentNode = {
      type: FilterType.LOGICAL,
      field: '',
      operator: FilterOperator.OR,
      value: null,
      children: [this.currentNode, otherFilter]
    };
    return this;
  }

  /**
   * Apply NOT logic
   */
  not(): FilterBuilder {
    if (!this.currentNode) {
      throw new FilterBuilderError('Cannot apply NOT - no base filter defined');
    }

    this.currentNode = {
      type: FilterType.LOGICAL,
      field: '',
      operator: FilterOperator.NOT,
      value: null,
      children: [this.currentNode]
    };
    return this;
  }

  /**
   * Build the final filter node
   */
  build(): FilterNode | null {
    return this.currentNode || null;
  }

  /**
   * Create a new builder instance
   */
  static create(): FilterBuilder {
    return new FilterBuilder();
  }

  /**
   * Infer filter type from operator
   */
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

    return FilterType.COMPARISON;
  }
}

/**
 * FilterBuilder Error Class
 */
export class FilterBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterBuilderError';
  }
}