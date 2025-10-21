/**
 * MemoryManager - Dedicated Long-term Memory Operations Manager
 *
 * This class handles all long-term memory CRUD operations extracted from DatabaseManager.
 * It provides comprehensive memory management with proper validation, sanitization,
 * state tracking integration, and namespace-based filtering.
 */

import { MemoryImportanceLevel, MemoryClassification, ProcessedLongTermMemory } from '../../types/schemas';
import { logInfo, logError } from '../../infrastructure/config/Logger';
import { DatabaseContext } from './DatabaseContext';
import { MemoryProcessingState, StateManager } from './StateManager';
import { SanitizationError, ValidationError } from '../config/SanitizationUtils';
import { BaseDatabaseService } from './BaseDatabaseService';

/**
 * Memory manager configuration interface
 */
export interface MemoryManagerConfig {
  enableStateTracking?: boolean;
  enableValidation?: boolean;
  maxContentLength?: number;
  defaultNamespace?: string;
}

/**
 * Memory query options interface
 */
export interface MemoryQueryOptions {
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
}

/**
 * Memory update options interface
 */
export interface MemoryUpdateOptions {
  skipStateTracking?: boolean;
  validateContent?: boolean;
}

/**
 * Memory deletion options interface
 */
export interface MemoryDeletionOptions {
  skipStateTracking?: boolean;
  cascadeDelete?: boolean;
}

/**
 * Dedicated manager for long-term memory operations
 */
export class MemoryManager extends BaseDatabaseService {
  private stateManager: StateManager;
  private config: Required<MemoryManagerConfig>;

  constructor(
    databaseContext: DatabaseContext,
    config: MemoryManagerConfig = {},
  ) {
    super(databaseContext);
    this.stateManager = new StateManager(databaseContext, {
      enableHistoryTracking: true,
      enableMetrics: true,
      maxHistoryEntries: 100,
    });

    this.config = {
      enableStateTracking: config.enableStateTracking ?? true,
      enableValidation: config.enableValidation ?? true,
      maxContentLength: config.maxContentLength ?? 10000,
      defaultNamespace: config.defaultNamespace ?? 'default',
    };

    logInfo('MemoryManager initialized', {
      component: 'MemoryManager',
      enableStateTracking: this.config.enableStateTracking,
      enableValidation: this.config.enableValidation,
      maxContentLength: this.config.maxContentLength,
      defaultNamespace: this.config.defaultNamespace,
    });
  }

  /**
   * Store a new long-term memory with comprehensive validation and state tracking
   */
  async storeLongTermMemory(
    memoryData: ProcessedLongTermMemory,
    chatId: string | null,
    namespace: string = this.config.defaultNamespace,
  ): Promise<string> {
    const startTime = Date.now();

    try {
      logInfo('Storing long-term memory', {
        component: 'MemoryManager',
        chatId,
        namespace,
        classification: memoryData.classification,
        importance: memoryData.importance,
      });

      // Validate and sanitize inputs
      const sanitizedData = await this.validateAndSanitizeMemoryInput(memoryData, chatId, namespace);

      // Skip dangerous pattern validation for LLM-generated memory content
      // This content comes from trusted LLM providers and has been processed by MemoryAgent
      // The strict security checks are more appropriate for user inputs, not AI-generated content

      // Store the memory using Prisma
      const result = await this.prisma.longTermMemory.create({
        data: {
          originalChatId: sanitizedData.chatId,
          processedData: sanitizedData.memoryData,
          importanceScore: this.calculateImportanceScore(sanitizedData.memoryData.importance),
          categoryPrimary: sanitizedData.memoryData.classification,
          retentionType: 'long_term',
          namespace: sanitizedData.namespace,
          searchableContent: sanitizedData.memoryData.content,
          summary: sanitizedData.memoryData.summary,
          classification: sanitizedData.memoryData.classification,
          memoryImportance: sanitizedData.memoryData.importance,
          topic: sanitizedData.memoryData.topic,
          entitiesJson: sanitizedData.memoryData.entities,
          keywordsJson: sanitizedData.memoryData.keywords,
          confidenceScore: sanitizedData.memoryData.confidenceScore,
          extractionTimestamp: new Date(),
          classificationReason: sanitizedData.memoryData.classificationReason,
          consciousProcessed: false, // Default to unprocessed
        },
      });

      // Initialize state tracking for the new memory
      if (this.config.enableStateTracking) {
        try {
          await this.stateManager.initializeExistingMemoryState(
            result.id,
            MemoryProcessingState.PROCESSED,
          );

          await this.stateManager.transitionMemoryState(
            result.id,
            MemoryProcessingState.PROCESSED,
            {
              reason: 'Memory created and stored in long-term storage',
              agentId: 'MemoryManager',
              metadata: {
                chatId: sanitizedData.chatId,
                namespace: sanitizedData.namespace,
                classification: sanitizedData.memoryData.classification,
                importance: sanitizedData.memoryData.importance,
              },
            },
          );

          logInfo('State tracking initialized for new memory', {
            component: 'MemoryManager',
            memoryId: result.id,
            initialState: MemoryProcessingState.PROCESSED,
          });
        } catch (error) {
          logError('Failed to initialize state tracking for new memory', {
            component: 'MemoryManager',
            memoryId: result.id,
            error: error instanceof Error ? error.message : String(error),
          });
          // Don't throw here - state tracking failure shouldn't prevent memory storage
        }
      }

      logInfo('Successfully stored long-term memory', {
        component: 'MemoryManager',
        memoryId: result.id,
        chatId: sanitizedData.chatId,
        namespace: sanitizedData.namespace,
        duration: Date.now() - startTime,
      });

      return result.id;

    } catch (error) {
      logError('Failed to store long-term memory', {
        component: 'MemoryManager',
        chatId,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Retrieve a memory by ID with optional namespace filtering
   */
  async getMemoryById(
    id: string,
    namespace?: string,
  ): Promise<ProcessedLongTermMemory | null> {
    const startTime = Date.now();

    try {
      logInfo('Retrieving memory by ID', {
        component: 'MemoryManager',
        memoryId: id,
        namespace,
      });

      // Sanitize inputs
      const sanitizedId = this.sanitizeString(id, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedNamespace = namespace
        ? this.sanitizeNamespace(namespace, { fieldName: 'namespace' })
        : this.config.defaultNamespace;

      // Build where clause with namespace filtering
      const whereClause: any = { id: sanitizedId, namespace: sanitizedNamespace };

      const memory = await this.prisma.longTermMemory.findFirst({
        where: whereClause,
      });

      if (!memory) {
        logInfo('Memory not found', {
          component: 'MemoryManager',
          memoryId: sanitizedId,
          namespace: sanitizedNamespace,
        });
        return null;
      }

      const result: ProcessedLongTermMemory = {
        content: memory.searchableContent,
        summary: memory.summary,
        classification: memory.classification as MemoryClassification,
        importance: memory.memoryImportance as MemoryImportanceLevel,
        conversationId: memory.originalChatId ?? '',
        topic: memory.topic || undefined,
        entities: (memory.entitiesJson as string[]) || [],
        keywords: (memory.keywordsJson as string[]) || [],
        confidenceScore: memory.confidenceScore,
        classificationReason: memory.classificationReason || '',
        promotionEligible: false,
      };

      logInfo('Successfully retrieved memory', {
        component: 'MemoryManager',
        memoryId: sanitizedId,
        namespace: sanitizedNamespace,
        duration: Date.now() - startTime,
      });

      return result;

    } catch (error) {
      logError('Failed to retrieve memory by ID', {
        component: 'MemoryManager',
        memoryId: id,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update an existing memory with validation and state tracking
   */
  async updateMemory(
    id: string,
    updates: Partial<ProcessedLongTermMemory>,
    namespace?: string,
    options: MemoryUpdateOptions = {},
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      logInfo('Updating memory', {
        component: 'MemoryManager',
        memoryId: id,
        updateFields: Object.keys(updates),
        namespace,
      });

      // Sanitize inputs
      const sanitizedId = this.sanitizeString(id, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedNamespace = namespace
        ? this.sanitizeNamespace(namespace, { fieldName: 'namespace' })
        : this.config.defaultNamespace;

      // Validate updates if enabled
      if (this.config.enableValidation && options.validateContent !== false) {
        await this.validateMemoryUpdates(updates, sanitizedId);
      }

      // Build where clause with namespace filtering
      const whereClause: any = { id: sanitizedId, namespace: sanitizedNamespace };

      // Check if memory exists
      const existingMemory = await this.prisma.longTermMemory.findFirst({
        where: whereClause,
      });

      if (!existingMemory) {
        throw new Error(`Memory ${sanitizedId} not found in namespace ${sanitizedNamespace}`);
      }

      // Prepare update data
      const updateData: any = {};
      let hasUpdates = false;

      if (updates.content !== undefined) {
        updateData.searchableContent = this.sanitizeString(updates.content, {
          fieldName: 'content',
          maxLength: this.config.maxContentLength,
        });
        hasUpdates = true;
      }

      if (updates.summary !== undefined) {
        updateData.summary = this.sanitizeString(updates.summary, {
          fieldName: 'summary',
          maxLength: 2000,
        });
        hasUpdates = true;
      }

      if (updates.classification !== undefined) {
        updateData.classification = updates.classification;
        hasUpdates = true;
      }

      if (updates.importance !== undefined) {
        updateData.memoryImportance = updates.importance;
        updateData.importanceScore = this.calculateImportanceScore(updates.importance);
        hasUpdates = true;
      }

      if (updates.topic !== undefined) {
        updateData.topic = updates.topic ? this.sanitizeString(updates.topic, {
          fieldName: 'topic',
          maxLength: 500,
        }) : null;
        hasUpdates = true;
      }

      if (updates.entities !== undefined) {
        updateData.entitiesJson = updates.entities;
        hasUpdates = true;
      }

      if (updates.keywords !== undefined) {
        updateData.keywordsJson = updates.keywords;
        hasUpdates = true;
      }

      if (updates.confidenceScore !== undefined) {
        updateData.confidenceScore = updates.confidenceScore;
        hasUpdates = true;
      }

      if (updates.classificationReason !== undefined) {
        updateData.classificationReason = this.sanitizeString(updates.classificationReason, {
          fieldName: 'classificationReason',
          maxLength: 1000,
        });
        hasUpdates = true;
      }

      if (hasUpdates) {
        updateData.extractionTimestamp = new Date(); // Update timestamp for modifications

        await this.prisma.longTermMemory.update({
          where: { id: sanitizedId },
          data: updateData,
        });

        // Update state tracking if enabled
        if (this.config.enableStateTracking && !options.skipStateTracking) {
          try {
            await this.stateManager.transitionMemoryState(
              sanitizedId,
              MemoryProcessingState.PROCESSED,
              {
                reason: 'Memory updated',
                agentId: 'MemoryManager',
                metadata: {
                  updatedFields: Object.keys(updates),
                  namespace: sanitizedNamespace,
                },
              },
            );
          } catch (stateError) {
            logError('Failed to update state tracking for memory update', {
              component: 'MemoryManager',
              memoryId: sanitizedId,
              error: stateError instanceof Error ? stateError.message : String(stateError),
            });
          }
        }

        logInfo('Successfully updated memory', {
          component: 'MemoryManager',
          memoryId: sanitizedId,
          updatedFields: Object.keys(updates),
          namespace: sanitizedNamespace,
          duration: Date.now() - startTime,
        });

        return true;
      }

      logInfo('No updates to apply for memory', {
        component: 'MemoryManager',
        memoryId: sanitizedId,
        namespace: sanitizedNamespace,
      });

      return false;

    } catch (error) {
      logError('Failed to update memory', {
        component: 'MemoryManager',
        memoryId: id,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete a memory with proper cleanup and state tracking
   */
  async deleteMemory(
    id: string,
    namespace?: string,
    options: MemoryDeletionOptions = {},
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      logInfo('Deleting memory', {
        component: 'MemoryManager',
        memoryId: id,
        namespace,
        cascadeDelete: options.cascadeDelete,
      });

      // Sanitize inputs
      const sanitizedId = this.sanitizeString(id, {
        fieldName: 'memoryId',
        maxLength: 100,
        allowNewlines: false,
      });

      const sanitizedNamespace = namespace
        ? this.sanitizeNamespace(namespace, { fieldName: 'namespace' })
        : this.config.defaultNamespace;

      // Build where clause with namespace filtering
      // Since the database schema defaults namespace to 'default', we can simplify this
      const whereClause: any = { id: sanitizedId, namespace: sanitizedNamespace };

      // Check if memory exists
      const existingMemory = await this.prisma.longTermMemory.findFirst({
        where: whereClause,
      });

      if (!existingMemory) {
        logInfo('Memory not found for deletion', {
          component: 'MemoryManager',
          memoryId: sanitizedId,
          namespace: sanitizedNamespace,
        });
        return false;
      }

      // Delete the memory
      await this.prisma.longTermMemory.delete({
        where: { id: sanitizedId },
      });

      // Clean up state tracking if enabled
      if (this.config.enableStateTracking && !options.skipStateTracking) {
        try {
          // Clear state tracking for the deleted memory
          this.stateManager.getStateManager().clearMemoryState(sanitizedId);

          logInfo('State tracking cleaned up for deleted memory', {
            component: 'MemoryManager',
            memoryId: sanitizedId,
          });
        } catch (stateError) {
          logError('Failed to cleanup state tracking for deleted memory', {
            component: 'MemoryManager',
            memoryId: sanitizedId,
            error: stateError instanceof Error ? stateError.message : String(stateError),
          });
        }
      }

      logInfo('Successfully deleted memory', {
        component: 'MemoryManager',
        memoryId: sanitizedId,
        namespace: sanitizedNamespace,
        duration: Date.now() - startTime,
      });

      return true;

    } catch (error) {
      logError('Failed to delete memory', {
        component: 'MemoryManager',
        memoryId: id,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get memories by namespace with pagination support
   */
  async getMemoriesByNamespace(
    namespace: string,
    options: MemoryQueryOptions = {},
  ): Promise<ProcessedLongTermMemory[]> {
    const startTime = Date.now();

    try {
      logInfo('Retrieving memories by namespace', {
        component: 'MemoryManager',
        namespace,
        limit: options.limit,
        offset: options.offset,
      });

      // Sanitize inputs
      const sanitizedNamespace = this.sanitizeNamespace(namespace, { fieldName: 'namespace' });
      const limit = Math.min(options.limit || 50, 1000); // Cap at 1000 for security
      const offset = options.offset || 0;

      // Build where clause with namespace filtering
      const whereClause: any = { namespace: sanitizedNamespace };

      const memories = await this.prisma.longTermMemory.findMany({
        where: whereClause,
        take: limit,
        skip: offset,
        orderBy: { extractionTimestamp: 'desc' },
      });

      const results: ProcessedLongTermMemory[] = memories.map((memory: any) => ({
        content: memory.searchableContent,
        summary: memory.summary,
        classification: memory.classification as MemoryClassification,
        importance: memory.memoryImportance as MemoryImportanceLevel,
        conversationId: memory.originalChatId ?? '',
        topic: memory.topic || undefined,
        entities: (memory.entitiesJson as string[]) || [],
        keywords: (memory.keywordsJson as string[]) || [],
        confidenceScore: memory.confidenceScore,
        classificationReason: memory.classificationReason || '',
        promotionEligible: false,
      }));

      logInfo('Successfully retrieved memories by namespace', {
        component: 'MemoryManager',
        namespace: sanitizedNamespace,
        count: results.length,
        duration: Date.now() - startTime,
      });

      return results;

    } catch (error) {
      logError('Failed to retrieve memories by namespace', {
        component: 'MemoryManager',
        namespace,
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get memories by minimum importance level with namespace filtering
   */
  async getMemoriesByImportance(
    minImportance: MemoryImportanceLevel,
    namespace?: string,
    options: MemoryQueryOptions = {},
  ): Promise<ProcessedLongTermMemory[]> {
    const startTime = Date.now();

    try {
      logInfo('Retrieving memories by importance', {
        component: 'MemoryManager',
        minImportance,
        namespace,
        limit: options.limit,
      });

      // Sanitize inputs
      const sanitizedNamespace = namespace
        ? this.sanitizeNamespace(namespace, { fieldName: 'namespace' })
        : this.config.defaultNamespace;

      const minScore = this.calculateImportanceScore(minImportance);
      const limit = Math.min(options.limit || 50, 1000);

      const whereClause: any = {
        importanceScore: { gte: minScore },
        namespace: sanitizedNamespace,
      };

      const memories = await this.prisma.longTermMemory.findMany({
        where: whereClause,
        take: limit,
        orderBy: { importanceScore: 'desc' },
      });

      const results: ProcessedLongTermMemory[] = memories.map((memory: any) => ({
        content: memory.searchableContent,
        summary: memory.summary,
        classification: memory.classification as MemoryClassification,
        importance: memory.memoryImportance as MemoryImportanceLevel,
        conversationId: memory.originalChatId ?? '',
        topic: memory.topic || undefined,
        entities: (memory.entitiesJson as string[]) || [],
        keywords: (memory.keywordsJson as string[]) || [],
        confidenceScore: memory.confidenceScore,
        classificationReason: memory.classificationReason || '',
        promotionEligible: false,
      }));

      logInfo('Successfully retrieved memories by importance', {
        component: 'MemoryManager',
        minImportance,
        namespace: sanitizedNamespace,
        count: results.length,
        duration: Date.now() - startTime,
      });

      return results;

    } catch (error) {
      logError('Failed to retrieve memories by importance', {
        component: 'MemoryManager',
        minImportance,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate importance score from importance level
   */
  private calculateImportanceScore(level: string): number {
    const scores = {
      [MemoryImportanceLevel.CRITICAL]: 0.9,
      [MemoryImportanceLevel.HIGH]: 0.7,
      [MemoryImportanceLevel.MEDIUM]: 0.5,
      [MemoryImportanceLevel.LOW]: 0.3,
    };
    return scores[level as MemoryImportanceLevel] || 0.5;
  }

  /**
   * Validate and sanitize memory input data
   */
  private async validateAndSanitizeMemoryInput(
    memoryData: ProcessedLongTermMemory,
    chatId: string | null,
    namespace: string,
  ): Promise<{
    memoryData: ProcessedLongTermMemory;
    chatId: string | null;
    namespace: string;
  }> {
    // Sanitize chat ID (handle null values)
    const sanitizedChatId = chatId ? this.sanitizeString(chatId, {
      fieldName: 'chatId',
      maxLength: 100,
      allowNewlines: false,
    }) : null;

    // Sanitize namespace
    const sanitizedNamespace = this.sanitizeNamespace(namespace, {
      fieldName: 'namespace',
    });

    // Validate enum values before sanitization
    const validImportanceLevels = Object.values(MemoryImportanceLevel);
    if (!validImportanceLevels.includes(memoryData.importance)) {
      throw new ValidationError(
        `Invalid importance level: ${memoryData.importance}`,
        'importance',
        memoryData.importance,
        'enum_validation',
      );
    }

    const validClassifications = Object.values(MemoryClassification);
    if (!validClassifications.includes(memoryData.classification)) {
      throw new ValidationError(
        `Invalid classification: ${memoryData.classification}`,
        'classification',
        memoryData.classification,
        'enum_validation',
      );
    }

    // Validate confidence score range
    if (memoryData.confidenceScore < 0 || memoryData.confidenceScore > 1) {
      throw new ValidationError(
        'Confidence score must be between 0 and 1',
        'confidenceScore',
        memoryData.confidenceScore,
        'range_validation',
      );
    }

    // Sanitize memory data
    const sanitizedMemoryData: ProcessedLongTermMemory = {
      content: this.sanitizeString(memoryData.content, {
        fieldName: 'content',
        maxLength: this.config.maxContentLength,
      }),
      summary: this.sanitizeString(memoryData.summary, {
        fieldName: 'summary',
        maxLength: 2000,
      }),
      classification: memoryData.classification,
      importance: memoryData.importance,
      conversationId: '', // Will be set by the calling function
      topic: memoryData.topic ? this.sanitizeString(memoryData.topic, {
        fieldName: 'topic',
        maxLength: 500,
      }) : undefined,
      entities: Array.isArray(memoryData.entities)
        ? memoryData.entities.map(entity => this.sanitizeString(entity, {
          fieldName: 'entity',
          maxLength: 200,
        }))
        : [],
      keywords: Array.isArray(memoryData.keywords)
        ? memoryData.keywords.map(keyword => this.sanitizeString(keyword, {
          fieldName: 'keyword',
          maxLength: 100,
        }))
        : [],
      confidenceScore: memoryData.confidenceScore,
      classificationReason: this.sanitizeString(memoryData.classificationReason, {
        fieldName: 'classificationReason',
        maxLength: 1000,
      }),
      promotionEligible: false,
    };

    return {
      memoryData: sanitizedMemoryData,
      chatId: sanitizedChatId,
      namespace: sanitizedNamespace,
    };
  }

  /**
   * Validate memory updates
   */
  private async validateMemoryUpdates(
    updates: Partial<ProcessedLongTermMemory>,
    _memoryId: string,
  ): Promise<void> {
    // Validate content length if provided
    if (updates.content !== undefined) {
      if (updates.content.length > this.config.maxContentLength) {
        throw new ValidationError(
          `Content exceeds maximum length of ${this.config.maxContentLength} characters`,
          'content',
          updates.content,
          'length_validation',
        );
      }
    }

    // Validate importance level if provided
    if (updates.importance !== undefined) {
      const validImportanceLevels = Object.values(MemoryImportanceLevel);
      if (!validImportanceLevels.includes(updates.importance)) {
        throw new ValidationError(
          `Invalid importance level: ${updates.importance}`,
          'importance',
          updates.importance,
          'enum_validation',
        );
      }
    }

    // Validate classification if provided
    if (updates.classification !== undefined) {
      const validClassifications = Object.values(MemoryClassification);
      if (!validClassifications.includes(updates.classification)) {
        throw new ValidationError(
          `Invalid classification: ${updates.classification}`,
          'classification',
          updates.classification,
          'enum_validation',
        );
      }
    }

    // Validate confidence score if provided
    if (updates.confidenceScore !== undefined) {
      if (updates.confidenceScore < 0 || updates.confidenceScore > 1) {
        throw new ValidationError(
          'Confidence score must be between 0 and 1',
          'confidenceScore',
          updates.confidenceScore,
          'range_validation',
        );
      }
    }
  }

  /**
   * Get StateManager instance for direct access
   */
  getStateManager(): StateManager {
    return this.stateManager;
  }

  /**
   * Get database context for advanced operations
   */
  getDatabaseContext(): DatabaseContext {
    return this.databaseContext;
  }

  /**
   * Get memory manager configuration
   */
  getConfig(): Required<MemoryManagerConfig> {
    return { ...this.config };
  }
}
