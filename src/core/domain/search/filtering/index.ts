// Main exports for the filtering engine
export { FilterEngine, FilterEngineError } from './FilterEngine';
export { FilterBuilder } from './FilterBuilder';
export { FilterParser, FilterParseError } from './FilterParser';
export { FilterExecutor } from './FilterExecutor';
export { FilterValidation } from './FilterValidation';
export { AdvancedFilterEngine, FilterTemplateManager } from './AdvancedFilterEngine';

// Types and interfaces
export type {
  FilterNode,
  FilterType,
  FilterOperator,
  FilterValidationResult,
  FilterExecutionContext,
  FilterExecutionResult,
  FilterExpression,
  ParsedFilterResult,
  DatabaseQueryResult,
  FilterMetadata,
  FilterValidationError,
  FilterValidationWarning,
  FilterPerformanceHints,
  FilterCombinationStrategy,
  OptimizedFilterChain,
  FilterTemplate,
  FilterTemplateParameter,
  ValidationResult,
  FilterPerformanceMetrics,
  FilterChainContext,
  FilterParameterType,
  FilterParameterValidation,
  ValidationError,
  ValidationWarning
} from './types';

// Strategy exports
export { MetadataFilterStrategy } from './MetadataFilterStrategy';
export { TemporalFilterStrategy } from './TemporalFilterStrategy';

// Temporal processing exports
export { DateTimeNormalizer } from './temporal/DateTimeNormalizer';
export { TemporalPatternMatcher } from './temporal/TemporalPatternMatcher';
export {
  TemporalService,
  TimeRange,
  TimeRangeQuery,
  ProcessedTimeRange,
  TimeBucket,
  TemporalAggregationPeriod,
  TemporalAggregationResult,
  AggregationBucket,
  TemporalGranularity,
} from '../temporal/TemporalService';

// Convenience re-exports for common use cases
export { FilterType as FilterNodeType } from './types';
export { FilterOperator as FilterOp } from './types';
