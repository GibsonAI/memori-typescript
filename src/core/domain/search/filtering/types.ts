/**
 * Core types and interfaces for the advanced filtering engine
 */

// Filter Type Enumeration
export enum FilterType {
  COMPARISON = 'comparison',
  LOGICAL = 'logical',
  TEMPORAL = 'temporal',
  SPATIAL = 'spatial',
  SEMANTIC = 'semantic'
}

// Filter Operator Enumeration
export enum FilterOperator {
  // Comparison operators
  EQUALS = 'eq',
  NOT_EQUALS = 'ne',
  GREATER_THAN = 'gt',
  LESS_THAN = 'lt',
  GREATER_EQUAL = 'ge',
  LESS_EQUAL = 'le',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  IN = 'in',
  NOT_IN = 'not_in',
  BETWEEN = 'between',
  LIKE = 'like',
  REGEX = 'regex',

  // Logical operators
  AND = 'and',
  OR = 'or',
  NOT = 'not',

  // Temporal operators
  BEFORE = 'before',
  AFTER = 'after',
  WITHIN = 'within',
  AGE_LESS_THAN = 'age_lt',
  AGE_GREATER_THAN = 'age_gt',

  // Spatial operators
  NEAR = 'near',
  WITHIN_RADIUS = 'within_radius',
  CONTAINS_POINT = 'contains_point',

  // Semantic operators
  SIMILAR_TO = 'similar_to',
  RELATED_TO = 'related_to'
}

// Filter Node Interface
export interface FilterNode {
  type: FilterType;
  field: string;
  operator: FilterOperator;
  value: unknown;
  children?: FilterNode[];
  metadata?: FilterMetadata;
}

// Filter Metadata
export interface FilterMetadata {
  caseSensitive?: boolean;
  negate?: boolean;
  weight?: number;
  description?: string;
  source?: string;
  combinationStrategy?: FilterCombinationStrategy;
  optimizationHints?: string[];
  logicalOperator?: string;
  field?: string;
  operator?: FilterOperator;
  valueType?: string;
}

// Filter Validation Result
export interface FilterValidationResult {
  isValid: boolean;
  errors: FilterValidationError[];
  warnings: FilterValidationWarning[];
}

// Filter Validation Error
export interface FilterValidationError {
  code: string;
  message: string;
  field?: string;
  operator?: FilterOperator;
  value?: unknown;
  path?: string;
}

// Filter Validation Warning
export interface FilterValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
}

// Filter Execution Context
export interface FilterExecutionContext {
  dataSource: 'memory' | 'search_results' | 'database';
  memoryType?: 'short_term' | 'long_term';
  namespace?: string;
  userId?: string;
  timestamp?: Date;
  performanceHints?: FilterPerformanceHints;
}

// Performance Optimization Hints
export interface FilterPerformanceHints {
  enableIndexing?: boolean;
  useCaching?: boolean;
  maxExecutionTime?: number;
  preferDatabaseFiltering?: boolean;
  batchSize?: number;
}

// Filter Execution Result
export interface FilterExecutionResult {
  filteredItems: unknown[];
  totalCount: number;
  filteredCount: number;
  executionTime: number;
  strategyUsed: string;
  metadata: Record<string, unknown>;
}

// Filter Expression String
export type FilterExpression = string;

// Parsed Filter Result
export interface ParsedFilterResult {
  filter: FilterNode;
  variables: Map<string, unknown>;
  metadata: FilterMetadata;
}

// Database Query Builder Result
export interface DatabaseQueryResult {
  sql: string;
  parameters: unknown[];
  estimatedCost: number;
  canUseIndex: boolean;
}

// Advanced Filter Combination Strategy
export enum FilterCombinationStrategy {
  INTERSECTION = 'intersection',  // AND logic with optimization
  UNION = 'union',               // OR logic with deduplication
  COMPLEMENT = 'complement',     // NOT logic with exclusion
  CASCADE = 'cascade',           // Sequential filtering with early termination
  PARALLEL = 'parallel',         // Parallel execution with result merging
  WEIGHTED = 'weighted'          // Weighted combination with scoring
}

// Optimized Filter Chain for Performance
export interface OptimizedFilterChain {
  executionOrder: FilterNode[]
  parallelGroups: FilterNode[][]
  estimatedCost: number
  optimizationHints: string[]
}

// Filter Template System
export interface FilterTemplate {
  name: string
  description: string
  parameters: FilterTemplateParameter[]
  filterExpression: string
  optimizationHints?: string[]
}

export interface FilterTemplateParameter {
  name: string
  type: FilterParameterType
  required: boolean
  defaultValue?: unknown
  validation?: FilterParameterValidation
}

export enum FilterParameterType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  ARRAY = 'array',
  OBJECT = 'object'
}

export interface FilterParameterValidation {
  minLength?: number
  maxLength?: number
  pattern?: string
  min?: number
  max?: number
  allowedValues?: unknown[]
}

// Advanced Validation Result
export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  suggestions?: string[]
}

export interface ValidationError {
  code: string
  message: string
  path?: string
  severity: 'error' | 'warning' | 'info'
}

export interface ValidationWarning {
  code: string
  message: string
  suggestion?: string
}

// Performance Monitoring
export interface FilterPerformanceMetrics {
  executionTime: number
  memoryUsage: number
  cpuUsage: number
  cacheHitRate: number
  optimizationApplied: string[]
}

// Filter Chain Context
export interface FilterChainContext {
  strategy: FilterCombinationStrategy
  maxConcurrency?: number
  timeout?: number
  enableEarlyTermination?: boolean
  performanceMetrics?: FilterPerformanceMetrics
}

// Filter Push-Down Optimization Types
export interface FilterSelectivityInfo {
  filterNode: FilterNode;
  estimatedSelectivity: number; // 0.0-1.0 (1.0 = very selective)
  estimatedCost: number; // Relative execution cost
  fieldType?: 'string' | 'number' | 'date' | 'boolean';
  operatorCategory: 'equality' | 'range' | 'pattern' | 'logical';
  actualSelectivity?: number; // Measured selectivity for learning
  executionHistory?: FilterExecutionHistory[];
}

export interface FilterExecutionHistory {
  executionTime: number;
  inputSize: number;
  outputSize: number;
  timestamp: Date;
  cacheHit: boolean;
}

export interface FilterOptimizationStats {
  cachedSelectivityCount: number;
  performanceHistorySize: number;
  averageOptimizationImprovement: number;
  totalOptimizationsApplied: number;
  earlyTerminations: number;
}

export interface OptimizedFilterResult {
  optimizedFilter: FilterNode;
  optimizationApplied: string[];
  estimatedImprovement: number;
  executionPlan: FilterExecutionPlan;
}

export interface FilterExecutionPlan {
  executionOrder: FilterNode[];
  parallelGroups: FilterNode[][];
  estimatedTotalCost: number;
  earlyTerminationPoints: number[];
  cacheOpportunities: string[];
}