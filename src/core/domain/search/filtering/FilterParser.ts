import { FilterNode, FilterType, FilterOperator, ParsedFilterResult } from './types';

/**
 * FilterParser class for parsing filter expressions into executable filter objects
 */
export class FilterParser {
  /**
   * Parse a filter expression string into a FilterNode
   */
  parse(expression: string): FilterNode {
    try {
      const trimmed = expression.trim();
      const result = this.parseExpression(trimmed);

      if (!result.filter) {
        throw new FilterParseError(`Failed to parse filter expression: ${expression}`);
      }

      return result.filter;
    } catch (error) {
      throw new FilterParseError(
        `Parse error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse with detailed result including variables and metadata
   */
  parseWithMetadata(expression: string): ParsedFilterResult {
    try {
      const trimmed = expression.trim();
      return this.parseExpression(trimmed);
    } catch (error) {
      throw new FilterParseError(
        `Parse error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse expression with detailed result
   */
  private parseExpression(expression: string): ParsedFilterResult {
    const variables = new Map<string, unknown>();

    // Handle logical operators
    const result = this.parseLogicalExpression(expression, variables);

    return {
      filter: result.filter,
      variables,
      metadata: result.metadata || {}
    };
  }

  /**
   * Parse logical expressions (AND, OR, NOT)
   */
  private parseLogicalExpression(
    expression: string,
    variables: Map<string, unknown>
  ): ParsedFilterResult {
    // Handle NOT operator
    if (expression.trim().startsWith('NOT ')) {
      const innerResult = this.parseLogicalExpression(
        expression.substring(4).trim(),
        variables
      );

      return {
        filter: {
          type: FilterType.LOGICAL,
          field: '',
          operator: FilterOperator.NOT,
          value: null,
          children: [innerResult.filter],
          metadata: { ...innerResult.metadata, negate: true }
        },
        variables: innerResult.variables,
        metadata: innerResult.metadata
      };
    }

    // Handle parentheses
    if (expression.startsWith('(') && expression.endsWith(')')) {
      return this.parseLogicalExpression(expression.slice(1, -1), variables);
    }

    // Split by OR (lower precedence)
    const orParts = this.splitByOperator(expression, ' OR ');

    if (orParts.length > 1) {
      const children = orParts.map(part =>
        this.parseAndExpression(part.trim(), variables)
      );

      return {
        filter: {
          type: FilterType.LOGICAL,
          field: '',
          operator: FilterOperator.OR,
          value: null,
          children: children.map(c => c.filter).filter(Boolean) as FilterNode[]
        },
        variables: this.mergeVariables(variables, children),
        metadata: { logicalOperator: 'OR' }
      };
    }

    // Parse as AND expression
    return this.parseAndExpression(expression, variables);
  }

  /**
   * Parse AND expressions
   */
  private parseAndExpression(
    expression: string,
    variables: Map<string, unknown>
  ): ParsedFilterResult {
    // Split by AND (higher precedence)
    const andParts = this.splitByOperator(expression, ' AND ');

    if (andParts.length > 1) {
      const children = andParts.map(part =>
        this.parseComparisonExpression(part.trim(), variables)
      );

      return {
        filter: {
          type: FilterType.LOGICAL,
          field: '',
          operator: FilterOperator.AND,
          value: null,
          children: children.map(c => c.filter).filter(Boolean) as FilterNode[]
        },
        variables: this.mergeVariables(variables, children),
        metadata: { logicalOperator: 'AND' }
      };
    }

    // Parse as comparison expression
    return this.parseComparisonExpression(expression, variables);
  }

  /**
   * Parse comparison expressions
   */
  private parseComparisonExpression(
    expression: string,
    variables: Map<string, unknown>
  ): ParsedFilterResult {
    // Handle parentheses
    if (expression.startsWith('(') && expression.endsWith(')')) {
      return this.parseComparisonExpression(expression.slice(1, -1), variables);
    }

    // Parse field:operator:value pattern
    const match = expression.match(/^(\w+|\$.+?)\s*([<>=!~]+|(?:NOT\s+)?(?:IN|BETWEEN|LIKE|CONTAINS))\s*(.+)$/);

    if (match) {
      const [, field, operatorStr, valueStr] = match;
      const operator = this.parseOperator(operatorStr.trim());
      const value = this.parseValue(valueStr.trim(), variables);

      return {
        filter: {
          type: FilterType.COMPARISON,
          field,
          operator,
          value
        },
        variables,
        metadata: { field, operator, valueType: typeof value }
      };
    }

    throw new FilterParseError(`Invalid comparison expression: ${expression}`);
  }

  /**
   * Parse operator string
   */
  private parseOperator(opStr: string): FilterOperator {
    const opMap: Record<string, FilterOperator> = {
      '=': FilterOperator.EQUALS,
      '==': FilterOperator.EQUALS,
      'eq': FilterOperator.EQUALS,
      '!=': FilterOperator.NOT_EQUALS,
      '<>': FilterOperator.NOT_EQUALS,
      'ne': FilterOperator.NOT_EQUALS,
      '>': FilterOperator.GREATER_THAN,
      'gt': FilterOperator.GREATER_THAN,
      '<': FilterOperator.LESS_THAN,
      'lt': FilterOperator.LESS_THAN,
      '>=': FilterOperator.GREATER_EQUAL,
      'ge': FilterOperator.GREATER_EQUAL,
      '<=': FilterOperator.LESS_EQUAL,
      'le': FilterOperator.LESS_EQUAL,
      '~': FilterOperator.CONTAINS,
      'contains': FilterOperator.CONTAINS,
      'like': FilterOperator.LIKE,
      'in': FilterOperator.IN,
      'not in': FilterOperator.NOT_IN,
      'between': FilterOperator.BETWEEN
    };

    return opMap[opStr.toLowerCase()] || FilterOperator.EQUALS;
  }

  /**
   * Parse value with support for variables and different data types
   */
  private parseValue(valueStr: string, variables: Map<string, unknown>): unknown {
    const trimmed = valueStr.trim();

    // Handle variables ($var)
    if (trimmed.startsWith('$')) {
      const varName = trimmed.substring(1);
      return variables.get(varName) ?? trimmed;
    }

    // Handle quoted strings
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }

    // Handle arrays [1,2,3]
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1);
      return inner.split(',').map(v => this.parseValue(v.trim(), variables));
    }

    // Handle boolean
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

    // Handle null
    if (trimmed === 'null') return null;

    // Handle numbers
    const num = Number(trimmed);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }

    // Return as string
    return trimmed;
  }

  /**
   * Split expression by operator, respecting parentheses
   */
  private splitByOperator(expression: string, operator: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];

      if (char === '(') {
        depth++;
        current += char;
      } else if (char === ')') {
        depth--;
        current += char;
      } else if (depth === 0 && expression.substring(i, i + operator.length) === operator) {
        parts.push(current);
        current = '';
        i += operator.length - 1; // Skip the operator
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  /**
   * Merge variables from multiple results
   */
  private mergeVariables(
    main: Map<string, unknown>,
    children: ParsedFilterResult[]
  ): Map<string, unknown> {
    const merged = new Map(main);

    for (const child of children) {
      child.variables.forEach((value, key) => {
        merged.set(key, value);
      });
    }

    return merged;
  }
}

/**
 * Filter Parse Error Class
 */
export class FilterParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterParseError';
  }
}