import { SearchResult } from './types';
import { logError, logWarn, logInfo } from '../../infrastructure/config/Logger';
import { OptimizedFilterEngine } from './filtering/FilterEngine';

/**
 * Advanced filter processing module for search operations
 * Extracted from SearchService to improve maintainability and separation of concerns
 */

// ===== FILTER PROCESSING INTERFACES =====

/**
 * Filter validation result
 */
export interface FilterValidationResult {
  isValid: boolean;
  filterNode?: any;
  error?: string;
}

/**
 * Enhanced filter expression validation result
 */
export interface EnhancedFilterValidationResult {
  isValid: boolean;
  errors: FilterValidationError[];
  warnings: FilterValidationWarning[];
  suggestions?: string[];
}

/**
 * Validation error with position information
 */
export interface FilterValidationError {
  code: string;
  message: string;
  position: number;
  length: number;
  severity: 'error' | 'warning';
  suggestion?: string;
}

/**
 * Validation warning for potential issues
 */
export interface FilterValidationWarning {
  code: string;
  message: string;
  position: number;
  suggestion?: string;
}

/**
 * Field type information for validation
 */
interface FieldTypeInfo {
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
}

/**
 * Comprehensive expression validator
 */
class FilterExpressionValidator {
  private readonly fieldSchema: Map<string, FieldTypeInfo>;
  private readonly knownOperators = new Set(['=', '==', '!=', '<>', '>', '<', '>=', '<=', '~', 'LIKE', 'IN', 'NOT IN']);

  constructor() {
    this.fieldSchema = this.buildFieldSchema();
  }

  /**
   * Validate filter expression comprehensively
   */
  validateExpression(expression: string): EnhancedFilterValidationResult {
    const result: EnhancedFilterValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // 1. Basic syntax validation
      const syntaxResult = this.validateSyntax(expression);
      result.errors.push(...syntaxResult.errors);
      result.warnings.push(...syntaxResult.warnings);

      // 2. Lexical analysis validation
      const lexicalResult = this.validateLexical(expression);
      result.errors.push(...lexicalResult.errors);
      result.warnings.push(...lexicalResult.warnings);

      // 3. Semantic validation (if syntax is valid)
      if (result.errors.length === 0) {
        const semanticResult = this.validateSemantic(expression);
        result.errors.push(...semanticResult.errors);
        result.warnings.push(...semanticResult.warnings);
        result.suggestions = semanticResult.suggestions;
      }

      result.isValid = result.errors.length === 0;
    } catch (error) {
      result.errors.push({
        code: 'VALIDATION_EXCEPTION',
        message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        position: 0,
        length: expression.length,
        severity: 'error'
      });
      result.isValid = false;
    }

    return result;
  }

  /**
   * Basic syntax validation (parentheses, basic structure)
   */
  private validateSyntax(expression: string): { errors: FilterValidationError[]; warnings: FilterValidationWarning[] } {
    const errors: FilterValidationError[] = [];
    const warnings: FilterValidationWarning[] = [];

    // Check for balanced parentheses
    let parenDepth = 0;
    for (let i = 0; i < expression.length; i++) {
      if (expression[i] === '(') {
        parenDepth++;
      } else if (expression[i] === ')') {
        parenDepth--;
        if (parenDepth < 0) {
          errors.push({
            code: 'UNBALANCED_PARENTHESIS',
            message: 'Unbalanced closing parenthesis',
            position: i,
            length: 1,
            severity: 'error',
            suggestion: 'Check for extra closing parentheses or missing opening parentheses'
          });
        }
      }
    }

    if (parenDepth > 0) {
      errors.push({
        code: 'UNBALANCED_PARENTHESIS',
        message: 'Unbalanced opening parenthesis',
        position: expression.length - 1,
        length: 1,
        severity: 'error',
        suggestion: 'Check for missing closing parentheses'
      });
    }

    // Check for empty parentheses
    const emptyParenMatch = expression.match(/\(\s*\)/g);
    if (emptyParenMatch) {
      emptyParenMatch.forEach(match => {
        const position = expression.indexOf(match);
        warnings.push({
          code: 'EMPTY_PARENTHESIS',
          message: 'Empty parentheses group found',
          position,
          suggestion: 'Remove empty parentheses or add filter conditions inside'
        });
      });
    }

    // Check for double operators
    const doubleOpMatch = expression.match(/([=<>!~]+)\s*\1/g);
    if (doubleOpMatch) {
      doubleOpMatch.forEach(match => {
        const position = expression.indexOf(match);
        errors.push({
          code: 'DOUBLE_OPERATOR',
          message: 'Duplicate operator found',
          position,
          length: match.length,
          severity: 'error',
          suggestion: 'Remove duplicate operator or check for typos'
        });
      });
    }

    return { errors, warnings };
  }

  /**
   * Lexical validation (token structure, operator usage)
   */
  private validateLexical(expression: string): { errors: FilterValidationError[]; warnings: FilterValidationWarning[] } {
    const errors: FilterValidationError[] = [];
    const warnings: FilterValidationWarning[] = [];

    try {
      const tokens = this.tokenizeExpression(expression);

      // Validate token sequence
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const prevToken = i > 0 ? tokens[i - 1] : null;
        const nextToken = i < tokens.length - 1 ? tokens[i + 1] : null;

        switch (token.type) {
          case TokenType.OPERATOR:
            if (!this.knownOperators.has(token.value)) {
              errors.push({
                code: 'UNKNOWN_OPERATOR',
                message: `Unknown operator: ${token.value}`,
                position: token.position,
                length: token.value.length,
                severity: 'error',
                suggestion: `Use one of: ${Array.from(this.knownOperators).join(', ')}`
              });
            }

            // Check for operator without field
            if (!prevToken || prevToken.type === TokenType.LOGICAL_OP) {
              errors.push({
                code: 'OPERATOR_WITHOUT_FIELD',
                message: 'Operator without preceding field',
                position: token.position,
                length: token.value.length,
                severity: 'error',
                suggestion: 'Add field name before operator'
              });
            }

            // Check for consecutive operators
            if (prevToken && prevToken.type === TokenType.OPERATOR) {
              errors.push({
                code: 'CONSECUTIVE_OPERATORS',
                message: 'Consecutive operators found',
                position: token.position,
                length: token.value.length,
                severity: 'error',
                suggestion: 'Remove duplicate operator or separate with field/value'
              });
            }
            break;

          case TokenType.LOGICAL_OP:
            // Check for logical operator without expressions
            if ((!prevToken || prevToken.type === TokenType.LOGICAL_OP) &&
                token.value !== 'NOT') {
              errors.push({
                code: 'LOGICAL_OP_WITHOUT_EXPRESSION',
                message: `Logical operator ${token.value} without preceding expression`,
                position: token.position,
                length: token.value.length,
                severity: 'error',
                suggestion: 'Add filter expression before logical operator'
              });
            }

            // Check for logical operator without following expression
            if (!nextToken || nextToken.type === TokenType.LOGICAL_OP) {
              errors.push({
                code: 'LOGICAL_OP_WITHOUT_EXPRESSION',
                message: `Logical operator ${token.value} without following expression`,
                position: token.position,
                length: token.value.length,
                severity: 'error',
                suggestion: 'Add filter expression after logical operator'
              });
            }
            break;

          case TokenType.VALUE:
            // Validate value format
            const valueValidation = this.validateValueFormat(token.value, token.position);
            errors.push(...valueValidation.errors);
            warnings.push(...valueValidation.warnings);
            break;
        }
      }

      // Check for incomplete expressions at end
      const lastToken = tokens[tokens.length - 2]; // Second to last (before EOF)
      if (lastToken && lastToken.type === TokenType.OPERATOR) {
        errors.push({
          code: 'INCOMPLETE_EXPRESSION',
          message: 'Expression ends with incomplete field comparison',
          position: lastToken.position,
          length: lastToken.value.length,
          severity: 'error',
          suggestion: 'Add value after operator to complete the comparison'
        });
      }

    } catch (error) {
      errors.push({
        code: 'LEXICAL_VALIDATION_FAILED',
        message: `Lexical validation failed: ${error instanceof Error ? error.message : String(error)}`,
        position: 0,
        length: expression.length,
        severity: 'error'
      });
    }

    return { errors, warnings };
  }

  /**
   * Semantic validation (field existence, type compatibility)
   */
  private validateSemantic(expression: string): {
    errors: FilterValidationError[];
    warnings: FilterValidationWarning[];
    suggestions?: string[];
  } {
    const errors: FilterValidationError[] = [];
    const warnings: FilterValidationWarning[] = [];
    const suggestions: string[] = [];

    try {
      const tokens = this.tokenizeExpression(expression);
      let position = 0;

      while (position < tokens.length - 1) { // -1 to avoid EOF token
        const token = tokens[position];

        if (token.type === TokenType.FIELD) {
          const fieldInfo = this.fieldSchema.get(token.value);

          if (!fieldInfo) {
            // Suggest similar field names
            const similarFields = this.findSimilarFields(token.value);
            errors.push({
              code: 'UNKNOWN_FIELD',
              message: `Unknown field: ${token.value}`,
              position: token.position,
              length: token.value.length,
              severity: 'error',
              suggestion: similarFields.length > 0 ?
                `Did you mean: ${similarFields.join(', ')}` :
                'Check field name spelling or use available fields'
            });
          } else {
            // Validate next token (operator) is compatible with field type
            const nextToken = tokens[position + 1];
            if (nextToken && nextToken.type === TokenType.OPERATOR) {
              const compatibility = this.checkOperatorCompatibility(fieldInfo, nextToken.value);
              if (!compatibility.isCompatible) {
                errors.push({
                  code: 'INCOMPATIBLE_OPERATOR',
                  message: `Operator ${nextToken.value} not compatible with field type ${fieldInfo.type}`,
                  position: nextToken.position,
                  length: nextToken.value.length,
                  severity: 'error',
                  suggestion: compatibility.suggestion
                });
              }
            }
          }

          // Skip operator and value tokens
          position += 3;
        } else {
          position++;
        }
      }

      // Generate improvement suggestions
      if (expression.includes('AND') && !expression.includes('OR')) {
        suggestions.push('Consider using OR conditions for broader matching');
      }

      if (expression.split('AND').length > 3) {
        suggestions.push('Complex expressions with many AND conditions may impact performance');
      }

    } catch (error) {
      errors.push({
        code: 'SEMANTIC_VALIDATION_FAILED',
        message: `Semantic validation failed: ${error instanceof Error ? error.message : String(error)}`,
        position: 0,
        length: expression.length,
        severity: 'error'
      });
    }

    return { errors, warnings, suggestions };
  }

  /**
   * Validate value format and provide warnings for potential issues
   */
  private validateValueFormat(value: string, position: number): {
    errors: FilterValidationError[];
    warnings: FilterValidationWarning[];
  } {
    const errors: FilterValidationError[] = [];
    const warnings: FilterValidationWarning[] = [];

    // Check for suspiciously long values
    if (value.length > 100) {
      warnings.push({
        code: 'LONG_VALUE',
        message: 'Very long value may impact performance',
        position,
        suggestion: 'Consider using shorter values or LIKE operator for partial matches'
      });
    }

    // Check for special characters that might need escaping
    if (/[*^$\\]/.test(value)) {
      warnings.push({
        code: 'SPECIAL_CHARACTERS',
        message: 'Special regex characters detected in value',
        position,
        suggestion: 'Use LIKE operator for pattern matching instead of exact match'
      });
    }

    return { errors, warnings };
  }

  /**
   * Check if operator is compatible with field type
   */
  private checkOperatorCompatibility(fieldInfo: FieldTypeInfo, operator: string): {
    isCompatible: boolean;
    suggestion?: string;
  } {
    switch (fieldInfo.type) {
      case 'string':
        if (!['=', '==', '!=', '<>', '~', 'LIKE', 'IN', 'NOT IN'].includes(operator)) {
          return {
            isCompatible: false,
            suggestion: 'Use string-compatible operators: =, !=, ~, LIKE, IN, NOT IN'
          };
        }
        break;

      case 'number':
        if (!['=', '==', '!=', '<>', '>', '<', '>=', '<=', 'IN', 'NOT IN'].includes(operator)) {
          return {
            isCompatible: false,
            suggestion: 'Use number-compatible operators: =, !=, >, <, >=, <=, IN, NOT IN'
          };
        }
        break;

      case 'boolean':
        if (!['=', '==', '!=', '<>'].includes(operator)) {
          return {
            isCompatible: false,
            suggestion: 'Use boolean-compatible operators: =, !='
          };
        }
        break;

      case 'date':
        if (!['=', '==', '!=', '<>', '>', '<', '>=', '<='].includes(operator)) {
          return {
            isCompatible: false,
            suggestion: 'Use date-compatible operators: =, !=, >, <, >=, <='
          };
        }
        break;
    }

    return { isCompatible: true };
  }

  /**
   * Build field schema information for validation
   */
  private buildFieldSchema(): Map<string, FieldTypeInfo> {
    const schema = new Map<string, FieldTypeInfo>();

    // Define known fields from SearchResult interface
    schema.set('id', { type: 'string', required: true });
    schema.set('content', { type: 'string', required: true });
    schema.set('summary', { type: 'string', required: false });
    schema.set('score', { type: 'number', required: true });
    schema.set('strategy', { type: 'string', required: true });
    schema.set('timestamp', { type: 'date', required: true });

    // Metadata fields
    schema.set('metadata.category', { type: 'string', required: false });
    schema.set('metadata.importanceScore', { type: 'number', required: false });
    schema.set('metadata.memoryType', { type: 'string', required: false });
    schema.set('metadata.createdAt', { type: 'date', required: false });
    schema.set('metadata.entities', { type: 'string', required: false }); // Array as string for filtering
    schema.set('metadata.keywords', { type: 'string', required: false }); // Array as string for filtering
    schema.set('metadata.confidenceScore', { type: 'number', required: false });

    return schema;
  }

  /**
   * Find similar field names for error suggestions
   */
  private findSimilarFields(fieldName: string): string[] {
    const allFields = Array.from(this.fieldSchema.keys());
    const similar: string[] = [];

    for (const field of allFields) {
      // Simple Levenshtein distance for suggestions
      const distance = this.calculateLevenshteinDistance(fieldName, field);
      if (distance <= 2 && distance > 0) { // Allow small differences
        similar.push(field);
      }
    }

    return similar.slice(0, 3); // Return top 3 suggestions
  }

  /**
   * Simple Levenshtein distance calculation for field name suggestions
   */
  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Tokenize expression for validation (reuse existing logic or implement simplified version)
   */
  private tokenizeExpression(expression: string): Token[] {
    const tokens: Token[] = [];
    let position = 0;

    while (position < expression.length) {
      const char = expression[position];

      // Skip whitespace
      if (/\s/.test(char)) {
        position++;
        continue;
      }

      // Handle quoted strings
      if (char === '"' || char === "'") {
        const quote = char;
        position++; // Skip opening quote
        let value = '';

        while (position < expression.length && expression[position] !== quote) {
          if (expression[position] === '\\') {
            position++;
            if (position < expression.length) {
              value += expression[position];
            }
          } else {
            value += expression[position];
          }
          position++;
        }

        position++; // Skip closing quote
        tokens.push({ type: TokenType.VALUE, value, position });
        continue;
      }

      // Handle parentheses
      if (char === '(') {
        tokens.push({ type: TokenType.LPAREN, value: '(', position });
        position++;
        continue;
      }

      if (char === ')') {
        tokens.push({ type: TokenType.RPAREN, value: ')', position });
        position++;
        continue;
      }

      // Handle operators
      if (this.isOperator(char)) {
        let operator = char;
        position++;

        // Handle multi-character operators
        if (position < expression.length) {
          const nextChar = expression[position];
          const twoCharOp = char + nextChar;

          if (this.isTwoCharOperator(twoCharOp)) {
            operator = twoCharOp;
            position++;
          }
        }

        tokens.push({ type: TokenType.OPERATOR, value: operator, position });
        continue;
      }

      // Handle logical operators (AND, OR, NOT)
      if (expression.substring(position, position + 3).toUpperCase() === 'AND') {
        tokens.push({ type: TokenType.LOGICAL_OP, value: 'AND', position });
        position += 3;
        continue;
      }

      if (expression.substring(position, position + 2).toUpperCase() === 'OR') {
        tokens.push({ type: TokenType.LOGICAL_OP, value: 'OR', position });
        position += 2;
        continue;
      }

      if (expression.substring(position, position + 3).toUpperCase() === 'NOT') {
        tokens.push({ type: TokenType.LOGICAL_OP, value: 'NOT', position });
        position += 3;

        // After NOT, the next significant token should be treated as a field
        // Skip whitespace
        while (position < expression.length && /\s/.test(expression[position])) {
          position++;
        }

        // If the next token exists, mark that it should be treated as a field
        if (position < expression.length) {
          const nextTokenStart = position;
          let nextValue = '';

          while (position < expression.length && !/\s/.test(expression[position]) &&
                 !this.isOperator(expression[position]) && expression[position] !== '(' && expression[position] !== ')') {
            nextValue += expression[position];
            position++;
          }

          if (nextValue) {
            tokens.push({ type: TokenType.FIELD, value: nextValue, position: nextTokenStart });
          }
        }

        continue;
      }

      // Handle field names and unquoted values
      let value = '';
      while (position < expression.length && !/\s/.test(expression[position]) &&
             !this.isOperator(expression[position]) && expression[position] !== '(' && expression[position] !== ')') {
        value += expression[position];
        position++;
      }

      if (value) {
        // More sophisticated field/value detection
        const prevToken = tokens.length > 0 ? tokens[tokens.length - 1] : null;

        // If previous token is an operator or logical operator, this must be a value
        if (prevToken && (prevToken.type === TokenType.OPERATOR || prevToken.type === TokenType.LOGICAL_OP)) {
          tokens.push({ type: TokenType.VALUE, value, position });
        }
        // If this looks like a number, treat as value
        else if (/^-?\d+\.?\d*$/.test(value)) {
          tokens.push({ type: TokenType.VALUE, value, position });
        }
        // If this contains dots and looks like a nested field, treat as field
        else if (value.includes('.') && !value.includes(' ')) {
          tokens.push({ type: TokenType.FIELD, value, position });
        }
        // If previous token was a logical operator, this should be a field
        else if (prevToken && prevToken.type === TokenType.LOGICAL_OP) {
          tokens.push({ type: TokenType.FIELD, value, position });
        }
        // If this token comes after NOT, it should be a field
        else if (prevToken && prevToken.value === 'NOT' && value && /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(value)) {
          tokens.push({ type: TokenType.FIELD, value, position });
        }
        // Default: treat as field (this is usually the first token)
        else {
          tokens.push({ type: TokenType.FIELD, value, position });
        }
      }
    }

    tokens.push({ type: TokenType.EOF, value: '', position });
    return tokens;
  }

  /**
   * Helper methods for token processing (duplicated from SearchFilterProcessor for validation)
   */
  private isOperator(char: string): boolean {
    return ['=', '!', '>', '<', '~'].includes(char);
  }

  private isTwoCharOperator(op: string): boolean {
    return ['==', '!=', '>=', '<=', '<>', '~~'].includes(op);
  }
}

/**
 * Pre-filtering result
 */
export interface PreFilteringResult {
  filteredResults: SearchResult[];
  earlyTermination: boolean;
  optimizationsApplied: string[];
}

/**
 * Post-filtering result
 */
export interface PostFilteringResult {
  refinedResults: SearchResult[];
  metrics?: any;
}

/**
 * Filter template interface
 */
export interface FilterTemplate {
  name: string;
  description: string;
  filterExpression: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
  metadata?: {
    performanceHints?: string[];
    estimatedCost?: number;
  };
}

// ===== ENHANCED EXPRESSION PARSER TYPES =====

/**
 * Token types for expression parsing
 */
enum TokenType {
  FIELD = 'field',
  OPERATOR = 'operator',
  VALUE = 'value',
  LOGICAL_OP = 'logical_op',
  LPAREN = 'lparen',
  RPAREN = 'rparen',
  EOF = 'eof'
}

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Expression tree node
 */
interface FilterExpressionNode {
  type: 'comparison' | 'logical' | 'group';
  field?: string;
  operator?: string;
  value?: unknown;
  left?: FilterExpressionNode;
  right?: FilterExpressionNode;
  children?: FilterExpressionNode[];
}

/**
 * Filter processor class for handling advanced filtering operations
 */
export class SearchFilterProcessor {
  private filterTemplates: Map<string, FilterTemplate> = new Map();
  private expressionValidator: FilterExpressionValidator;
  private filterEngine: OptimizedFilterEngine;

  constructor() {
    this.initializeDefaultTemplates();
    this.expressionValidator = new FilterExpressionValidator();
    this.filterEngine = new OptimizedFilterEngine();
  }

  /**
   * Initialize default filter templates
   */
  private initializeDefaultTemplates(): void {
    this.registerTemplate('recent_important', {
      name: 'recent_important',
      description: 'Recent memories with high importance score',
      filterExpression: 'importance_score >= 0.7 AND created_at > {days_ago}',
      parameters: [
        { name: 'days_ago', type: 'string', required: true },
      ],
    });

    this.registerTemplate('category_recent', {
      name: 'category_recent',
      description: 'Recent memories in specific category',
      filterExpression: 'category = {category_name} AND created_at > {days_ago}',
      parameters: [
        { name: 'category_name', type: 'string', required: true },
        { name: 'days_ago', type: 'string', required: true },
      ],
    });

    this.registerTemplate('high_confidence', {
      name: 'high_confidence',
      description: 'Memories with high confidence scores',
      filterExpression: 'confidence >= {min_confidence}',
      parameters: [
        { name: 'min_confidence', type: 'number', required: true },
      ],
    });

    this.registerTemplate('date_range', {
      name: 'date_range',
      description: 'Memories within specific date range',
      filterExpression: 'created_at >= {start_date} AND created_at <= {end_date}',
      parameters: [
        { name: 'start_date', type: 'string', required: true },
        { name: 'end_date', type: 'string', required: true },
      ],
    });

    this.registerTemplate('type_and_category', {
      name: 'type_and_category',
      description: 'Memories of specific type in specific category',
      filterExpression: 'memory_type = {memory_type} AND category = {category}',
      parameters: [
        { name: 'memory_type', type: 'string', required: true },
        { name: 'category', type: 'string', required: true },
      ],
    });

    this.registerTemplate('multi_category', {
      name: 'multi_category',
      description: 'Memories matching multiple categories (OR logic)',
      filterExpression: 'category = {category1} OR category = {category2} OR category = {category3}',
      parameters: [
        { name: 'category1', type: 'string', required: true },
        { name: 'category2', type: 'string', required: true },
        { name: 'category3', type: 'string', required: false },
      ],
    });

    this.registerTemplate('important_content_recent', {
      name: 'important_content_recent',
      description: 'Important recent memories containing specific content',
      filterExpression: 'importance_score >= {min_importance} AND created_at > {days_ago} AND content ~ {content_pattern}',
      parameters: [
        { name: 'min_importance', type: 'number', required: true },
        { name: 'days_ago', type: 'string', required: true },
        { name: 'content_pattern', type: 'string', required: true },
      ],
    });

    this.registerTemplate('metadata_complex', {
      name: 'metadata_complex',
      description: 'Complex filter using metadata fields',
      filterExpression: '(metadata.tags CONTAINS {tag1} OR metadata.tags CONTAINS {tag2}) AND metadata.source = {source}',
      parameters: [
        { name: 'tag1', type: 'string', required: true },
        { name: 'tag2', type: 'string', required: false },
        { name: 'source', type: 'string', required: true },
      ],
    });

    this.registerTemplate('temporal_pattern', {
      name: 'temporal_pattern',
      description: 'Memories matching temporal patterns (e.g., recent activity spikes)',
      filterExpression: 'created_at > {reference_date} AND (category = {primary_category} OR importance_score >= {min_importance})',
      parameters: [
        { name: 'reference_date', type: 'string', required: true },
        { name: 'primary_category', type: 'string', required: true },
        { name: 'min_importance', type: 'number', required: false },
      ],
    });

    this.registerTemplate('fast_category_lookup', {
      name: 'fast_category_lookup',
      description: 'Optimized category lookup with early termination',
      filterExpression: 'category = {category_name}',
      parameters: [
        { name: 'category_name', type: 'string', required: true },
      ],
      metadata: {
        performanceHints: ['early_termination', 'index_optimized'],
        estimatedCost: 1,
      },
    });

    this.registerTemplate('recent_with_limit', {
      name: 'recent_with_limit',
      description: 'Recent memories with built-in result limiting for performance',
      filterExpression: 'created_at > {cutoff_date} ORDER BY created_at DESC LIMIT {max_results}',
      parameters: [
        { name: 'cutoff_date', type: 'string', required: true },
        { name: 'max_results', type: 'number', required: false },
      ],
      metadata: {
        performanceHints: ['result_limiting', 'order_optimization'],
        estimatedCost: 2,
      },
    });

    this.registerTemplate('batch_optimized', {
      name: 'batch_optimized',
      description: 'Filter optimized for batch processing scenarios',
      filterExpression: 'memory_type = {memory_type} AND created_at >= {batch_start_date}',
      parameters: [
        { name: 'memory_type', type: 'string', required: true },
        { name: 'batch_start_date', type: 'string', required: true },
      ],
      metadata: {
        performanceHints: ['batch_processing', 'parallel_execution'],
        estimatedCost: 3,
      },
    });
  }

  /**
   * Register a filter template
   */
  registerTemplate(name: string, template: FilterTemplate): void {
    this.filterTemplates.set(name, template);
  }

  /**
   * Get a filter template by name
   */
  getTemplate(name: string): FilterTemplate | undefined {
    return this.filterTemplates.get(name);
  }

  /**
   * List all available template names
   */
  listAvailableTemplates(): string[] {
    return Array.from(this.filterTemplates.keys());
  }

  /**
   * Validate filter expression
   */
  validateFilterExpression(expression: string): FilterValidationResult {
    if (!expression.trim()) {
      return { isValid: false, error: 'Filter expression cannot be empty' };
    }

    try {
      // Use the enhanced validator for comprehensive validation
      const validation = this.expressionValidator.validateExpression(expression);

      if (!validation.isValid) {
        // Convert enhanced validation result to legacy format for backward compatibility
        const firstError = validation.errors[0];
        return {
          isValid: false,
          error: firstError ? firstError.message : 'Filter expression validation failed'
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Enhanced validation with detailed error reporting
   */
  validateFilterExpressionEnhanced(expression: string): EnhancedFilterValidationResult {
    if (!expression.trim()) {
      return {
        isValid: false,
        errors: [{
          code: 'EMPTY_EXPRESSION',
          message: 'Filter expression cannot be empty',
          position: 0,
          length: 0,
          severity: 'error'
        }],
        warnings: []
      };
    }

    return this.expressionValidator.validateExpression(expression);
  }

  /**
   * Apply advanced filter with pre and post processing
   */
  async applyAdvancedFilter(
    results: SearchResult[],
    filterExpression: string,
    query?: any,
    enableOptimization: boolean = true
  ): Promise<SearchResult[]> {
    if (!filterExpression.trim()) {
      return results;
    }

    try {
      // Validate the filter expression
      const validation = this.validateFilterExpression(filterExpression);
      if (!validation.isValid) {
        throw new Error(`Invalid filter expression: ${validation.error}`);
      }

      if (enableOptimization) {
        // Use optimized execution
        return this.applyAdvancedFilterOptimized(results, filterExpression, query);
      } else {
        // Use standard execution
        return this.applyAdvancedFilterStandard(results, filterExpression, query);
      }

    } catch (error) {
      logError('Advanced filter execution failed', {
        component: 'SearchFilterProcessor',
        operation: 'applyAdvancedFilter',
        error: error instanceof Error ? error.message : String(error),
        enableOptimization
      });
      throw new Error(`Filter execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Apply advanced filter with optimization
   */
  private async applyAdvancedFilterOptimized(
    results: SearchResult[],
    filterExpression: string,
    query?: any,
  ): Promise<SearchResult[]> {
    try {
      // Pre-filtering optimization
      const preFilterResult = await this.performPreFiltering(results, filterExpression, query);

      // Use optimized filter engine
      const filter = this.filterEngine.parseFilter(filterExpression);
      const result = await this.filterEngine.executeFilterOptimized(filter, preFilterResult.filteredResults);

      logInfo('Advanced filter with optimization completed', {
        component: 'SearchFilterProcessor',
        operation: 'applyAdvancedFilterOptimized',
        originalCount: results.length,
        filteredCount: result.filteredCount,
        executionTime: result.executionTime,
        optimizationUsed: true,
        earlyTermination: result.metadata.earlyTermination || false,
        optimizationsApplied: result.metadata.optimizationApplied || []
      });

      // Post-filtering refinement
      const postFilteredResults = await this.performPostFiltering(
        result.filteredItems as SearchResult[],
        filterExpression,
        query,
      );

      return postFilteredResults.refinedResults;

    } catch (error) {
      logWarn('Optimized filtering failed, falling back to standard execution', {
        component: 'SearchFilterProcessor',
        operation: 'applyAdvancedFilterOptimized',
        error: error instanceof Error ? error.message : String(error)
      });

      // Fallback to standard execution
      return this.applyAdvancedFilterStandard(results, filterExpression, query);
    }
  }

  /**
   * Standard filter execution (fallback)
   */
  private async applyAdvancedFilterStandard(
    results: SearchResult[],
    filterExpression: string,
    query?: any,
  ): Promise<SearchResult[]> {
    // Pre-filtering optimization
    const preFilterResult = await this.performPreFiltering(results, filterExpression, query);

    // Main filter execution (simplified for this example)
    const filteredResults = this.executeFilter(preFilterResult.filteredResults, filterExpression);

    // Post-filtering refinement
    const postFilteredResults = await this.performPostFiltering(
      filteredResults,
      filterExpression,
      query,
    );

    return postFilteredResults.refinedResults;
  }

  /**
   * Perform pre-filtering optimization
   */
  private async performPreFiltering(
    results: SearchResult[],
    filterExpression: string,
    query?: any,
  ): Promise<PreFilteringResult> {
    const optimizations: string[] = [];
    let filteredResults = [...results];
    let earlyTermination = false;

    try {
      // Apply simple field-based pre-filtering for common cases
      if (this.canApplyEarlyTermination(filterExpression)) {
        filteredResults = this.applyFieldBasedPreFiltering(filteredResults, filterExpression);
        optimizations.push('field_based_pre_filtering');

        if (filteredResults.length === 0) {
          earlyTermination = true;
          optimizations.push('early_termination_empty_results');
        } else if (this.shouldTerminateEarly(filteredResults, filterExpression)) {
          earlyTermination = true;
          optimizations.push('early_termination_selectivity');
        }
      }

      // Apply index-based filtering if available
      const indexFiltered = await this.applyIndexBasedPreFiltering(filteredResults, filterExpression);
      if (indexFiltered.length < filteredResults.length) {
        filteredResults = indexFiltered;
        optimizations.push('index_based_pre_filtering');
      }

    } catch (error) {
      logWarn('Pre-filtering optimization failed, continuing with full dataset', {
        component: 'SearchFilterProcessor',
        operation: 'performPreFiltering',
        error: error instanceof Error ? error.message : String(error)
      });
      optimizations.push('pre_filtering_failed');
    }

    return {
      filteredResults,
      earlyTermination,
      optimizationsApplied: optimizations,
    };
  }

  /**
   * Perform post-filtering refinement
   */
  private async performPostFiltering(
    results: SearchResult[],
    filterExpression: string,
    query?: any,
  ): Promise<PostFilteringResult> {
    let refinedResults = [...results];

    try {
      // Apply filter-specific post-processing
      refinedResults = this.applyFilterSpecificPostProcessing(refinedResults, filterExpression);

      // Apply filter-based ranking
      refinedResults = this.applyFilterBasedRanking(refinedResults, filterExpression, query);

    } catch (error) {
      logWarn('Post-filtering refinement failed, returning original results', {
        component: 'SearchFilterProcessor',
        operation: 'performPostFiltering',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return {
      refinedResults,
    };
  }

  /**
   * Enhanced executeFilter method with proper expression parsing
   */
  private executeFilter(results: SearchResult[], filterExpression: string): SearchResult[] {
    if (!filterExpression.trim()) {
      return results;
    }

    try {
      // Parse the filter expression into an AST (Abstract Syntax Tree)
      const expressionTree = this.parseFilterExpression(filterExpression);

      if (!expressionTree) {
        logWarn('Failed to parse filter expression, returning unfiltered results', {
          component: 'SearchFilterProcessor',
          operation: 'executeFilter',
          filterExpression
        });
        return results;
      }

      // Evaluate the expression tree against each result
      return results.filter(result => this.evaluateExpressionTree(expressionTree, result));
    } catch (error) {
      logError('Filter expression execution failed', {
        component: 'SearchFilterProcessor',
        operation: 'executeFilter',
        filterExpression,
        error: error instanceof Error ? error.message : String(error)
      });
      return results; // Return unfiltered results on error
    }
  }

  /**
   * Parse filter expression into an expression tree
   */
  private parseFilterExpression(expression: string): FilterExpressionNode | null {
    try {
      // Tokenize the expression
      const tokens = this.tokenizeExpression(expression);
      if (tokens.length === 0) return null;

      // Parse with proper precedence
      return this.parseWithPrecedence(tokens, 0);
    } catch (error) {
      logError('Expression parsing failed', {
        component: 'SearchFilterProcessor',
        operation: 'parseFilterExpression',
        expression,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Tokenize filter expression with proper handling of quoted strings and operators
   */
  private tokenizeExpression(expression: string): Token[] {
    const tokens: Token[] = [];
    let position = 0;

    while (position < expression.length) {
      const char = expression[position];

      // Skip whitespace
      if (/\s/.test(char)) {
        position++;
        continue;
      }

      // Handle quoted strings
      if (char === '"' || char === "'") {
        const quote = char;
        position++; // Skip opening quote
        let value = '';

        while (position < expression.length && expression[position] !== quote) {
          if (expression[position] === '\\') {
            position++;
            if (position < expression.length) {
              value += expression[position];
            }
          } else {
            value += expression[position];
          }
          position++;
        }

        position++; // Skip closing quote
        tokens.push({ type: TokenType.VALUE, value, position });
        continue;
      }

      // Handle parentheses
      if (char === '(') {
        tokens.push({ type: TokenType.LPAREN, value: '(', position });
        position++;
        continue;
      }

      if (char === ')') {
        tokens.push({ type: TokenType.RPAREN, value: ')', position });
        position++;
        continue;
      }

      // Handle operators
      if (this.isOperator(char)) {
        let operator = char;
        position++;

        // Handle multi-character operators
        if (position < expression.length) {
          const nextChar = expression[position];
          const twoCharOp = char + nextChar;

          if (this.isTwoCharOperator(twoCharOp)) {
            operator = twoCharOp;
            position++;
          }
        }

        tokens.push({ type: TokenType.OPERATOR, value: operator, position });
        continue;
      }

      // Handle logical operators (AND, OR, NOT)
      if (expression.substring(position, position + 3).toUpperCase() === 'AND') {
        tokens.push({ type: TokenType.LOGICAL_OP, value: 'AND', position });
        position += 3;
        continue;
      }

      if (expression.substring(position, position + 2).toUpperCase() === 'OR') {
        tokens.push({ type: TokenType.LOGICAL_OP, value: 'OR', position });
        position += 2;
        continue;
      }

      if (expression.substring(position, position + 3).toUpperCase() === 'NOT') {
        tokens.push({ type: TokenType.LOGICAL_OP, value: 'NOT', position });
        position += 3;

        // After NOT, the next significant token should be treated as a field
        // Skip whitespace
        while (position < expression.length && /\s/.test(expression[position])) {
          position++;
        }

        // If the next token exists, mark that it should be treated as a field
        if (position < expression.length) {
          const nextTokenStart = position;
          let nextValue = '';

          while (position < expression.length && !/\s/.test(expression[position]) &&
                 !this.isOperator(expression[position]) && expression[position] !== '(' && expression[position] !== ')') {
            nextValue += expression[position];
            position++;
          }

          if (nextValue) {
            tokens.push({ type: TokenType.FIELD, value: nextValue, position: nextTokenStart });
          }
        }

        continue;
      }

      // Handle field names and unquoted values
      let value = '';
      while (position < expression.length && !/\s/.test(expression[position]) &&
             !this.isOperator(expression[position]) && expression[position] !== '(' && expression[position] !== ')') {
        value += expression[position];
        position++;
      }

      if (value) {
        // More sophisticated field/value detection
        const prevToken = tokens.length > 0 ? tokens[tokens.length - 1] : null;

        // If previous token is an operator or logical operator, this must be a value
        if (prevToken && (prevToken.type === TokenType.OPERATOR || prevToken.type === TokenType.LOGICAL_OP)) {
          tokens.push({ type: TokenType.VALUE, value, position });
        }
        // If this looks like a number, treat as value
        else if (/^-?\d+\.?\d*$/.test(value)) {
          tokens.push({ type: TokenType.VALUE, value, position });
        }
        // If this contains dots and looks like a nested field, treat as field
        else if (value.includes('.') && !value.includes(' ')) {
          tokens.push({ type: TokenType.FIELD, value, position });
        }
        // If previous token was a logical operator, this should be a field
        else if (prevToken && prevToken.type === TokenType.LOGICAL_OP) {
          tokens.push({ type: TokenType.FIELD, value, position });
        }
        // If this token comes after NOT, it should be a field
        else if (prevToken && prevToken.value === 'NOT' && value && /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(value)) {
          tokens.push({ type: TokenType.FIELD, value, position });
        }
        // Default: treat as field (this is usually the first token)
        else {
          tokens.push({ type: TokenType.FIELD, value, position });
        }
      }
    }

    tokens.push({ type: TokenType.EOF, value: '', position });
    return tokens;
  }

  /**
   * Parse tokens with proper precedence handling
   */
  private parseWithPrecedence(tokens: Token[], precedence: number): FilterExpressionNode | null {
    // Check for NOT first (highest precedence unary operator)
    const firstToken = this.peekToken(tokens);
    if (firstToken && firstToken.type === TokenType.LOGICAL_OP && firstToken.value === 'NOT') {
      this.consumeToken(tokens); // consume NOT

      // Parse the expression that follows NOT
      const notExpression = this.parseWithPrecedence(tokens, 4); // NOT has precedence 4
      if (notExpression) {
        return {
          type: 'logical',
          operator: 'NOT',
          left: notExpression,
          right: undefined
        };
      }
      return null;
    }

    // Parse the left side expression
    let left = this.parsePrimary(tokens);
    if (!left) return null;

    while (true) {
      const token = this.peekToken(tokens);
      if (!token || token.type === TokenType.EOF || token.type === TokenType.RPAREN) {
        break;
      }

      const tokenPrecedence = this.getTokenPrecedence(token.value);
      if (tokenPrecedence < precedence) {
        break;
      }

      if (token.type === TokenType.LOGICAL_OP && token.value !== 'NOT') {
        const operator = this.consumeToken(tokens)?.value; // consume the logical operator
        if (!operator) break;

        // Handle AND/OR - binary operators
        const right = this.parseWithPrecedence(tokens, tokenPrecedence);
        if (right) {
          left = {
            type: 'logical',
            operator: operator,
            left: left,
            right: right
          };
        } else {
          // If we can't parse the right side, put the operator back and stop
          tokens.unshift({ type: TokenType.LOGICAL_OP, value: operator, position: token.position });
          break;
        }
      } else {
        break;
      }
    }

    return left;
  }

  /**
   * Parse primary expressions (field comparisons and parenthesized groups)
   */
  private parsePrimary(tokens: Token[]): FilterExpressionNode | null {
    const token = this.peekToken(tokens);
    if (!token) return null;

    if (token.type === TokenType.LPAREN) {
      this.consumeToken(tokens); // consume '('
      const expr = this.parseWithPrecedence(tokens, 0);

      if (this.peekToken(tokens)?.type === TokenType.RPAREN) {
        this.consumeToken(tokens); // consume ')'
      }

      // Wrap the expression in a group node if needed
      if (expr) {
        return {
          type: 'group',
          children: [expr]
        };
      }

      return expr;
    }

    if (token.type === TokenType.FIELD || token.type === TokenType.VALUE) {
      // Handle comparison expressions
      const firstToken = this.consumeToken(tokens);
      if (!firstToken) return null;

      const field = firstToken.type === TokenType.VALUE ? firstToken.value : firstToken.value;

      // Check if this might be a unary NOT operation
      const nextToken = this.peekToken(tokens);
      if (nextToken && nextToken.type === TokenType.LOGICAL_OP && nextToken.value === 'NOT') {
        // This is a NOT operation, put the field/value back and handle as NOT
        tokens.unshift(firstToken);
        return null; // Let the precedence parser handle NOT
      }

      const operatorToken = this.consumeToken(tokens);
      if (!operatorToken || operatorToken.type !== TokenType.OPERATOR) {
        // Not a valid comparison, put tokens back
        tokens.unshift(operatorToken || { type: TokenType.EOF, value: '', position: 0 });
        tokens.unshift(firstToken);
        return null;
      }

      const valueToken = this.consumeToken(tokens);
      if (!valueToken || valueToken.type !== TokenType.VALUE) {
        // Not a valid comparison, put tokens back
        tokens.unshift(valueToken || { type: TokenType.EOF, value: '', position: 0 });
        tokens.unshift(operatorToken);
        tokens.unshift(firstToken);
        return null;
      }

      return {
        type: 'comparison',
        field: firstToken.type === TokenType.VALUE ? firstToken.value : firstToken.value,
        operator: operatorToken.value,
        value: this.parseFilterValue(valueToken.value)
      };
    }

    return null;
  }

  /**
   * Evaluate expression tree against a search result
   */
  private evaluateExpressionTree(node: FilterExpressionNode, result: SearchResult): boolean {
    switch (node.type) {
      case 'comparison':
        return this.evaluateComparison(node, result);

      case 'logical':
        return this.evaluateLogical(node, result);

      case 'group':
        if (node.children && node.children.length > 0) {
          // A group should evaluate its child expression
          return this.evaluateExpressionTree(node.children[0], result);
        }
        return true;

      default:
        return true;
    }
  }

  /**
   * Evaluate comparison expressions
   */
  private evaluateComparison(node: FilterExpressionNode, result: SearchResult): boolean {
    if (!node.field || !node.operator) return true;

    const fieldValue = this.getFieldValue(result, node.field);
    const filterValue = node.value;

    if (fieldValue === undefined || fieldValue === null) {
      return node.operator === '!=';
    }

    switch (node.operator) {
      case '=':
      case '==':
        return fieldValue == filterValue;
      case '!=':
      case '<>':
        return fieldValue != filterValue;
      case '>':
        return Number(fieldValue) > Number(filterValue);
      case '<':
        return Number(fieldValue) < Number(filterValue);
      case '>=':
        return Number(fieldValue) >= Number(filterValue);
      case '<=':
        return Number(fieldValue) <= Number(filterValue);
      case '~':
      case 'LIKE':
        return String(fieldValue).toLowerCase().includes(String(filterValue).toLowerCase());
      case 'IN':
        return Array.isArray(filterValue) && filterValue.includes(fieldValue);
      case 'NOT IN':
        return Array.isArray(filterValue) && !filterValue.includes(fieldValue);
      default:
        return true;
    }
  }

  /**
   * Evaluate logical expressions (AND, OR, NOT)
   */
  private evaluateLogical(node: FilterExpressionNode, result: SearchResult): boolean {
    if (!node.left) return true;

    const leftResult = this.evaluateExpressionTree(node.left, result);

    switch (node.operator) {
      case 'NOT':
        return !leftResult;

      case 'AND':
        if (!node.right) return leftResult;
        const rightResult = this.evaluateExpressionTree(node.right, result);
        return leftResult && rightResult;

      case 'OR':
        if (!node.right) return leftResult;
        const orRightResult = this.evaluateExpressionTree(node.right, result);
        return leftResult || orRightResult;

      default:
        return leftResult;
    }
  }

  /**
   * Parse filter values with proper type conversion
   */
  private parseFilterValue(value: string): unknown {
    // Try to parse as number
    if (/^-?\d+\.?\d*$/.test(value)) {
      const num = Number(value);
      if (!isNaN(num)) return num;
    }

    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Try to parse as array (comma-separated)
    if (value.includes(',')) {
      return value.split(',').map(v => v.trim());
    }

    // Return as string (remove quotes if present)
    return value.replace(/^["']|["']$/g, '');
  }

  /**
   * Helper methods for token processing
   */
  private peekToken(tokens: Token[]): Token | null {
    return tokens.length > 0 ? tokens[0] : null;
  }

  private consumeToken(tokens: Token[]): Token | null {
    return tokens.shift() || null;
  }

  private isOperator(char: string): boolean {
    return ['=', '!', '>', '<', '~'].includes(char);
  }

  private isTwoCharOperator(op: string): boolean {
    return ['==', '!=', '>=', '<=', '<>', '~~'].includes(op);
  }

  private getTokenPrecedence(operator: string): number {
    switch (operator) {
      case 'NOT': return 4;
      case 'AND': return 3;
      case 'OR': return 2;
      default: return 1;
    }
  }

  /**
   * Apply field-based pre-filtering for simple filter expressions
   */
  private applyFieldBasedPreFiltering(results: SearchResult[], filterExpression: string): SearchResult[] {
    const simpleFilters = this.extractSimpleFilters(filterExpression);

    if (simpleFilters.length === 0) {
      return results;
    }

    return results.filter(result => {
      return simpleFilters.every(filter => this.evaluateSimpleFilter(result, filter));
    });
  }

  /**
   * Apply index-based pre-filtering (placeholder)
   */
  private async applyIndexBasedPreFiltering(results: SearchResult[], filterExpression: string): Promise<SearchResult[]> {
    // This would integrate with search indexes for pre-filtering
    return results;
  }

  /**
   * Apply filter-specific post-processing
   */
  private applyFilterSpecificPostProcessing(results: SearchResult[], filterExpression: string): SearchResult[] {
    let processedResults = [...results];

    // Boost scores for results that match multiple filter criteria
    if (this.isMultiCriteriaFilter(filterExpression)) {
      processedResults = this.boostMultiCriteriaResults(processedResults, filterExpression);
    }

    // Apply temporal relevance adjustments
    if (this.containsTemporalFilters(filterExpression)) {
      processedResults = this.adjustTemporalRelevance(processedResults, filterExpression);
    }

    return processedResults;
  }

  /**
   * Apply filter-based ranking
   */
  private applyFilterBasedRanking(results: SearchResult[], filterExpression: string, query?: any): SearchResult[] {
    const rankedResults = results.map(result => {
      const filterScore = this.calculateFilterScore(result, filterExpression, query);
      return {
        ...result,
        score: (result.score * 0.7) + (filterScore * 0.3),
      };
    });

    rankedResults.sort((a, b) => b.score - a.score);

    return rankedResults;
  }

  /**
   * Extract simple field-based filters
   */
  private extractSimpleFilters(filterExpression: string): Array<{ field: string; operator: string; value: any }> {
    const simpleFilters: Array<{ field: string; operator: string; value: any }> = [];

    const simplePattern = /(\w+)\s*([<>=!~]+)\s*['"]?([^'"&\s]+)['"]?/g;
    let match;

    while ((match = simplePattern.exec(filterExpression)) !== null) {
      const [, field, operator, value] = match;
      simpleFilters.push({
        field: field.trim(),
        operator: operator.trim(),
        value: value.trim().replace(/['"]/g, ''),
      });
    }

    return simpleFilters;
  }

  /**
   * Evaluate a simple filter against a search result
   */
  private evaluateSimpleFilter(result: SearchResult, filter: { field: string; operator: string; value: any }): boolean {
    const { field, operator, value } = filter;

    const fieldValue = this.getFieldValue(result, field);

    if (fieldValue === undefined || fieldValue === null) {
      return operator === '!=';
    }

    switch (operator) {
      case '=':
        return fieldValue == value;
      case '!=':
        return fieldValue != value;
      case '>':
        return Number(fieldValue) > Number(value);
      case '<':
        return Number(fieldValue) < Number(value);
      case '>=':
        return Number(fieldValue) >= Number(value);
      case '<=':
        return Number(fieldValue) <= Number(value);
      case '~':
        return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      default:
        return false;
    }
  }

  /**
   * Get field value from search result with nested field support
   */
  private getFieldValue(result: SearchResult, field: string): unknown {
    if (field.includes('.')) {
      const parts = field.split('.');
      let value: any = result;

      for (const part of parts) {
        value = value?.[part];
        if (value === undefined) break;
      }

      return value;
    }

    return result.metadata?.[field] || result[field as keyof SearchResult];
  }

  /**
   * Check if filter supports early termination
   */
  private canApplyEarlyTermination(filterExpression: string): boolean {
    const selectiveOperators = ['=', '>', '<', '>=', '<='];
    return selectiveOperators.some(op => filterExpression.includes(op));
  }

  /**
   * Determine if early termination should be applied
   */
  private shouldTerminateEarly(results: SearchResult[], filterExpression: string): boolean {
    const hasEqualityFilter = filterExpression.includes('=');
    const hasRangeFilter = /[<>=]/.test(filterExpression);

    if (results.length <= 10 && (hasEqualityFilter || hasRangeFilter)) {
      return true;
    }

    return false;
  }

  /**
   * Check if filter contains multiple criteria
   */
  private isMultiCriteriaFilter(filterExpression: string): boolean {
    const andCount = (filterExpression.match(/\bAND\b/gi) || []).length;
    const orCount = (filterExpression.match(/\bOR\b/gi) || []).length;
    return andCount > 0 || orCount > 1;
  }

  /**
   * Boost scores for results matching multiple filter criteria
   */
  private boostMultiCriteriaResults(results: SearchResult[], filterExpression: string): SearchResult[] {
    const criteriaCount = (filterExpression.match(/\b(AND|OR)\b/gi) || []).length + 1;

    return results.map(result => ({
      ...result,
      score: result.score * (1 + (criteriaCount * 0.1)),
    }));
  }

  /**
   * Check if filter contains temporal components
   */
  private containsTemporalFilters(filterExpression: string): boolean {
    const temporalKeywords = ['created_at', 'updated_at', 'timestamp', 'date', 'time'];
    return temporalKeywords.some(keyword => filterExpression.toLowerCase().includes(keyword));
  }

  /**
   * Adjust temporal relevance based on filter criteria
   */
  private adjustTemporalRelevance(results: SearchResult[], filterExpression: string): SearchResult[] {
    const hasRecentFilter = /\b(created_at|timestamp)\s*>\s*['"]?[^'"&\s]+['"]?/i.test(filterExpression);

    if (hasRecentFilter) {
      return results.map(result => ({
        ...result,
        score: result.score * 1.1,
      }));
    }

    return results;
  }

  /**
   * Calculate filter-specific score for ranking
   */
  private calculateFilterScore(result: SearchResult, filterExpression: string, query?: any): number {
    let score = 0;

    const simpleFilters = this.extractSimpleFilters(filterExpression);
    const matchingFilters = simpleFilters.filter(filter => this.evaluateSimpleFilter(result, filter));
    score += matchingFilters.length * 0.1;

    if (matchingFilters.some(f => f.field === 'category' && f.operator === '=')) {
      score += 0.2;
    }

    if (matchingFilters.some(f => f.field === 'importance_score' && f.operator === '>=')) {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Get available filter templates
   */
  getAvailableFilterTemplates(): Array<{ name: string; description: string; parameters: any[] }> {
    return Array.from(this.filterTemplates.entries()).map(([name, template]) => ({
      name,
      description: template.description,
      parameters: template.parameters,
    }));
  }

  /**
   * Validate filter template
   */
  validateFilterTemplate(templateName: string): { isValid: boolean; errors: string[]; warnings: string[] } {
    const template = this.filterTemplates.get(templateName);

    if (!template) {
      return {
        isValid: false,
        errors: [`Template '${templateName}' not found`],
        warnings: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate template structure
    if (!template.filterExpression) {
      errors.push('Template must have a filter expression');
    }

    if (!template.parameters || !Array.isArray(template.parameters)) {
      errors.push('Template must have a parameters array');
    }

    // Check for unmatched parameters in expression
    const paramMatches = template.filterExpression.match(/{(\w+)}/g) || [];
    const paramNames = paramMatches.map(match => match.replace(/[{}]/g, ''));

    for (const paramName of paramNames) {
      const parameter = template.parameters.find(p => p.name === paramName);
      if (!parameter) {
        errors.push(`Parameter '${paramName}' used in expression but not defined`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats() {
    return this.filterEngine.getOptimizationStats();
  }

  /**
   * Clear optimization caches
   */
  clearOptimizationCaches(): void {
    this.filterEngine.clearOptimizationCaches();
  }
}