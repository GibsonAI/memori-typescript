// Public types for ISSUE-10: memory updates, relationship mutations, and delta application

import { MemoryImportanceLevel, MemoryRelationshipType } from './schemas';

// Core memory update input (public, stable)
export interface UpdateMemoryInput {
  // Updatable core fields
  content?: string;
  title?: string;
  tags?: string[];

  /**
   * Importance value for the memory.
   * Consumers should align with existing semantics:
   * - Use MemoryImportanceLevel when possible
   * - Or provide a numeric importance score compatible with existing pipeline
   */
  importance?: MemoryImportanceLevel | number | string;

  /**
   * Arbitrary structured metadata.
   * Implementation may merge/replace metadata internally while preserving invariants.
   */
  metadata?: Record<string, unknown>;

  /**
   * Optional optimistic concurrency control:
   * - expectedVersion: compare against an internal version field
   * - ifUnmodifiedSince: compare against internal updatedAt/rowVersion timestamps
   *
   * Implementations are free to interpret these consistently; failures SHOULD
   * surface as a boolean false result or a typed error at higher layers.
   */
  expectedVersion?: string | number;
  ifUnmodifiedSince?: Date | string;
}

// Relationship mutation input (public, stable)
export interface UpdateMemoryRelationshipsInput {
  /**
   * The "source" memory whose relationships are being mutated.
   * This is the anchor for operations.
   */
  sourceId: string;

  /**
   * Relationship operations to apply.
   *
   * Each entry targets a specific memory and declares:
   * - type: relationship semantic (e.g. "references", "duplicates", "explains")
   * - strength: optional numeric weight (0-1 recommended)
   * - metadata: free-form annotations for downstream use
   *
   * Concrete semantics are implemented internally via RelationshipManager /
   * RelationshipService; this contract remains stable.
   */
  relations: Array<{
    targetId: string;
    type: string;
    strength?: number;
    metadata?: Record<string, unknown>;
    /**
     * Direction hint for future extensibility.
     * For now, treated as advisory; the primary direction is sourceId -> targetId.
     */
    direction?: 'outgoing' | 'incoming' | 'bidirectional';
  }>;

  /**
   * Logical namespace for isolation.
   * If omitted, implementations should fall back to Memori/MemoriAI defaults.
   */
  namespace?: string;
}

// Result object for relationship updates
export interface UpdateMemoryRelationshipsResult {
  /**
   * Number of relationship operations successfully applied.
   * Interpretation:
   * - Counts concrete relationship entries that were created/updated/removed.
   */
  updated: number;

  /**
   * Any non-fatal errors encountered while applying the batch.
   * Implementations should aggregate human-readable diagnostics here.
   */
  errors: string[];
}

/**
 * Public enum for stable relationship type usage in integrations.
 *
 * This intentionally mirrors MemoryRelationshipType while remaining a separate
 * export to avoid leaking internal schema evolution details.
 *
 * Consumers may:
 * - Use RelationshipType for stable, documented values, OR
 * - Provide custom strings in APIs that accept generic relationship types.
 */
export enum RelationshipType {
  CONTINUATION = 'continuation',
  REFERENCE = 'reference',
  RELATED = 'related',
  SUPERSEDES = 'supersedes',
  CONTRADICTION = 'contradiction',
}

/**
 * Generic delta describing a proposed change.
 *
 * This is intentionally minimal and integration-friendly. The concrete
 * execution behavior is defined by higher-level helpers that route into:
 * - recordConversation
 * - updateMemory
 * - updateMemoryRelationships
 */
export interface DeltaInput {
  /**
   * Type discriminator for routing:
   * - "correction" / "refinement" -> update existing memory
   * - "note" / "playbook_entry"   -> create new memory (via recordConversation or similar)
   * - "relationship"              -> relationship mutation
   * - arbitrary strings allowed for future extensions
   */
  type:
    | 'playbook_entry'
    | 'correction'
    | 'refinement'
    | 'note'
    | 'relationship'
    | string;

  /**
   * Human-readable or machine-generated content payload.
   * Semantics depend on type.
   */
  content?: string;

  /**
   * Target memory ID for correction/refinement/relationship operations.
   * When absent, helpers may treat the delta as "create new".
   */
  targetId?: string;

  /**
   * Namespace for scoping operations.
   * When omitted, default namespace resolution rules apply.
   */
  namespace?: string;

  /**
   * Optional tags for downstream filtering/analytics.
   */
  tags?: string[];

  /**
   * Arbitrary delta-scoped metadata; not interpreted by core types.
   */
  metadata?: Record<string, unknown>;

  /**
   * Optional relationship-specific payload, used when type === 'relationship'
   * or other relationship-like delta types.
   */
  relationship?: {
    sourceId?: string;
    targetId?: string;
    type?: string | RelationshipType | MemoryRelationshipType;
    strength?: number;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Result of applying a list of deltas.
 * Implementations MUST:
 * - Never throw for per-delta failures when continueOnError is true.
 * - Populate failed[] with diagnostic details.
 */
export interface ApplyDeltasResult {
  /**
   * IDs of successfully applied operations.
   * These can be:
   * - memory IDs (for created/updated memories)
   * - composite IDs or opaque tokens for relationship updates
   */
  applied: string[];

  /**
   * Detailed failures with original delta and error description.
   */
  failed: Array<{
    delta: DeltaInput;
    error: string;
  }>;

  /**
   * Optional structured summary for dashboards / observability.
   */
  summary?: {
    total: number;
    applied: number;
    failed: number;
    /**
     * Grouped error statistics (e.g. by code/substring) for quick inspection.
     */
    errorTypes?: Record<string, number>;
  };
}

/**
 * Options for delta application behavior.
 * These are public and stable; implementations can extend them internally.
 */
export interface ApplyDeltasOptions {
  /**
   * When true (default), processing continues after individual delta failures.
   * When false, the first failure SHOULD abort processing.
   */
  continueOnError?: boolean;

  /**
   * Optional namespace override applied when a delta has no namespace set.
   */
  defaultNamespace?: string;

  /**
   * Optional max batch size for internal processing.
   * Useful for enforcing limits in curator-style pipelines.
   */
  maxBatchSize?: number;
}