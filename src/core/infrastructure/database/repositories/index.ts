// src/core/database/repositories/index.ts

export { PrismaConsolidationRepository } from './PrismaConsolidationRepository';

// Re-export interfaces for convenience
export type {
  IConsolidationRepository,
} from '../interfaces/IConsolidationRepository';

// Re-export types for convenience
export type {
  ConsolidationResult,
  ConsolidationStats,
  CleanupResult,
  DuplicateDetectionConfig,
  ConsolidationMemorySearchResult,
  ConsolidationTrend,
  DuplicateCandidate,
} from '../types/consolidation-models';