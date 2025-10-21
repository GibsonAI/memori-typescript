/**
 * Relationship Processing Types
 *
 * Type definitions for the relationship processing system including
 * graph structures, extraction results, and analysis contexts.
 */

import { MemoryRelationship, MemoryRelationshipType } from '../../../types/schemas';

/**
 * Relationship extraction result from LLM analysis
 */
export interface RelationshipExtractionResult {
  relationships: MemoryRelationship[];
  extractionMethod: string;
  confidence: number;
  extractedAt: Date;
  error?: string;
  processingMetadata?: {
    llmModel?: string;
    llmTokensUsed?: number;
    analysisDepth?: number;
    relatedMemoriesAnalyzed?: number;
    processingTime?: number;
  };
}

/**
 * Context information for relationship analysis
 */
export interface RelationshipAnalysisContext {
  sessionId?: string;
  userPreferences?: string[];
  currentProjects?: string[];
  analysisDepth?: number;
  includeTemporalAnalysis?: boolean;
  includeEntityMatching?: boolean;
  namespace?: string;
}

/**
 * Relationship graph structure for memory relationship mapping
 */
export interface RelationshipGraph {
  namespace: string;
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
  statistics: RelationshipGraphStatistics;
  builtAt: Date;
  metadata?: {
    nodeCount: number;
    edgeCount: number;
    averageDegree: number;
    density: number;
  };
}

/**
 * Node in the relationship graph representing a memory
 */
export interface RelationshipNode {
  id: string;
  content: string;
  summary: string;
  classification: string;
  importance: number;
  createdAt: Date;
  entities: string[];
  keywords: string[];
  degree?: number; // Number of connections
  centrality?: number; // Graph centrality measure
}

/**
 * Edge in the relationship graph representing a relationship between memories
 */
export interface RelationshipEdge {
  source: string;
  target: string;
  relationship: MemoryRelationship;
  weight: number;
  distance?: number; // Graph distance from source
}

/**
 * Statistics about the relationship graph
 */
export interface RelationshipGraphStatistics {
  nodeCount: number;
  edgeCount: number;
  averageDegree: number;
  relationshipTypeDistribution: Record<MemoryRelationshipType, number>;
  averageStrength: number;
  maxStrength: number;
  minStrength: number;
  density?: number;
  clusteringCoefficient?: number;
  averagePathLength?: number;
}

/**
 * Configuration for relationship processing
 */
export interface RelationshipProcessingConfig {
  defaultAnalysisDepth: number;
  maxAnalysisDepth: number;
  confidenceThreshold: number;
  strengthThreshold: number;
  maxRelatedMemories: number;
  enableRelationshipPropagation: boolean;
  enableGraphOptimization: boolean;
  llmAnalysisTimeout: number;
  maxRetries: number;
  retryDelay: number;
  cacheEnabled: boolean;
  cacheTimeout: number;
}

/**
 * Result of relationship-based memory retrieval
 */
export interface RelationshipRetrievalResult {
  memory: any;
  relationshipPath: RelationshipPath[];
  totalDistance: number;
  cumulativeStrength: number;
  retrievalStrategy: 'direct' | 'propagation' | 'graph_traversal';
  retrievedAt: Date;
}

/**
 * Path through the relationship graph
 */
export interface RelationshipPath {
  memoryId: string;
  relationship: MemoryRelationship;
  path: string[];
  depth: number;
  cumulativeStrength: number;
  cumulativeConfidence: number;
}

/**
 * Memory consolidation suggestion based on relationship analysis
 */
export interface ConsolidationSuggestion {
  primaryMemoryId: string;
  duplicateMemoryIds: string[];
  consolidationReason: string;
  confidence: number;
  estimatedBenefit: number;
  suggestedAt: Date;
  relationshipEvidence: {
    relationshipType: MemoryRelationshipType;
    strength: number;
    supportingMemories: string[];
  }[];
}

/**
 * Relationship conflict information
 */
export interface RelationshipConflict {
  memoryId: string;
  conflictingRelationships: MemoryRelationship[];
  conflictType: 'contradictory_types' | 'duplicate_targets' | 'strength_variance';
  severity: 'low' | 'medium' | 'high';
  resolution?: {
    resolved: boolean;
    chosenRelationships: MemoryRelationship[];
    discardedRelationships: MemoryRelationship[];
    resolutionStrategy: string;
  };
}

/**
 * Performance metrics for relationship processing
 */
export interface RelationshipProcessingMetrics {
  totalProcessingTime: number;
  llmAnalysisTime: number;
  graphBuildingTime: number;
  relationshipCount: number;
  averageConfidence: number;
  cacheHitRate: number;
  errorCount: number;
  retryCount: number;
}