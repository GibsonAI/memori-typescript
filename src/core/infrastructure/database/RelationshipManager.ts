/**
 * RelationshipManager - Dedicated Memory Relationship Operations Manager
 *
 * This class handles all memory relationship operations extracted from DatabaseManager.
 * It provides comprehensive relationship management with proper validation, state tracking,
 * and namespace-based filtering following cognitive load optimization principles.
 */

import { MemoryRelationship, MemoryRelationshipType } from '../../types/schemas';
import { logInfo, logError } from '../config/Logger';
import {
  sanitizeString,
  sanitizeNamespace,
  SanitizationError,
  ValidationError,
  containsDangerousPatterns,
} from '../config/SanitizationUtils';
import { DatabaseContext } from './DatabaseContext';
import { StateManager } from './StateManager';
import { MemoryManager } from './MemoryManager';
import { TransactionCoordinator } from './TransactionCoordinator';
import { MemoryProcessingState } from '../../domain/memory/MemoryProcessingStateManager';
import { RelationshipQuery, RelationshipStatistics } from './types';

/**
 * Relationship manager configuration interface
 */
export interface RelationshipManagerConfig {
  enableStateTracking?: boolean;
  enableValidation?: boolean;
  maxRelationshipsPerMemory?: number;
  defaultNamespace?: string;
  enableConflictResolution?: boolean;
}

/**
 * Relationship update operation interface
 */
export interface RelationshipUpdate {
  relationship: MemoryRelationship;
  operation: 'add' | 'update' | 'remove';
}

/**
 * Relationship network interface for advanced relationship traversal
 */
export interface RelationshipNetwork {
  memoryId: string;
  relationships: Array<{
    relationship: MemoryRelationship;
    direction: 'incoming' | 'outgoing';
    depth: number;
  }>;
  networkStats: {
    totalRelationships: number;
    maxDepth: number;
    uniqueTypes: MemoryRelationshipType[];
  };
}

/**
 * Dedicated manager for memory relationship operations
 */
export class RelationshipManager {
  private databaseContext: DatabaseContext;
  private stateManager: StateManager;
  private memoryManager?: MemoryManager;
  private transactionCoordinator?: TransactionCoordinator;
  private config: Required<RelationshipManagerConfig>;

  constructor(
    databaseContext: DatabaseContext,
    config: RelationshipManagerConfig = {},
  ) {
    this.databaseContext = databaseContext;
    this.stateManager = new StateManager(databaseContext, {
      enableHistoryTracking: true,
      enableMetrics: true,
      maxHistoryEntries: 100,
    });

    this.config = {
      enableStateTracking: config.enableStateTracking ?? true,
      enableValidation: config.enableValidation ?? true,
      maxRelationshipsPerMemory: config.maxRelationshipsPerMemory ?? 100,
      defaultNamespace: config.defaultNamespace ?? 'default',
      enableConflictResolution: config.enableConflictResolution ?? true,
    };

    logInfo('RelationshipManager initialized', {
      component: 'RelationshipManager',
      enableStateTracking: this.config.enableStateTracking,
      enableValidation: this.config.enableValidation,
      maxRelationshipsPerMemory: this.config.maxRelationshipsPerMemory,
      defaultNamespace: this.config.defaultNamespace,
      enableConflictResolution: this.config.enableConflictResolution,
    });
  }

  /**
   * Set MemoryManager dependency for memory operations
   */
  setMemoryManager(memoryManager: MemoryManager): void {
    this.memoryManager = memoryManager;
  }

  /**
   * Set TransactionCoordinator dependency for complex operations
   */
  setTransactionCoordinator(transactionCoordinator: TransactionCoordinator): void {
    this.transactionCoordinator = transactionCoordinator;
  }

  /**
   * Store memory relationships for a given memory
   */
  async storeMemoryRelationships(
    memoryId: string,
    relationships: MemoryRelationship[],
    namespace: string = this.config.defaultNamespace,
  ): Promise<{ stored: number; errors: string[] }> {
    const startTime = Date.now();
    const errors: string[] = [];
    let stored = 0;

    try {
      logInfo(`Storing ${relationships.length} relationships for memory ${memoryId}`, {
        component: 'RelationshipManager',
        memoryId,
        relationshipCount: relationships.length,
        namespace,
      });

      // Validate and sanitize inputs
      const sanitizedMemoryId = sanitizeString(memoryId, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedNamespace = sanitizeNamespace(namespace, {
        fieldName: 'namespace',
      });

      // Validate relationships
      if (this.config.enableValidation) {
        const validation = this.validateRelationships(relationships);
        if (validation.invalid.length > 0) {
          errors.push(...validation.invalid.map(inv => inv.reason));
          logError('Relationship validation failed', {
            component: 'RelationshipManager',
            memoryId: sanitizedMemoryId,
            invalidCount: validation.invalid.length,
            errors: validation.invalid.map(inv => inv.reason),
          });
          return { stored: 0, errors };
        }
      }

      // Separate relationships by type for storage
      const generalRelationships = relationships.filter(r => r.type !== MemoryRelationshipType.SUPERSEDES);
      const supersedingRelationships = relationships.filter(r => r.type === MemoryRelationshipType.SUPERSEDES);

      // Check relationship count limits
      if (generalRelationships.length + supersedingRelationships.length > this.config.maxRelationshipsPerMemory) {
        errors.push(`Too many relationships (${generalRelationships.length + supersedingRelationships.length}) - maximum allowed: ${this.config.maxRelationshipsPerMemory}`);
        return { stored, errors };
      }

      // Store general relationships with merging
      if (generalRelationships.length > 0) {
        try {
          const existingMemory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
            where: { id: sanitizedMemoryId },
            select: { relatedMemoriesJson: true, processedData: true },
          });

          const existingRelationships = existingMemory?.relatedMemoriesJson ?
            (existingMemory.relatedMemoriesJson as MemoryRelationship[]) : [];

          const mergedRelationships = this.mergeRelationships(existingRelationships, generalRelationships);

          await this.databaseContext.getPrismaClient().longTermMemory.update({
            where: { id: sanitizedMemoryId },
            data: {
              relatedMemoriesJson: mergedRelationships as any,
              processedData: {
                ...(existingMemory?.processedData as any),
                relationshipCount: mergedRelationships.length,
                lastRelationshipUpdate: new Date(),
              } as any,
            },
          });

          stored += generalRelationships.length;
          logInfo(`Stored ${generalRelationships.length} general relationships for memory ${sanitizedMemoryId}`, {
            component: 'RelationshipManager',
            memoryId: sanitizedMemoryId,
            relationshipCount: generalRelationships.length,
          });
        } catch (error) {
          const errorMsg = `Failed to store general relationships: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logError(errorMsg, {
            component: 'RelationshipManager',
            memoryId: sanitizedMemoryId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Store superseding relationships separately
      if (supersedingRelationships.length > 0) {
        try {
          const existingMemory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
            where: { id: sanitizedMemoryId },
            select: { supersedesJson: true, processedData: true },
          });

          const existingSuperseding = existingMemory?.supersedesJson ?
            (existingMemory.supersedesJson as MemoryRelationship[]) : [];

          const mergedSuperseding = this.mergeRelationships(existingSuperseding, supersedingRelationships);

          await this.databaseContext.getPrismaClient().longTermMemory.update({
            where: { id: sanitizedMemoryId },
            data: {
              supersedesJson: mergedSuperseding as any,
              processedData: {
                ...(existingMemory?.processedData as any),
                supersedingCount: mergedSuperseding.length,
                lastSupersedingUpdate: new Date(),
              } as any,
            },
          });

          stored += supersedingRelationships.length;
          logInfo(`Stored ${supersedingRelationships.length} superseding relationships for memory ${sanitizedMemoryId}`, {
            component: 'RelationshipManager',
            memoryId: sanitizedMemoryId,
            supersedingCount: supersedingRelationships.length,
          });
        } catch (error) {
          const errorMsg = `Failed to store superseding relationships: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logError(errorMsg, {
            component: 'RelationshipManager',
            memoryId: sanitizedMemoryId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Update state tracking for relationship processing
      if (this.config.enableStateTracking) {
        try {
          await this.stateManager.transitionMemoryState(
            sanitizedMemoryId,
            MemoryProcessingState.PROCESSED,
            {
              reason: 'Memory relationships stored successfully',
              agentId: 'RelationshipManager',
              metadata: {
                relationshipsStored: stored,
                errors: errors.length,
              },
            },
          );
        } catch (stateError) {
          logError('Failed to update state tracking for relationship storage', {
            component: 'RelationshipManager',
            memoryId: sanitizedMemoryId,
            error: stateError instanceof Error ? stateError.message : String(stateError),
          });
        }
      }

      logInfo(`Successfully stored relationships for memory ${sanitizedMemoryId}`, {
        component: 'RelationshipManager',
        memoryId: sanitizedMemoryId,
        totalStored: stored,
        errors: errors.length,
        duration: Date.now() - startTime,
      });

      return { stored, errors };
    } catch (error) {
      const errorMsg = `Failed to store relationships for memory ${memoryId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logError(errorMsg, {
        component: 'RelationshipManager',
        memoryId,
        relationshipCount: relationships.length,
        namespace,
        error: error instanceof Error ? error.stack : String(error),
      });
      return { stored, errors };
    }
  }

  /**
   * Query memories by relationship criteria
   */
  async getMemoriesByRelationship(
    query: RelationshipQuery,
  ): Promise<Array<{
    memory: any;
    relationships: MemoryRelationship[];
    matchReason: string;
  }>> {
    const startTime = Date.now();

    try {
      const namespace = query.namespace || this.config.defaultNamespace;
      const limit = query.limit || 50;

      logInfo('Querying memories by relationship', {
        component: 'RelationshipManager',
        relationshipType: query.relationshipType,
        namespace,
        limit,
        filters: {
          sourceMemoryId: query.sourceMemoryId,
          targetMemoryId: query.targetMemoryId,
          minConfidence: query.minConfidence,
          minStrength: query.minStrength,
        },
      });

      // Sanitize inputs
      const sanitizedNamespace = sanitizeNamespace(namespace, { fieldName: 'namespace' });

      // Get memories that have relationships based on query criteria
      const whereClause: any = {};
      if (sanitizedNamespace !== 'default') {
        whereClause.namespace = sanitizedNamespace;
      }

      const memories = await this.databaseContext.getPrismaClient().longTermMemory.findMany({
        where: whereClause,
        take: limit * 2, // Get more to account for filtering
        orderBy: { createdAt: 'desc' },
      });

      const results: Array<{
        memory: any;
        relationships: MemoryRelationship[];
        matchReason: string;
      }> = [];

      for (const memory of memories) {
        const allRelationships: MemoryRelationship[] = [];

        // Get relationships from relatedMemoriesJson
        if (memory.relatedMemoriesJson) {
          const relatedMemories = memory.relatedMemoriesJson as MemoryRelationship[];
          allRelationships.push(...relatedMemories);
        }

        // Get relationships from supersedesJson
        if (memory.supersedesJson) {
          const supersedingMemories = memory.supersedesJson as MemoryRelationship[];
          allRelationships.push(...supersedingMemories);
        }

        // Filter relationships based on query criteria
        const filteredRelationships = allRelationships.filter(relationship => {
          // Filter by relationship type if specified
          if (query.relationshipType && relationship.type !== query.relationshipType) {
            return false;
          }

          // Filter by source memory ID if specified
          if (query.sourceMemoryId && relationship.targetMemoryId !== query.sourceMemoryId) {
            return false;
          }

          // Filter by target memory ID if specified
          if (query.targetMemoryId && relationship.targetMemoryId !== query.targetMemoryId) {
            return false;
          }

          // Filter by minimum confidence if specified
          if (query.minConfidence && relationship.confidence < query.minConfidence) {
            return false;
          }

          // Filter by minimum strength if specified
          if (query.minStrength && relationship.strength < query.minStrength) {
            return false;
          }

          return true;
        });

        if (filteredRelationships.length > 0) {
          results.push({
            memory,
            relationships: filteredRelationships,
            matchReason: `Found ${filteredRelationships.length} matching relationship(s)`,
          });

          // Limit results
          if (results.length >= limit) {
            break;
          }
        }
      }

      logInfo(`Retrieved ${results.length} memories with matching relationships`, {
        component: 'RelationshipManager',
        query: {
          relationshipType: query.relationshipType,
          namespace,
          minConfidence: query.minConfidence,
          minStrength: query.minStrength,
        },
        resultCount: results.length,
        duration: Date.now() - startTime,
      });

      return results;
    } catch (error) {
      const errorMsg = `Failed to query memories by relationship: ${error instanceof Error ? error.message : String(error)}`;
      logError(errorMsg, {
        component: 'RelationshipManager',
        query,
        error: error instanceof Error ? error.stack : String(error),
      });
      throw new Error(errorMsg);
    }
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
    memory: any;
    relationship: MemoryRelationship;
    direction: 'incoming' | 'outgoing';
  }>> {
    const startTime = Date.now();

    try {
      const namespace = options.namespace || this.config.defaultNamespace;
      const limit = options.limit || 20;

      logInfo(`Getting related memories for memory ${memoryId}`, {
        component: 'RelationshipManager',
        memoryId,
        namespace,
        relationshipType: options.relationshipType,
        minConfidence: options.minConfidence,
        minStrength: options.minStrength,
        limit,
      });

      // Sanitize inputs
      const sanitizedMemoryId = sanitizeString(memoryId, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedNamespace = sanitizeNamespace(namespace, { fieldName: 'namespace' });

      // First, get the source memory to understand its relationships
      const sourceMemory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
        where: { id: sanitizedMemoryId },
        select: {
          id: true,
          relatedMemoriesJson: true,
          supersedesJson: true,
          namespace: true,
        },
      });

      if (!sourceMemory) {
        throw new Error(`Memory ${sanitizedMemoryId} not found`);
      }

      if (sourceMemory.namespace !== sanitizedNamespace) {
        logInfo(`Memory ${sanitizedMemoryId} is not in namespace ${sanitizedNamespace}`, {
          component: 'RelationshipManager',
          memoryId: sanitizedMemoryId,
          memoryNamespace: sourceMemory.namespace,
          requestedNamespace: sanitizedNamespace,
        });
        return [];
      }

      const results: Array<{
        memory: any;
        relationship: MemoryRelationship;
        direction: 'incoming' | 'outgoing';
      }> = [];

      // Get outgoing relationships (memories this memory references)
      const outgoingRelationships: MemoryRelationship[] = [];

      if (sourceMemory.relatedMemoriesJson) {
        const related = sourceMemory.relatedMemoriesJson as MemoryRelationship[];
        outgoingRelationships.push(...related);
      }

      if (sourceMemory.supersedesJson) {
        const superseding = sourceMemory.supersedesJson as MemoryRelationship[];
        outgoingRelationships.push(...superseding);
      }

      // Filter outgoing relationships based on criteria
      const filteredOutgoing = outgoingRelationships.filter(rel => {
        if (options.relationshipType && rel.type !== options.relationshipType) return false;
        if (options.minConfidence && rel.confidence < options.minConfidence) return false;
        if (options.minStrength && rel.strength < options.minStrength) return false;
        return true;
      });

      // Get target memories for outgoing relationships
      for (const relationship of filteredOutgoing) {
        if (!relationship.targetMemoryId) continue;

        try {
          const targetMemory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
            where: { id: relationship.targetMemoryId },
          });

          if (targetMemory) {
            results.push({
              memory: targetMemory,
              relationship,
              direction: 'outgoing',
            });
          }
        } catch (error) {
          logError(`Failed to retrieve target memory ${relationship.targetMemoryId}`, {
            component: 'RelationshipManager',
            targetMemoryId: relationship.targetMemoryId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Get incoming relationships (memories that reference this memory)
      const incomingMemories = await this.databaseContext.getPrismaClient().longTermMemory.findMany({
        where: {
          namespace: sanitizedNamespace,
          OR: [
            {
              relatedMemoriesJson: {
                path: 'targetMemoryId',
                equals: sanitizedMemoryId,
              } as any,
            },
            {
              supersedesJson: {
                path: 'targetMemoryId',
                equals: sanitizedMemoryId,
              } as any,
            },
          ],
        },
        take: limit,
        select: {
          id: true,
          relatedMemoriesJson: true,
          supersedesJson: true,
        },
      });

      // Process incoming relationships
      for (const incomingMemory of incomingMemories) {
        const allRelationships: MemoryRelationship[] = [];

        if (incomingMemory.relatedMemoriesJson) {
          const related = incomingMemory.relatedMemoriesJson as MemoryRelationship[];
          allRelationships.push(...related);
        }

        if (incomingMemory.supersedesJson) {
          const superseding = incomingMemory.supersedesJson as MemoryRelationship[];
          allRelationships.push(...superseding);
        }

        // Find the specific relationship that targets our memory
        const targetRelationship = allRelationships.find(rel => rel.targetMemoryId === sanitizedMemoryId);

        if (targetRelationship) {
          // Filter by criteria
          if (options.relationshipType && targetRelationship.type !== options.relationshipType) continue;
          if (options.minConfidence && targetRelationship.confidence < options.minConfidence) continue;
          if (options.minStrength && targetRelationship.strength < options.minStrength) continue;

          try {
            const fullMemory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
              where: { id: incomingMemory.id },
            });

            if (fullMemory) {
              results.push({
                memory: fullMemory,
                relationship: targetRelationship,
                direction: 'incoming',
              });
            }
          } catch (error) {
            logError(`Failed to retrieve incoming memory ${incomingMemory.id}`, {
              component: 'RelationshipManager',
              incomingMemoryId: incomingMemory.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Sort by relationship strength and confidence
      results.sort((a, b) => {
        const scoreA = (a.relationship.strength + a.relationship.confidence) / 2;
        const scoreB = (b.relationship.strength + b.relationship.confidence) / 2;
        return scoreB - scoreA;
      });

      // Apply limit
      const limitedResults = results.slice(0, limit);

      logInfo(`Retrieved ${limitedResults.length} related memories for memory ${sanitizedMemoryId}`, {
        component: 'RelationshipManager',
        memoryId: sanitizedMemoryId,
        namespace,
        resultsCount: limitedResults.length,
        outgoingCount: limitedResults.filter(r => r.direction === 'outgoing').length,
        incomingCount: limitedResults.filter(r => r.direction === 'incoming').length,
        duration: Date.now() - startTime,
      });

      return limitedResults;
    } catch (error) {
      const errorMsg = `Failed to get related memories for ${memoryId}: ${error instanceof Error ? error.message : String(error)}`;
      logError(errorMsg, {
        component: 'RelationshipManager',
        memoryId,
        options,
        error: error instanceof Error ? error.stack : String(error),
      });
      throw new Error(errorMsg);
    }
  }

  /**
   * Update relationships for an existing memory
   */
  async updateMemoryRelationships(
    memoryId: string,
    updates: RelationshipUpdate[],
    namespace: string = this.config.defaultNamespace,
  ): Promise<{ updated: number; errors: string[] }> {
    const startTime = Date.now();
    const errors: string[] = [];
    let updated = 0;

    try {
      logInfo(`Updating ${updates.length} relationships for memory ${memoryId}`, {
        component: 'RelationshipManager',
        memoryId,
        updateCount: updates.length,
        namespace,
      });

      // Sanitize inputs
      const sanitizedMemoryId = sanitizeString(memoryId, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedNamespace = sanitizeNamespace(namespace, { fieldName: 'namespace' });

      // Validate updates
      for (const update of updates) {
        if (this.config.enableValidation) {
          const validation = this.validateSingleRelationship(update.relationship);
          if (!validation.isValid) {
            errors.push(`Invalid relationship: ${validation.reason}`);
          }
        }
      }

      if (errors.length > 0) {
        return { updated: 0, errors };
      }

      // Get the current memory with its relationships
      const existingMemory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
        where: { id: sanitizedMemoryId },
        select: {
          id: true,
          namespace: true,
          relatedMemoriesJson: true,
          supersedesJson: true,
          processedData: true,
        },
      });

      if (!existingMemory) {
        throw new Error(`Memory ${sanitizedMemoryId} not found`);
      }

      if (existingMemory.namespace !== sanitizedNamespace) {
        throw new Error(`Memory ${sanitizedMemoryId} is not in namespace ${sanitizedNamespace}`);
      }

      // Get existing relationships
      const existingGeneralRelationships = (existingMemory.relatedMemoriesJson as MemoryRelationship[]) || [];
      const existingSupersedingRelationships = (existingMemory.supersedesJson as MemoryRelationship[]) || [];

      // Process updates
      for (const update of updates) {
        try {
          const { relationship, operation } = update;
          const isSuperseding = relationship.type === MemoryRelationshipType.SUPERSEDES;

          let targetRelationships = isSuperseding ? existingSupersedingRelationships : existingGeneralRelationships;

          switch (operation) {
            case 'add': {
              // Check if relationship already exists
              const existingIndex = targetRelationships.findIndex(
                r => r.type === relationship.type &&
                  r.targetMemoryId === relationship.targetMemoryId,
              );

              if (existingIndex >= 0) {
                // Update existing relationship
                targetRelationships[existingIndex] = {
                  ...relationship,
                  // Preserve higher confidence/strength
                  confidence: Math.max(targetRelationships[existingIndex].confidence, relationship.confidence),
                  strength: Math.max(targetRelationships[existingIndex].strength, relationship.strength),
                };
              } else {
                // Add new relationship
                targetRelationships.push(relationship);
              }
              break;
            }

            case 'update': {
              // Find and update existing relationship
              const updateIndex = targetRelationships.findIndex(
                r => r.type === relationship.type &&
                  r.targetMemoryId === relationship.targetMemoryId,
              );

              if (updateIndex >= 0) {
                targetRelationships[updateIndex] = relationship;
              } else {
                errors.push(`Relationship not found for update: ${relationship.type} -> ${relationship.targetMemoryId}`);
                continue;
              }
              break;
            }

            case 'remove': {
              // Remove relationship if it exists
              const removeIndex = targetRelationships.findIndex(
                r => r.type === relationship.type &&
                  r.targetMemoryId === relationship.targetMemoryId,
              );

              if (removeIndex >= 0) {
                targetRelationships.splice(removeIndex, 1);
              } else {
                logInfo(`Relationship not found for removal: ${relationship.type} -> ${relationship.targetMemoryId}`, {
                  component: 'RelationshipManager',
                  memoryId: sanitizedMemoryId,
                  relationshipType: relationship.type,
                  targetMemoryId: relationship.targetMemoryId,
                });
              }
              break;
            }

            default:
              errors.push(`Unknown operation: ${operation}`);
              continue;
          }

          updated++;
        } catch (error) {
          const errorMsg = `Failed to ${update.operation} relationship ${update.relationship.type} -> ${update.relationship.targetMemoryId}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logError(errorMsg, {
            component: 'RelationshipManager',
            memoryId: sanitizedMemoryId,
            relationship: update.relationship,
            operation: update.operation,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Save updated relationships back to database
      await this.databaseContext.getPrismaClient().longTermMemory.update({
        where: { id: sanitizedMemoryId },
        data: {
          relatedMemoriesJson: existingGeneralRelationships as any,
          supersedesJson: existingSupersedingRelationships as any,
          processedData: {
            ...(existingMemory.processedData as any),
            relationshipUpdateCount: (existingMemory.processedData as any)?.relationshipUpdateCount || 0 + 1,
            lastRelationshipUpdate: new Date(),
          } as any,
        },
      });

      // Update state tracking
      if (this.config.enableStateTracking) {
        try {
          await this.stateManager.transitionMemoryState(
            sanitizedMemoryId,
            MemoryProcessingState.PROCESSED,
            {
              reason: 'Memory relationships updated',
              agentId: 'RelationshipManager',
              metadata: {
                relationshipsUpdated: updated,
                errors: errors.length,
              },
            },
          );
        } catch (stateError) {
          logError('Failed to update state tracking for relationship update', {
            component: 'RelationshipManager',
            memoryId: sanitizedMemoryId,
            error: stateError instanceof Error ? stateError.message : String(stateError),
          });
        }
      }

      logInfo(`Successfully updated relationships for memory ${sanitizedMemoryId}`, {
        component: 'RelationshipManager',
        memoryId: sanitizedMemoryId,
        totalUpdated: updated,
        errors: errors.length,
        duration: Date.now() - startTime,
      });

      return { updated, errors };
    } catch (error) {
      const errorMsg = `Failed to update relationships for memory ${memoryId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logError(errorMsg, {
        component: 'RelationshipManager',
        memoryId,
        updates: updates.length,
        namespace,
        error: error instanceof Error ? error.stack : String(error),
      });
      return { updated, errors };
    }
  }

  /**
   * Generate comprehensive relationship statistics and analytics
   */
  async getRelationshipStatistics(namespace: string = this.config.defaultNamespace): Promise<RelationshipStatistics> {
    const startTime = Date.now();

    try {
      logInfo(`Generating relationship statistics for namespace '${namespace}'`, {
        component: 'RelationshipManager',
        namespace,
      });

      // Sanitize inputs
      const sanitizedNamespace = sanitizeNamespace(namespace, { fieldName: 'namespace' });

      // Get all memories with relationships
      const memories = await this.databaseContext.getPrismaClient().longTermMemory.findMany({
        where: { namespace: sanitizedNamespace },
        select: {
          id: true,
          relatedMemoriesJson: true,
          supersedesJson: true,
          createdAt: true,
        },
      });

      let totalRelationships = 0;
      const relationshipsByType = {
        [MemoryRelationshipType.CONTINUATION]: 0,
        [MemoryRelationshipType.REFERENCE]: 0,
        [MemoryRelationshipType.RELATED]: 0,
        [MemoryRelationshipType.SUPERSEDES]: 0,
        [MemoryRelationshipType.CONTRADICTION]: 0,
      };

      let totalConfidence = 0;
      let totalStrength = 0;
      let relationshipCount = 0;
      const entityFrequency = new Map<string, number>();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let recentRelationships = 0;

      for (const memory of memories) {
        const allRelationships: MemoryRelationship[] = [];

        // Collect all relationships from this memory
        if (memory.relatedMemoriesJson) {
          const related = memory.relatedMemoriesJson as MemoryRelationship[];
          allRelationships.push(...related);
        }

        if (memory.supersedesJson) {
          const superseding = memory.supersedesJson as MemoryRelationship[];
          allRelationships.push(...superseding);
        }

        // Process each relationship
        for (const relationship of allRelationships) {
          totalRelationships++;
          relationshipsByType[relationship.type]++;
          totalConfidence += relationship.confidence;
          totalStrength += relationship.strength;
          relationshipCount++;

          // Track entity frequency
          for (const entity of relationship.entities || []) {
            entityFrequency.set(entity, (entityFrequency.get(entity) || 0) + 1);
          }

          // Count recent relationships
          if (memory.createdAt >= thirtyDaysAgo) {
            recentRelationships++;
          }
        }
      }

      // Calculate averages
      const averageConfidence = relationshipCount > 0 ? totalConfidence / relationshipCount : 0;
      const averageStrength = relationshipCount > 0 ? totalStrength / relationshipCount : 0;

      // Get top entities
      const topEntities = Array.from(entityFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([entity, count]) => ({ entity, count }));

      const statistics: RelationshipStatistics = {
        totalRelationships,
        relationshipsByType,
        averageConfidence: Math.round(averageConfidence * 100) / 100,
        averageStrength: Math.round(averageStrength * 100) / 100,
        topEntities,
        recentRelationships,
      };

      logInfo('Generated relationship statistics', {
        component: 'RelationshipManager',
        namespace,
        ...statistics,
        duration: Date.now() - startTime,
      });

      return statistics;
    } catch (error) {
      const errorMsg = `Failed to generate relationship statistics: ${error instanceof Error ? error.message : String(error)}`;
      logError(errorMsg, {
        component: 'RelationshipManager',
        namespace,
        error: error instanceof Error ? error.stack : String(error),
      });
      throw new Error(errorMsg);
    }
  }

  /**
   * Validate relationships for consistency and quality
   */
  validateRelationships(relationships: MemoryRelationship[]): {
    valid: MemoryRelationship[],
    invalid: Array<{ relationship: MemoryRelationship, reason: string }>
  } {
    const valid: MemoryRelationship[] = [];
    const invalid: Array<{ relationship: MemoryRelationship, reason: string }> = [];

    for (const relationship of relationships) {
      const validation = this.validateSingleRelationship(relationship);
      if (validation.isValid) {
        valid.push(relationship);
      } else {
        invalid.push({ relationship, reason: validation.reason || 'Unknown validation error' });
      }
    }

    return { valid, invalid };
  }

  /**
   * Validate a single relationship
   */
  private validateSingleRelationship(relationship: MemoryRelationship): { isValid: boolean, reason?: string } {
    // Check required fields
    if (!relationship.type) {
      return { isValid: false, reason: 'Missing relationship type' };
    }

    if (!relationship.reason || relationship.reason.trim().length < 10) {
      return { isValid: false, reason: 'Insufficient reasoning provided' };
    }

    if (!relationship.context || relationship.context.trim().length < 5) {
      return { isValid: false, reason: 'Insufficient context provided' };
    }

    // Validate confidence and strength scores
    if (relationship.confidence < 0 || relationship.confidence > 1) {
      return { isValid: false, reason: 'Confidence must be between 0 and 1' };
    }

    if (relationship.strength < 0 || relationship.strength > 1) {
      return { isValid: false, reason: 'Strength must be between 0 and 1' };
    }

    // Validate relationship type
    const validTypes = Object.values(MemoryRelationshipType);
    if (!validTypes.includes(relationship.type)) {
      return { isValid: false, reason: `Invalid relationship type: ${relationship.type}` };
    }

    // Validate entities if provided
    if (relationship.entities && relationship.entities.length > 0) {
      const validEntities = relationship.entities.filter(entity =>
        entity && typeof entity === 'string' && entity.trim().length > 0,
      );

      if (validEntities.length !== relationship.entities.length) {
        return { isValid: false, reason: 'Invalid entities in relationship' };
      }
    }

    // Check for reasonable confidence/strength ratio
    if (relationship.strength > relationship.confidence + 0.3) {
      return { isValid: false, reason: 'Strength cannot significantly exceed confidence' };
    }

    return { isValid: true };
  }

  /**
   * Detect and resolve relationship conflicts
   */
  async resolveRelationshipConflicts(
    memoryId: string,
    namespace: string = this.config.defaultNamespace,
  ): Promise<{ resolved: number, conflicts: Array<{ type: string, description: string }> }> {
    const startTime = Date.now();
    const conflicts: Array<{ type: string, description: string }> = [];
    let resolved = 0;

    try {
      logInfo(`Resolving relationship conflicts for memory ${memoryId}`, {
        component: 'RelationshipManager',
        memoryId,
        namespace,
      });

      // Sanitize inputs
      const sanitizedMemoryId = sanitizeString(memoryId, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedNamespace = sanitizeNamespace(namespace, { fieldName: 'namespace' });

      // Get the memory and its relationships
      const memory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
        where: { id: sanitizedMemoryId },
        select: {
          id: true,
          relatedMemoriesJson: true,
          supersedesJson: true,
          processedData: true,
        },
      });

      if (!memory) {
        throw new Error(`Memory ${sanitizedMemoryId} not found`);
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

        await this.databaseContext.getPrismaClient().longTermMemory.update({
          where: { id: sanitizedMemoryId },
          data: {
            relatedMemoriesJson: generalRelationships as any,
            supersedesJson: supersedingRelationships as any,
            processedData: {
              ...(memory.processedData as any),
              conflictResolutionCount: (memory.processedData as any)?.conflictResolutionCount || 0 + 1,
              lastConflictResolution: new Date(),
            } as any,
          },
        });

        resolved = conflictsDetected.length;
        conflicts.push(...conflictsDetected);
      }

      logInfo(`Resolved ${resolved} relationship conflicts for memory ${sanitizedMemoryId}`, {
        component: 'RelationshipManager',
        memoryId: sanitizedMemoryId,
        resolved,
        conflictCount: conflictsDetected.length,
        duration: Date.now() - startTime,
      });

      return { resolved, conflicts };
    } catch (error) {
      logError(`Failed to resolve relationship conflicts for memory ${memoryId}`, {
        component: 'RelationshipManager',
        memoryId,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to resolve relationship conflicts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get relationship network for advanced relationship traversal
   */
  async getRelationshipNetwork(
    memoryId: string,
    maxDepth: number = 3,
    namespace?: string,
  ): Promise<RelationshipNetwork> {
    const startTime = Date.now();

    try {
      logInfo(`Getting relationship network for memory ${memoryId}`, {
        component: 'RelationshipManager',
        memoryId,
        maxDepth,
        namespace,
      });

      // Sanitize inputs
      const sanitizedMemoryId = sanitizeString(memoryId, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedNamespace = namespace
        ? sanitizeNamespace(namespace, { fieldName: 'namespace' })
        : this.config.defaultNamespace;

      const network: RelationshipNetwork = {
        memoryId: sanitizedMemoryId,
        relationships: [],
        networkStats: {
          totalRelationships: 0,
          maxDepth: 0,
          uniqueTypes: [],
        },
      };

      // Track visited memories to avoid cycles
      const visited = new Set<string>();
      const relationshipTypes = new Set<MemoryRelationshipType>();

      // Recursive function to traverse relationships
      const traverseRelationships = async (
        currentMemoryId: string,
        depth: number,
        path: string[] = [],
      ): Promise<void> => {
        if (depth > maxDepth || visited.has(currentMemoryId) || path.includes(currentMemoryId)) {
          return;
        }

        visited.add(currentMemoryId);
        path.push(currentMemoryId);

        try {
          // Get related memories for current memory
          const relatedMemories = await this.getRelatedMemories(currentMemoryId, {
            namespace: sanitizedNamespace,
            limit: 10,
          });

          for (const related of relatedMemories) {
            const direction = related.direction;
            network.relationships.push({
              relationship: related.relationship,
              direction,
              depth,
            });

            relationshipTypes.add(related.relationship.type);
            network.networkStats.totalRelationships++;

            if (depth > network.networkStats.maxDepth) {
              network.networkStats.maxDepth = depth;
            }

            // Recurse to next level
            await traverseRelationships(related.memory.id, depth + 1, [...path]);
          }
        } catch (error) {
          logError(`Failed to traverse relationships for memory ${currentMemoryId}`, {
            component: 'RelationshipManager',
            currentMemoryId,
            depth,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      };

      // Start traversal from the root memory
      await traverseRelationships(sanitizedMemoryId, 0);

      network.networkStats.uniqueTypes = Array.from(relationshipTypes);

      logInfo(`Retrieved relationship network for memory ${sanitizedMemoryId}`, {
        component: 'RelationshipManager',
        memoryId: sanitizedMemoryId,
        totalRelationships: network.networkStats.totalRelationships,
        maxDepth: network.networkStats.maxDepth,
        uniqueTypes: network.networkStats.uniqueTypes.length,
        duration: Date.now() - startTime,
      });

      return network;
    } catch (error) {
      const errorMsg = `Failed to get relationship network for ${memoryId}: ${error instanceof Error ? error.message : String(error)}`;
      logError(errorMsg, {
        component: 'RelationshipManager',
        memoryId,
        maxDepth,
        error: error instanceof Error ? error.stack : String(error),
      });
      throw new Error(errorMsg);
    }
  }

  /**
   * Validate relationship consistency across the system
   */
  async validateRelationshipConsistency(
    memoryId: string,
    namespace?: string,
  ): Promise<{ isValid: boolean; issues: string[] }> {
    const startTime = Date.now();
    const issues: string[] = [];

    try {
      logInfo(`Validating relationship consistency for memory ${memoryId}`, {
        component: 'RelationshipManager',
        memoryId,
        namespace,
      });

      // Sanitize inputs
      const sanitizedMemoryId = sanitizeString(memoryId, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedNamespace = namespace
        ? sanitizeNamespace(namespace, { fieldName: 'namespace' })
        : this.config.defaultNamespace;

      // Get the memory
      const memory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
        where: { id: sanitizedMemoryId },
        select: {
          id: true,
          namespace: true,
          relatedMemoriesJson: true,
          supersedesJson: true,
        },
      });

      if (!memory) {
        issues.push(`Memory ${sanitizedMemoryId} not found`);
        return { isValid: false, issues };
      }

      if (memory.namespace !== sanitizedNamespace) {
        issues.push(`Memory ${sanitizedMemoryId} is not in namespace ${sanitizedNamespace}`);
      }

      // Validate all relationships
      const allRelationships: MemoryRelationship[] = [];

      if (memory.relatedMemoriesJson) {
        const related = memory.relatedMemoriesJson as MemoryRelationship[];
        allRelationships.push(...related);
      }

      if (memory.supersedesJson) {
        const superseding = memory.supersedesJson as MemoryRelationship[];
        allRelationships.push(...superseding);
      }

      // Validate each relationship
      for (const relationship of allRelationships) {
        const validation = this.validateSingleRelationship(relationship);
        if (!validation.isValid) {
          issues.push(`Invalid relationship ${relationship.type} -> ${relationship.targetMemoryId}: ${validation.reason}`);
        }

        // Check if target memory exists
        if (relationship.targetMemoryId) {
          const targetMemory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
            where: { id: relationship.targetMemoryId },
            select: { id: true, namespace: true },
          });

          if (!targetMemory) {
            issues.push(`Target memory ${relationship.targetMemoryId} not found for relationship ${relationship.type}`);
          } else if (targetMemory.namespace !== sanitizedNamespace) {
            issues.push(`Target memory ${relationship.targetMemoryId} is not in the same namespace`);
          }
        }
      }

      // Check for bidirectional consistency
      const consistencyIssues = await this.checkBidirectionalConsistency(sanitizedMemoryId, sanitizedNamespace);
      issues.push(...consistencyIssues);

      const isValid = issues.length === 0;

      logInfo(`Relationship consistency validation ${isValid ? 'passed' : 'failed'} for memory ${sanitizedMemoryId}`, {
        component: 'RelationshipManager',
        memoryId: sanitizedMemoryId,
        isValid,
        issuesCount: issues.length,
        duration: Date.now() - startTime,
      });

      return { isValid, issues };
    } catch (error) {
      const errorMsg = `Failed to validate relationship consistency: ${error instanceof Error ? error.message : String(error)}`;
      issues.push(errorMsg);
      logError(errorMsg, {
        component: 'RelationshipManager',
        memoryId,
        error: error instanceof Error ? error.stack : String(error),
      });
      return { isValid: false, issues };
    }
  }

  /**
   * Clean up invalid or outdated relationships
   */
  async cleanupInvalidRelationships(
    namespace: string = this.config.defaultNamespace,
    options: {
      minConfidence?: number;
      maxAgeDays?: number;
      dryRun?: boolean;
    } = {},
  ): Promise<{ cleaned: number, errors: string[], skipped: number }> {
    const startTime = Date.now();
    const errors: string[] = [];
    let cleaned = 0;
    let skipped = 0;

    try {
      const minConfidence = options.minConfidence || 0.2;
      const maxAgeDays = options.maxAgeDays || 90;
      const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

      logInfo(`Cleaning up invalid relationships in namespace '${namespace}'`, {
        component: 'RelationshipManager',
        namespace,
        minConfidence,
        maxAgeDays,
        dryRun: options.dryRun,
      });

      // Sanitize inputs
      const sanitizedNamespace = sanitizeNamespace(namespace, { fieldName: 'namespace' });

      // Get memories with potentially invalid relationships
      const memories = await this.databaseContext.getPrismaClient().longTermMemory.findMany({
        where: {
          namespace: sanitizedNamespace,
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
                component: 'RelationshipManager',
                memoryId: memory.id,
                invalidCount: invalid.length,
                lowConfidenceCount: valid.length - filteredValid.length,
              });
            } else {
              // Update memory with cleaned relationships
              const generalRelationships = filteredValid.filter(r => r.type !== MemoryRelationshipType.SUPERSEDES);
              const supersedingRelationships = filteredValid.filter(r => r.type === MemoryRelationshipType.SUPERSEDES);

              await this.databaseContext.getPrismaClient().longTermMemory.update({
                where: { id: memory.id },
                data: {
                  relatedMemoriesJson: generalRelationships as any,
                  supersedesJson: supersedingRelationships as any,
                  processedData: {
                    ...(memory.processedData as any),
                    relationshipCleanupCount: (memory.processedData as any)?.relationshipCleanupCount || 0 + 1,
                    lastRelationshipCleanup: new Date(),
                  } as any,
                },
              });

              cleaned += (allRelationships.length - filteredValid.length);
              logInfo(`Cleaned ${allRelationships.length - filteredValid.length} invalid relationships from memory ${memory.id}`, {
                component: 'RelationshipManager',
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
            component: 'RelationshipManager',
            memoryId: memory.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logInfo(`Relationship cleanup completed for namespace '${namespace}'`, {
        component: 'RelationshipManager',
        namespace,
        cleaned,
        skipped,
        errors: errors.length,
        duration: Date.now() - startTime,
      });

      return { cleaned, errors, skipped };
    } catch (error) {
      const errorMsg = `Failed to cleanup invalid relationships: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logError(errorMsg, {
        component: 'RelationshipManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      return { cleaned, errors, skipped };
    }
  }

  /**
   * Bulk update relationships for multiple memories
   */
  async bulkUpdateRelationships(
    updates: Array<{
      memoryId: string;
      relationships: RelationshipUpdate[];
    }>,
    namespace?: string,
  ): Promise<{ updated: number; errors: string[] }> {
    const startTime = Date.now();
    const errors: string[] = [];
    let updated = 0;

    try {
      const sanitizedNamespace = namespace
        ? sanitizeNamespace(namespace, { fieldName: 'namespace' })
        : this.config.defaultNamespace;

      logInfo(`Bulk updating relationships for ${updates.length} memories`, {
        component: 'RelationshipManager',
        updateCount: updates.length,
        namespace: sanitizedNamespace,
      });

      // Process each update
      for (const update of updates) {
        try {
          const result = await this.updateMemoryRelationships(
            update.memoryId,
            update.relationships,
            sanitizedNamespace,
          );

          updated += result.updated;
          errors.push(...result.errors);
        } catch (error) {
          const errorMsg = `Failed to update relationships for memory ${update.memoryId}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logError(errorMsg, {
            component: 'RelationshipManager',
            memoryId: update.memoryId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logInfo(`Bulk relationship update completed`, {
        component: 'RelationshipManager',
        totalMemories: updates.length,
        totalUpdated: updated,
        totalErrors: errors.length,
        duration: Date.now() - startTime,
      });

      return { updated, errors };
    } catch (error) {
      const errorMsg = `Bulk relationship update failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logError(errorMsg, {
        component: 'RelationshipManager',
        updates: updates.length,
        error: error instanceof Error ? error.stack : String(error),
      });
      return { updated, errors };
    }
  }

  /**
   * Merge relationships to avoid duplicates and combine metadata
   */
  private mergeRelationships(
    existingRelationships: MemoryRelationship[],
    newRelationships: MemoryRelationship[],
  ): MemoryRelationship[] {
    const merged = [...existingRelationships];

    for (const newRel of newRelationships) {
      // Check if relationship already exists (same type and target)
      const existingIndex = merged.findIndex(
        existing => existing.type === newRel.type &&
          existing.targetMemoryId === newRel.targetMemoryId,
      );

      if (existingIndex >= 0) {
        // Update existing relationship with higher confidence/strength
        const existing = merged[existingIndex];
        if (newRel.confidence > existing.confidence || newRel.strength > existing.strength) {
          merged[existingIndex] = {
            ...newRel,
            // Preserve the better metadata from both
            reason: newRel.confidence > existing.confidence ? newRel.reason : existing.reason,
            context: newRel.confidence > existing.confidence ? newRel.context : existing.context,
          };
        }
      } else {
        // Add new relationship
        merged.push(newRel);
      }
    }

    return merged;
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
   * Check bidirectional consistency for relationships
   */
  private async checkBidirectionalConsistency(
    memoryId: string,
    namespace: string,
  ): Promise<string[]> {
    const issues: string[] = [];

    try {
      // Get all relationships from this memory
      const memory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
        where: { id: memoryId },
        select: {
          relatedMemoriesJson: true,
          supersedesJson: true,
        },
      });

      if (!memory) return issues;

      const outgoingRelationships: MemoryRelationship[] = [];

      if (memory.relatedMemoriesJson) {
        const related = memory.relatedMemoriesJson as MemoryRelationship[];
        outgoingRelationships.push(...related);
      }

      if (memory.supersedesJson) {
        const superseding = memory.supersedesJson as MemoryRelationship[];
        outgoingRelationships.push(...superseding);
      }

      // Check each outgoing relationship for consistency
      for (const relationship of outgoingRelationships) {
        if (!relationship.targetMemoryId) continue;

        try {
          // Get the target memory's relationships
          const targetMemory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
            where: { id: relationship.targetMemoryId },
            select: {
              relatedMemoriesJson: true,
              supersedesJson: true,
            },
          });

          if (!targetMemory) {
            issues.push(`Target memory ${relationship.targetMemoryId} not found for relationship ${relationship.type}`);
            continue;
          }

          // Check if target has a corresponding relationship back to source
          const targetRelationships: MemoryRelationship[] = [];

          if (targetMemory.relatedMemoriesJson) {
            const related = targetMemory.relatedMemoriesJson as MemoryRelationship[];
            targetRelationships.push(...related);
          }

          if (targetMemory.supersedesJson) {
            const superseding = targetMemory.supersedesJson as MemoryRelationship[];
            targetRelationships.push(...superseding);
          }

          const hasReciprocalRelationship = targetRelationships.some(rel =>
            rel.targetMemoryId === memoryId,
          );

          if (!hasReciprocalRelationship && relationship.type === MemoryRelationshipType.RELATED) {
            issues.push(`Missing reciprocal relationship: ${relationship.targetMemoryId} should reference ${memoryId}`);
          }
        } catch (error) {
          logError(`Failed to check bidirectional consistency for target ${relationship.targetMemoryId}`, {
            component: 'RelationshipManager',
            targetMemoryId: relationship.targetMemoryId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return issues;
    } catch (error) {
      logError('Failed to check bidirectional consistency', {
        component: 'RelationshipManager',
        memoryId,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      return [`Consistency check failed: ${error instanceof Error ? error.message : String(error)}`];
    }
  }

  /**
   * Get database context for advanced operations
   */
  getDatabaseContext(): DatabaseContext {
    return this.databaseContext;
  }

  /**
   * Get state manager for direct access
   */
  getStateManager(): StateManager {
    return this.stateManager;
  }

  /**
   * Get relationship manager configuration
   */
  getConfig(): Required<RelationshipManagerConfig> {
    return { ...this.config };
  }
}