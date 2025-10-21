// Search Strategy Enum
export enum SearchStrategy {
  FTS5 = 'fts5',
  LIKE = 'like',
  RECENT = 'recent',
  SEMANTIC = 'semantic',
  CATEGORY_FILTER = 'category_filter',
  TEMPORAL_FILTER = 'temporal_filter',
  METADATA_FILTER = 'metadata_filter',
  RELATIONSHIP = 'relationship'
}

// Import relationship types from schemas
import { MemoryRelationshipType } from '../../types/schemas';
import type { MemoryRelationship } from '../../types/schemas';
import { SearchStrategyConfig as BaseSearchStrategyConfig } from '../../types/base';

// Import and re-export essential interfaces from SearchStrategy
import type {
  SearchQuery,
  SearchResult,
  ISearchStrategy,
  SearchStrategyConfig,
} from './SearchStrategy';

export type {
  SearchQuery,
  SearchResult,
  ISearchStrategy,
  SearchStrategyConfig,
};

// Import types that are still needed from SearchStrategy
import type {
  SearchCapability,
  SearchStrategyMetadata,
  ValidationResult,
  SearchError,
  SearchStrategyError,
  SearchValidationError,
  SearchTimeoutError,
  SearchConfigurationError,
  SearchDatabaseError,
  SearchParseError,
  SearchErrorContext,
  SearchErrorCategory,
} from './SearchStrategy';

export type {
  SearchCapability,
  SearchStrategyMetadata,
  ValidationResult,
  SearchError,
  SearchStrategyError,
  SearchValidationError,
  SearchTimeoutError,
  SearchConfigurationError,
  SearchDatabaseError,
  SearchParseError,
  SearchErrorContext,
  SearchErrorCategory,
};

// Logger functionality is handled directly through Logger utility imports

// Backup metadata interface for tracking backup information
export interface BackupMetadata {
  id: string;
  strategyName: string;
  createdAt: Date;
  fileSize: number;
  strategyCount: number;
  checksum?: string;
}

// Database query result interface for type-safe database operations
export interface DatabaseQueryResult {
  memory_id: string;
  searchable_content: string;
  summary?: string;
  metadata: string;
  memory_type: string;
  category_primary: string;
  importance_score: number;
  created_at: string;
  search_score?: number;
  search_strategy?: string;
}

// Note: StrategyConfiguration removed - use SearchStrategyConfiguration instead


// Search metadata interface for structured metadata handling
export interface SearchMetadata {
  strategy: string;
  success: boolean;
  createdAt: Date;
  error?: boolean;
  summary?: string;
  category?: string;
  importanceScore?: number;
  memoryType?: string;
  rawBM25Score?: number;
  searchScore?: number;
  searchStrategy?: string;
  modelUsed?: string;
  originalChatId?: string;
  extractionTimestamp?: Date;
  isDuplicate?: boolean;
  duplicateOf?: string;
  consolidationReason?: string;
  cleanedUp?: boolean;
  cleanedUpAt?: Date;
  cleanupReason?: string;
}

// Filter Types - keeping these as they're specific to types.ts
export interface SearchFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'like';
  value: string | number | boolean | string[] | number[] | Date;
}

export interface SortCriteria {
  field: string;
  direction: 'asc' | 'desc';
}


export interface ConfigurationSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties?: boolean;
}

export interface ConfigurationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validatedConfig?: SearchStrategyConfig;
}

export interface ConfigurationManager {
  loadConfiguration(name: string): Promise<SearchStrategyConfig | null>;
  saveConfiguration(name: string, config: SearchStrategyConfig): Promise<void>;
  getConfigurationNames(): Promise<string[]>;
  deleteConfiguration(name: string): Promise<void>;
  validateConfiguration(config: SearchStrategyConfig): Promise<ConfigurationValidationResult>;
  getDefaultConfiguration(strategyName: string): SearchStrategyConfig;
  mergeConfigurations(base: SearchStrategyConfig, override: Partial<SearchStrategyConfig>): SearchStrategyConfig;
}

export interface ConfigurationPersistenceManager {
  save(config: SearchStrategyConfig): Promise<void>;
  load(strategyName: string): Promise<SearchStrategyConfig | null>;
  delete(strategyName: string): Promise<void>;
  list(): Promise<string[]>;
  backup(name: string): Promise<BackupMetadata>;
  restore(name: string, backupId: string): Promise<SearchStrategyConfig>;
  restoreWithValidation(name: string, backupId: string): Promise<SearchStrategyConfig>;
  listStrategyBackups(strategyName: string): Promise<BackupMetadata[]>;
  cleanupOldBackups(strategyName: string, maxBackups: number): Promise<void>;
  validateBackupIntegrity(backupId: string): Promise<boolean>;
  export(): Promise<Record<string, SearchStrategyConfig>>;
  import(configs: Record<string, SearchStrategyConfig>): Promise<void>;
}

export interface ConfigurationAuditEntry {
  timestamp: Date;
  action: 'create' | 'update' | 'delete' | 'load' | 'validate' | 'save' | 'import';
  strategyName: string;
  configurationName?: string;
  userId?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ConfigurationAuditManager {
  log(entry: ConfigurationAuditEntry): Promise<void>;
  getHistory(strategyName?: string, limit?: number): Promise<ConfigurationAuditEntry[]>;
  getChanges(strategyName: string, fromTimestamp: Date, toTimestamp: Date): Promise<ConfigurationAuditEntry[]>;
}

// Search Service Interface
export interface ISearchService {
  search(query: SearchQuery): Promise<SearchResult[]>;
  searchWithStrategy(query: SearchQuery, strategy: SearchStrategy): Promise<SearchResult[]>;
  getAvailableStrategies(): SearchStrategy[];
  getStrategy(name: string): ISearchStrategy | null;
}

// Relationship-based search interfaces
export interface RelationshipSearchQuery {
  startMemoryId?: string;
  maxDepth?: number;
  relationshipTypes?: MemoryRelationshipType[];
  minRelationshipStrength?: number;
  minRelationshipConfidence?: number;
  includeRelationshipPaths?: boolean;
  traversalStrategy?: 'breadth_first' | 'depth_first' | 'strength_weighted';
  targetMemoryId?: string;
  namespace?: string;
}

export interface RelationshipPath {
  memoryId: string;
  relationship: MemoryRelationship;
  path: string[];
  depth: number;
  cumulativeStrength: number;
  cumulativeConfidence: number;
}

export interface RelationshipSearchResult extends SearchResult {
  relationshipContext?: {
    paths: RelationshipPath[];
    distance: number;
    connectionStrength: number;
    relatedEntities: string[];
    relationshipTypes: MemoryRelationshipType[];
  };
}

// Custom error class that extends the imported SearchError
export class StrategyNotFoundError extends Error {
  constructor(strategy: SearchStrategy) {
    super(`Search strategy '${strategy}' not found`);
    this.name = 'StrategyNotFoundError';
  }
}