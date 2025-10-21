import { MemoryRelationship, MemoryRelationshipType } from '../../types/schemas';
import { RelationshipQuery } from './types';
import { logInfo, logError } from '../../infrastructure/config/Logger';
import { DatabaseContext } from './DatabaseContext';
import { RelationshipManager } from './RelationshipManager';
import { PrismaClient } from '@prisma/client';

// Type definitions for database records and operations
type LongTermMemoryRecord = {
  id: string;
  namespace: string;
  searchableContent: string;
  summary: string;
  classification: string;
  memoryImportance: string;
  topic?: string;
  entitiesJson?: unknown;
  keywordsJson?: unknown;
  confidenceScore: number;
  classificationReason?: string;
  extractionTimestamp: Date;
  createdAt: Date;
  updatedAt: Date;
  relatedMemoriesJson?: MemoryRelationship[];
  supersedesJson?: MemoryRelationship[];
  processedData?: unknown;
  consciousProcessed?: boolean;
  categoryPrimary: string;
  retentionType: string;
  importanceScore: number;
  isPermanentContext: boolean;
};

type ShortTermMemoryRecord = {
  id: string;
  namespace: string;
  searchableContent: string;
  summary: string;
  processedData: unknown;
  importanceScore: number;
  categoryPrimary: string;
  retentionType: string;
  createdAt: Date;
  updatedAt: Date;
  chatId: string;
  isPermanentContext: boolean;
};

type ChatHistoryRecord = {
  id: string;
  chatId: string;
  userInput: string;
  aiOutput: string;
  model: string;
  sessionId: string;
  namespace: string;
  createdAt: Date;
  metadata?: unknown;
};

type DatabaseRecord = LongTermMemoryRecord | ShortTermMemoryRecord | ChatHistoryRecord;

// Type for processedData field in database records
type ProcessedDataRecord = {
  conflictResolutionCount?: number;
  lastConflictResolution?: Date;
  relationshipCleanupCount?: number;
  lastRelationshipCleanup?: Date;
  cleanedUp?: boolean;
  cleanedUpAt?: Date;
  cleanupReason?: string;
  [key: string]: unknown;
};

/**
 * RelationshipService - Handles all memory relationship operations
 *
 * This service manages memory relationships including storage, retrieval,
 * conflict resolution, and cleanup operations.
 */
export class RelationshipService {
  private prisma: PrismaClient;

  constructor(
    private databaseContext: DatabaseContext,
    private relationshipManager: RelationshipManager
  ) {
    this.prisma = databaseContext.getPrismaClient();
  }

  /**
   * Store memory relationships for a given memory
   * Updates the relatedMemoriesJson and supersedesJson fields with extracted relationships
   */
  async storeMemoryRelationships(
    memoryId: string,
    relationships: MemoryRelationship[],
    namespace: string = 'default',
  ): Promise<{ stored: number; errors: string[] }> {
    return this.relationshipManager.storeMemoryRelationships(memoryId, relationships, namespace);
  }

  /**
   * Query memories by relationship type
   * Returns memories that have relationships of the specified type
   */
  async getMemoriesByRelationship(
    query: RelationshipQuery,
  ): Promise<Array<{
    memory: DatabaseRecord;
    relationships: MemoryRelationship[];
    matchReason: string;
  }>> {
    return this.relationshipManager.getMemoriesByRelationship(query);
  }

  /**
   * Get memories related to a specific memory through relationships
   */
  async getRelatedMemories(
    memoryId: string,
    options: {
      relationshipType?: MemoryRelationshipType;
      minConfidence?: number;
      minStrength?: number;
      namespace?: string;
      limit?: number;
    } = {},
  ): Promise<Array<{
    memory: DatabaseRecord;
    relationship: MemoryRelationship;
    direction: 'incoming' | 'outgoing';
  }>> {
    return this.relationshipManager.getRelatedMemories(memoryId, options);
  }

  /**
   * Detect and resolve relationship conflicts
   */
  async resolveRelationshipConflicts(
    memoryId: string,
    namespace: string = 'default',
  ): Promise<{ resolved: number, conflicts: Array<{ type: string, description: string }> }> {
    const conflicts: Array<{ type: string, description: string }> = [];
    let resolved = 0;

    try {
      logInfo(`Resolving relationship conflicts for memory ${memoryId}`, {
        component: 'RelationshipService',
        memoryId,
        namespace,
      });

      // Get the memory and its relationships
      const memory = await this.prisma.longTermMemory.findUnique({
        where: { id: memoryId },
        select: {
          id: true,
          relatedMemoriesJson: true,
          supersedesJson: true,
          processedData: true,
        },
      });

      if (!memory) {
        throw new Error(`Memory ${memoryId} not found`);
      }

      const allRelationships: MemoryRelationship[] = [];

      if (memory.relatedMemoriesJson) {
        const related = memory.relatedMemoriesJson as MemoryRelationship[];
        allRelationships.push(...related);
      }

      if (memory.supersedesJson) {
        const superseding = memory.supersedesJson as MemoryRelationship[];
        allRelationships.push(...superseding);
      }

      // Detect conflicts
      const conflictsDetected = this.detectRelationshipConflicts(allRelationships);

      if (conflictsDetected.length > 0) {
        // Resolve conflicts by keeping the highest quality relationships
        const resolvedRelationships = this.resolveConflictsByQuality(allRelationships);

        // Update the memory with resolved relationships
        const generalRelationships = resolvedRelationships.filter(r => r.type !== MemoryRelationshipType.SUPERSEDES);
        const supersedingRelationships = resolvedRelationships.filter(r => r.type === MemoryRelationshipType.SUPERSEDES);

        await this.prisma.longTermMemory.update({
          where: { id: memoryId },
          data: {
            relatedMemoriesJson: generalRelationships,
            supersedesJson: supersedingRelationships,
            processedData: {
              ...(memory.processedData as ProcessedDataRecord),
              conflictResolutionCount: (memory.processedData as ProcessedDataRecord)?.conflictResolutionCount || 0 + 1,
              lastConflictResolution: new Date(),
            },
          },
        });

        resolved = conflictsDetected.length;
        conflicts.push(...conflictsDetected);
      }

      logInfo(`Resolved ${resolved} relationship conflicts for memory ${memoryId}`, {
        component: 'RelationshipService',
        memoryId,
        resolved,
        conflictCount: conflictsDetected.length,
      });

      return { resolved, conflicts };
    } catch (error) {
      logError(`Failed to resolve relationship conflicts for memory ${memoryId}`, {
        component: 'RelationshipService',
        memoryId,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to resolve relationship conflicts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Detect conflicts in a set of relationships
   */
  private detectRelationshipConflicts(relationships: MemoryRelationship[]): Array<{ type: string, description: string }> {
    const conflicts: Array<{ type: string, description: string }> = [];

    // Group relationships by target memory
    const relationshipsByTarget = new Map<string, MemoryRelationship[]>();
    for (const relationship of relationships) {
      if (relationship.targetMemoryId) {
        const key = relationship.targetMemoryId;
        if (!relationshipsByTarget.has(key)) {
          relationshipsByTarget.set(key, []);
        }
        relationshipsByTarget.get(key)!.push(relationship);
      }
    }

    // Check for conflicts within each target group
    for (const [targetId, rels] of relationshipsByTarget.entries()) {
      if (rels.length > 1) {
        // Check for contradictory relationship types
        const types = rels.map(r => r.type);
        if (types.includes(MemoryRelationshipType.CONTRADICTION) && types.includes(MemoryRelationshipType.CONTINUATION)) {
          conflicts.push({
            type: 'contradictory_types',
            description: `Memory has both CONTRADICTION and CONTINUATION relationships with ${targetId}`,
          });
        }

        // Check for superseding conflicts
        const supersedingRels = rels.filter(r => r.type === MemoryRelationshipType.SUPERSEDES);
        if (supersedingRels.length > 1) {
          conflicts.push({
            type: 'multiple_superseding',
            description: `Memory has multiple SUPERSEDES relationships with ${targetId}`,
          });
        }

        // Check for significant confidence/strength variance
        const confidences = rels.map(r => r.confidence);
        const maxConfidence = Math.max(...confidences);
        const minConfidence = Math.min(...confidences);
        if (maxConfidence - minConfidence > 0.5) {
          conflicts.push({
            type: 'confidence_variance',
            description: `High confidence variance (${minConfidence.toFixed(2)}-${maxConfidence.toFixed(2)}) for relationships with ${targetId}`,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Resolve conflicts by selecting highest quality relationships
   */
  private resolveConflictsByQuality(relationships: MemoryRelationship[]): MemoryRelationship[] {
    // Group by target memory
    const relationshipsByTarget = new Map<string, MemoryRelationship[]>();
    for (const relationship of relationships) {
      if (relationship.targetMemoryId) {
        const key = relationship.targetMemoryId;
        if (!relationshipsByTarget.has(key)) {
          relationshipsByTarget.set(key, []);
        }
        relationshipsByTarget.get(key)!.push(relationship);
      }
    }

    const resolved: MemoryRelationship[] = [];

    // For each target, keep the highest quality relationship(s)
    for (const [, rels] of relationshipsByTarget.entries()) {
      if (rels.length === 1) {
        resolved.push(...rels);
      } else {
        // Sort by quality score (weighted combination of confidence and strength)
        rels.sort((a, b) => {
          const scoreA = (a.confidence * 0.6) + (a.strength * 0.4);
          const scoreB = (b.confidence * 0.6) + (b.strength * 0.4);
          return scoreB - scoreA;
        });

        // Keep top 2 relationships for each target to preserve multiple perspectives
        resolved.push(...rels.slice(0, 2));
      }
    }

    return resolved;
  }

  /**
   * Validate relationships
   */
  private validateRelationships(relationships: MemoryRelationship[]): { valid: MemoryRelationship[], invalid: Array<{ relationship: MemoryRelationship, reason: string }> } {
    const valid: MemoryRelationship[] = [];
    const invalid: Array<{ relationship: MemoryRelationship, reason: string }> = [];

    for (const relationship of relationships) {
      if (relationship.type && relationship.reason && relationship.context) {
        valid.push(relationship);
      } else {
        invalid.push({ relationship, reason: 'Missing required fields' });
      }
    }

    return { valid, invalid };
  }

  /**
   * Clean up invalid or outdated relationships
   */
  async cleanupInvalidRelationships(
    namespace: string = 'default',
    options: {
      minConfidence?: number;
      maxAgeDays?: number;
      dryRun?: boolean;
    } = {},
  ): Promise<{ cleaned: number, errors: string[], skipped: number }> {
    const errors: string[] = [];
    let cleaned = 0;
    let skipped = 0;

    try {
      const minConfidence = options.minConfidence || 0.2;
      const maxAgeDays = options.maxAgeDays || 90;
      const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

      logInfo(`Cleaning up invalid relationships in namespace '${namespace}'`, {
        component: 'RelationshipService',
        namespace,
        minConfidence,
        maxAgeDays,
        dryRun: options.dryRun,
      });

      // Get memories with potentially invalid relationships
      const memories = await this.prisma.longTermMemory.findMany({
        where: {
          namespace,
          createdAt: { lt: cutoffDate },
        },
        select: {
          id: true,
          relatedMemoriesJson: true,
          supersedesJson: true,
          processedData: true,
          createdAt: true,
        },
      });

      for (const memory of memories) {
        try {
          const allRelationships: MemoryRelationship[] = [];

          if (memory.relatedMemoriesJson) {
            const related = memory.relatedMemoriesJson as MemoryRelationship[];
            allRelationships.push(...related);
          }

          if (memory.supersedesJson) {
            const superseding = memory.supersedesJson as MemoryRelationship[];
            allRelationships.push(...superseding);
          }

          // Filter out invalid relationships
          const { valid, invalid } = this.validateRelationships(allRelationships);

          // Also filter by age and confidence
          const filteredValid = valid.filter(r =>
            r.confidence >= minConfidence &&
            (!options.maxAgeDays || memory.createdAt >= cutoffDate),
          );

          if (filteredValid.length !== allRelationships.length) {
            if (options.dryRun) {
              cleaned += (allRelationships.length - filteredValid.length);
              logInfo(`DRY RUN: Would clean ${allRelationships.length - filteredValid.length} invalid relationships from memory ${memory.id}`, {
                component: 'RelationshipService',
                memoryId: memory.id,
                invalidCount: invalid.length,
                lowConfidenceCount: valid.length - filteredValid.length,
              });
            } else {
              // Update memory with cleaned relationships
              const generalRelationships = filteredValid.filter(r => r.type !== MemoryRelationshipType.SUPERSEDES);
              const supersedingRelationships = filteredValid.filter(r => r.type === MemoryRelationshipType.SUPERSEDES);

              await this.prisma.longTermMemory.update({
                where: { id: memory.id },
                data: {
                  relatedMemoriesJson: generalRelationships,
                  supersedesJson: supersedingRelationships,
                  processedData: {
                    ...(memory.processedData as ProcessedDataRecord),
                    relationshipCleanupCount: (memory.processedData as ProcessedDataRecord)?.relationshipCleanupCount || 0 + 1,
                    lastRelationshipCleanup: new Date(),
                  },
                },
              });

              cleaned += (allRelationships.length - filteredValid.length);
              logInfo(`Cleaned ${allRelationships.length - filteredValid.length} invalid relationships from memory ${memory.id}`, {
                component: 'RelationshipService',
                memoryId: memory.id,
                invalidCount: invalid.length,
                lowConfidenceCount: valid.length - filteredValid.length,
              });
            }
          } else {
            skipped++;
          }
        } catch (error) {
          const errorMsg = `Failed to cleanup relationships for memory ${memory.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logError(errorMsg, {
            component: 'RelationshipService',
            memoryId: memory.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logInfo(`Relationship cleanup completed for namespace '${namespace}'`, {
        component: 'RelationshipService',
        namespace,
        cleaned,
        skipped,
        errors: errors.length,
      });

      return { cleaned, errors, skipped };
    } catch (error) {
      const errorMsg = `Failed to cleanup invalid relationships: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logError(errorMsg, {
        component: 'RelationshipService',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      return { cleaned, errors, skipped };
    }
  }
}