import { FilterNode, FilterType, FilterOperator, FilterValidationResult } from './types';

/**
 * FilterValidation class for runtime validation of filter syntax and semantics
 */
export class FilterValidation {
  /**
   * Validate a filter node
   */
  validate(filter: FilterNode): FilterValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    try {
      this.validateNode(filter, '', errors, warnings);
    } catch (error) {
      errors.push({
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate filter with detailed error reporting
   */
  validateWithDetails(filter: FilterNode): FilterValidationResult {
    return this.validate(filter);
  }

  /**
   * Quick validation check
   */
  isValid(filter: FilterNode): boolean {
    const result = this.validate(filter);
    return result.isValid;
  }

  /**
   * Validate a single node recursively
   */
  private validateNode(
    node: FilterNode,
    path: string,
    errors: any[],
    warnings: any[]
  ): void {
    const currentPath = path ? `${path}.${node.field}` : node.field;

    // Validate field name
    if (!node.field && node.type !== FilterType.LOGICAL) {
      if (node.type === FilterType.COMPARISON) {
        errors.push({
          code: 'MISSING_FIELD',
          message: 'Comparison filter must have a field name',
          path: currentPath,
          field: node.field,
          operator: node.operator
        });
      }
    }

    // Validate operator
    if (!node.operator) {
      errors.push({
        code: 'MISSING_OPERATOR',
        message: 'Filter must have an operator',
        path: currentPath,
        field: node.field
      });
    } else {
      this.validateOperator(node, currentPath, errors, warnings);
    }

    // Validate value
    this.validateValue(node, currentPath, errors, warnings);

    // Validate children
    if (node.children) {
      this.validateChildren(node, currentPath, errors, warnings);
    }

    // Check for common issues
    this.checkCommonIssues(node, currentPath, errors, warnings);
  }

  /**
   * Validate operator usage
   */
  private validateOperator(
    node: FilterNode,
    path: string,
    errors: any[],
    warnings: any[]
  ): void {
    // Check if operator is valid for the filter type
    if (node.type === FilterType.COMPARISON) {
      const validComparisonOperators = [
        FilterOperator.EQUALS, FilterOperator.NOT_EQUALS, FilterOperator.GREATER_THAN,
        FilterOperator.LESS_THAN, FilterOperator.GREATER_EQUAL, FilterOperator.LESS_EQUAL,
        FilterOperator.CONTAINS, FilterOperator.STARTS_WITH, FilterOperator.ENDS_WITH,
        FilterOperator.IN, FilterOperator.NOT_IN, FilterOperator.BETWEEN, FilterOperator.LIKE,
        FilterOperator.REGEX
      ];

      if (!validComparisonOperators.includes(node.operator)) {
        errors.push({
          code: 'INVALID_OPERATOR_FOR_TYPE',
          message: `Operator ${node.operator} is not valid for comparison filters`,
          path,
          field: node.field,
          operator: node.operator
        });
      }
    }

    if (node.type === FilterType.LOGICAL) {
      const validLogicalOperators = [
        FilterOperator.AND, FilterOperator.OR, FilterOperator.NOT
      ];

      if (!validLogicalOperators.includes(node.operator)) {
        errors.push({
          code: 'INVALID_OPERATOR_FOR_TYPE',
          message: `Operator ${node.operator} is not valid for logical filters`,
          path,
          operator: node.operator
        });
      }
    }

    // Validate operator-specific requirements
    this.validateOperatorRequirements(node, path, errors, warnings);
  }

  /**
   * Validate operator-specific requirements
   */
  private validateOperatorRequirements(
    node: FilterNode,
    path: string,
    errors: any[],
    warnings: any[]
  ): void {
    switch (node.operator) {
      case FilterOperator.IN:
      case FilterOperator.NOT_IN:
        if (!Array.isArray(node.value)) {
          errors.push({
            code: 'INVALID_VALUE_TYPE',
            message: `Operator ${node.operator} requires array value`,
            path,
            field: node.field,
            operator: node.operator,
            value: node.value
          });
        }
        break;

      case FilterOperator.BETWEEN:
        if (!Array.isArray(node.value) || node.value.length !== 2) {
          errors.push({
            code: 'INVALID_VALUE_TYPE',
            message: `Operator ${node.operator} requires array with exactly 2 values`,
            path,
            field: node.field,
            operator: node.operator,
            value: node.value
          });
        }
        break;

      case FilterOperator.REGEX:
        if (typeof node.value !== 'string') {
          errors.push({
            code: 'INVALID_VALUE_TYPE',
            message: `Operator ${node.operator} requires string value`,
            path,
            field: node.field,
            operator: node.operator,
            value: node.value
          });
        } else {
          try {
            new RegExp(node.value);
          } catch {
            errors.push({
              code: 'INVALID_REGEX',
              message: `Invalid regex pattern: ${node.value}`,
              path,
              field: node.field,
              operator: node.operator,
              value: node.value
            });
          }
        }
        break;

      case FilterOperator.NOT:
        if (!node.children || node.children.length === 0) {
          errors.push({
            code: 'MISSING_CHILDREN',
            message: 'NOT operator requires at least one child filter',
            path,
            operator: node.operator
          });
        }
        break;

      case FilterOperator.AND:
      case FilterOperator.OR:
        if (!node.children || node.children.length < 2) {
          errors.push({
            code: 'INSUFFICIENT_CHILDREN',
            message: `${node.operator} operator requires at least 2 child filters`,
            path,
            operator: node.operator
          });
        }
        break;
    }
  }

  /**
   * Validate value based on field and operator
   */
  private validateValue(
    node: FilterNode,
    path: string,
    errors: any[],
    warnings: any[]
  ): void {
    if (node.value === undefined || node.value === null) {
      // Null/undefined values are generally acceptable
      return;
    }

    // Type validation based on operator
    switch (node.operator) {
      case FilterOperator.GREATER_THAN:
      case FilterOperator.LESS_THAN:
      case FilterOperator.GREATER_EQUAL:
      case FilterOperator.LESS_EQUAL:
        if (typeof node.value !== 'number' && typeof node.value !== 'string') {
          warnings.push({
            code: 'TYPE_MISMATCH',
            message: `Numeric comparison with non-numeric value`,
            path,
            field: node.field,
            operator: node.operator,
            value: node.value,
            suggestion: 'Consider converting value to number'
          });
        }
        break;

      case FilterOperator.CONTAINS:
      case FilterOperator.STARTS_WITH:
      case FilterOperator.ENDS_WITH:
      case FilterOperator.LIKE:
        if (typeof node.value !== 'string') {
          errors.push({
            code: 'INVALID_VALUE_TYPE',
            message: `String operator ${node.operator} requires string value`,
            path,
            field: node.field,
            operator: node.operator,
            value: node.value
          });
        }
        break;
    }
  }

  /**
   * Validate child filters
   */
  private validateChildren(
    node: FilterNode,
    path: string,
    errors: any[],
    warnings: any[]
  ): void {
    if (!node.children || node.children.length === 0) {
      return;
    }

    // Check nesting depth
    const depth = this.calculateDepth(node);
    if (depth > 10) {
      warnings.push({
        code: 'EXCESSIVE_NESTING',
        message: `Filter nesting depth (${depth}) exceeds recommended maximum (10)`,
        path,
        suggestion: 'Consider simplifying the filter structure'
      });
    }

    // Validate each child
    node.children.forEach((child, index) => {
      const childPath = `${path}[${index}]`;
      this.validateNode(child, childPath, errors, warnings);
    });

    // Check for redundant filters
    this.checkRedundantFilters(node.children, path, warnings);
  }

  /**
   * Check for common issues
   */
  private checkCommonIssues(
    node: FilterNode,
    path: string,
    errors: any[],
    warnings: any[]
  ): void {
    // Check for potentially problematic patterns
    if (node.operator === FilterOperator.CONTAINS && typeof node.value === 'string') {
      if (node.value.length < 2) {
        warnings.push({
          code: 'SHORT_SEARCH_TERM',
          message: 'Very short search term may return too many results',
          path,
          field: node.field,
          operator: node.operator,
          value: node.value,
          suggestion: 'Consider using exact match or longer search term'
        });
      }
    }

    // Check for regex performance issues
    if (node.operator === FilterOperator.REGEX && typeof node.value === 'string') {
      if (node.value.startsWith('.*') || node.value.startsWith('.+')) {
        warnings.push({
          code: 'INEFFICIENT_REGEX',
          message: 'Regex starting with .* or .+ may cause performance issues',
          path,
          field: node.field,
          operator: node.operator,
          value: node.value,
          suggestion: 'Consider using CONTAINS or LIKE instead'
        });
      }
    }

    // Check for case sensitivity issues
    if (node.operator === FilterOperator.CONTAINS && typeof node.value === 'string') {
      if (node.value !== node.value.toLowerCase() && node.value !== node.value.toUpperCase()) {
        warnings.push({
          code: 'CASE_SENSITIVITY',
          message: 'Mixed case search term with case-sensitive database',
          path,
          field: node.field,
          operator: node.operator,
          value: node.value,
          suggestion: 'Consider case-insensitive search or normalize case'
        });
      }
    }
  }

  /**
   * Check for redundant filters
   */
  private checkRedundantFilters(
    children: FilterNode[],
    path: string,
    warnings: any[]
  ): void {
    const seen = new Map<string, FilterNode[]>();

    for (const child of children) {
      const key = `${child.field}:${child.operator}:${String(child.value)}`;
      if (!seen.has(key)) {
        seen.set(key, []);
      }
      seen.get(key)!.push(child);
    }

    for (const [key, nodes] of seen) {
      if (nodes.length > 1) {
        warnings.push({
          code: 'REDUNDANT_FILTERS',
          message: `Duplicate filter found: ${key}`,
          path,
          suggestion: 'Consider removing duplicate filters'
        });
      }
    }
  }

  /**
   * Calculate filter depth
   */
  private calculateDepth(node: FilterNode): number {
    if (!node.children || node.children.length === 0) {
      return 1;
    }

    const childDepths = node.children.map(child => this.calculateDepth(child));
    return 1 + Math.max(...childDepths);
  }

  /**
   * Validate filter structure
   */
  validateStructure(filter: FilterNode): { isValid: boolean; issues: string[] } {
    const errors: any[] = [];
    const warnings: any[] = [];
    this.validateNode(filter, '', errors, warnings);

    const issues = [...errors, ...warnings].map(issue => issue.message);

    return {
      isValid: errors.length === 0,
      issues
    };
  }

  /**
   * Get validation rules for documentation
   */
  getValidationRules() {
    return {
      maxNestingDepth: 10,
      maxChildrenPerNode: 100,
      supportedOperators: Object.values(FilterOperator),
      supportedTypes: Object.values(FilterType),
      rules: [
        'Field names must be non-empty strings',
        'Operators must be valid for their filter type',
        'IN/NOT IN operators require array values',
        'BETWEEN operator requires exactly 2 values',
        'REGEX operator requires valid regex pattern',
        'AND/OR operators require at least 2 children',
        'NOT operator requires exactly 1 child'
      ]
    };
  }
}