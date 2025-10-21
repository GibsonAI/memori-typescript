// src/core/types/models.ts
import { MemoryClassification, MemoryImportanceLevel, ProcessedLongTermMemory, ConversationContext as ZodConversationContext } from './schemas';
import { BaseConfig, ProviderConfig, LoggerConfig as BaseLoggerConfig } from './base';
import { SearchStrategy } from '../domain/search/types';

// Re-export Zod types for convenience
export { MemoryClassification, MemoryImportanceLevel, ProcessedLongTermMemory };
export type ConversationContext = ZodConversationContext;

// Core API Interfaces
export interface MemorySearchResult {
  id: string;
  content: string;
  summary: string;
  classification: MemoryClassification;
  importance: MemoryImportanceLevel;
  topic?: string;
  entities: string[];
  keywords: string[];
  confidenceScore: number;
  classificationReason: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationMetadata {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tokensUsed?: number;
  modelType?: 'openai' | 'ollama';
  conversationIndex?: number;
  category?: string;
  [key: string]: unknown;
}

export interface RecordConversationOptions {
  model?: string;
  metadata?: ConversationMetadata;
}

// Database Operation Interfaces
export interface SearchOptions {
  // Basic options
  namespace?: string;
  limit?: number;
  includeMetadata?: boolean;

  // Filtering options
  minImportance?: MemoryImportanceLevel;
  categories?: MemoryClassification[];
  temporalFilters?: TemporalFilterOptions;
  metadataFilters?: MetadataFilterOptions;

  // Sorting and pagination
  sortBy?: SortOption;
  offset?: number;

  // Advanced options
  strategy?: SearchStrategy;
  timeout?: number;
  enableCache?: boolean;

  // Advanced Features
  filterExpression?: string;
  includeRelatedMemories?: boolean;
  maxRelationshipDepth?: number;
}

export interface DatabaseStats {
  totalConversations: number;
  totalMemories: number;
  shortTermMemories: number;
  longTermMemories: number;
  consciousMemories: number;
  lastActivity?: Date;
}

// Provider Interfaces
export interface LLMProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface EmbeddingResult {
  vector: number[];
  tokensUsed: number;
  model: string;
}

// Agent Interfaces
export interface ConsciousMemory extends MemorySearchResult {
  processedAt?: Date;
  isConsciousContext: boolean;
}

export interface MemoryProcessingParams {
  chatId: string;
  userInput: string;
  aiOutput: string;
  context: ConversationContext;
}

export interface MemoryProcessingResult {
  success: boolean;
  memory?: ProcessedLongTermMemory;
  error?: string;
  processingTime: number;
  fallbackUsed?: boolean;
}

// Temporal Filtering Interfaces
/**
 * Options for filtering memories by temporal criteria
 */
export interface TemporalFilterOptions {
  /** Array of time ranges to filter within */
  timeRanges?: TimeRange[];
  /** Relative time expressions (e.g., "last week", "yesterday") */
  relativeExpressions?: string[];
  /** Specific absolute dates to filter by */
  absoluteDates?: Date[];
  /** Temporal patterns to match (e.g., "daily standup", "weekly review") */
  patterns?: string[];
}

/**
 * Represents a time range with start and end dates
 */
export interface TimeRange {
  /** Start date of the time range */
  start: Date;
  /** End date of the time range */
  end: Date;
}

/**
 * Options for sorting search results
 */
export interface SortOption {
  /** Field to sort by */
  field: string;
  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Options for filtering memories by metadata
 */
export interface MetadataFilterOptions {
  /** Array of metadata field filters to apply */
  fields?: MetadataFilterField[];
}

/**
 * Represents a single metadata field filter
 */
export interface MetadataFilterField {
  /** Metadata field key to filter on */
  key: string;
  /** Value to filter for */
  value: unknown;
  /** Comparison operator to use */
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'like';
}

// Configuration Interfaces
export interface UserContext {
  userPreferences?: string[];
  currentProjects?: string[];
  relevantSkills?: string[];
}

export interface MemoriConfig extends BaseConfig, ProviderConfig {
  /** Database connection URL */
  databaseUrl: string;
  /** Default namespace for operations */
  namespace: string;
  /** Enable conscious memory ingestion mode */
  consciousIngest: boolean;
  /** Enable automatic memory ingestion mode */
  autoIngest: boolean;
  /** Enable relationship extraction during memory processing */
  enableRelationshipExtraction: boolean;
  /** User context information for enhanced processing */
  userContext?: UserContext;
  /** Background update interval for conscious mode (milliseconds) */
  backgroundUpdateInterval?: number;
}

// Logger Interfaces - Now extends BaseLoggerConfig for consistency
export interface LogContext {
  component?: string;
  userId?: string;
  sessionId?: string;
  chatId?: string;
  namespace?: string;
  [key: string]: any;
}

export interface LoggerConfig extends BaseLoggerConfig {
  /** Environment context for logging configuration */
  environment: 'development' | 'production' | 'test';
  /** Directory for log files (if file logging enabled) */
  logDir?: string;
}

// Utility Types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type MemoryWithMetadata = ProcessedLongTermMemory & {
  metadata: ConversationMetadata;
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};