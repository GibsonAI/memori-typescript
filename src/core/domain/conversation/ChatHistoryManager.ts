import { ChatHistoryData } from '../../infrastructure/database/types';
import { logInfo, logError } from '../../infrastructure/config/Logger';
import { DatabaseContext } from '../../infrastructure/database/DatabaseContext';
import { ValidationError, sanitizeJsonInput } from '../../infrastructure/config/SanitizationUtils';
import { BaseDatabaseService } from '../../infrastructure/database/BaseDatabaseService';

/**
 * ChatHistoryManager - Dedicated class for chat history operations
 *
 * This class provides comprehensive chat history functionality that was
 * extracted from DatabaseManager to follow the Single Responsibility Principle.
 * It focuses solely on chat history storage, retrieval, and management.
 *
 * Features:
 * - Chat history storage with comprehensive data validation
 * - Chat retrieval by various criteria (ID, session, namespace)
 * - Chat history cleanup and maintenance operations
 * - Session-based conversation tracking
 * - Namespace-based filtering capabilities
 * - Comprehensive input sanitization and validation
 * - Performance monitoring integration
 */
export class ChatHistoryManager extends BaseDatabaseService {
  constructor(databaseContext: DatabaseContext) {
    super(databaseContext);
  }

  /**
   * Store chat history with comprehensive input sanitization and validation
   *
   * This method stores chat conversations with full input sanitization,
   * validation, and error handling to ensure data integrity and security.
   */
  async storeChatHistory(data: ChatHistoryData): Promise<string> {
    const startTime = Date.now();
    const operationType = 'store_chat_history';

    try {
      logInfo('Storing chat history', {
        component: 'ChatHistoryManager',
        chatId: data.chatId,
        sessionId: data.sessionId,
        namespace: data.namespace,
        model: data.model,
      });

      // Comprehensive input sanitization and validation
      const sanitizedData = this.sanitizeChatHistoryInput(data);

      // Validate sanitized data
      const validation = this.validateChatHistoryData(sanitizedData);
      if (!validation.isValid) {
        throw new ValidationError(
          `Invalid chat history data: ${validation.errors.join(', ')}`,
          'chatHistoryData',
          JSON.stringify(data),
          'enhanced_validation',
        );
      }

      // Store chat history using Prisma
            const result = await this.prisma.chatHistory.create({
        data: {
          id: sanitizedData.chatId,
          userInput: sanitizedData.userInput,
          aiOutput: sanitizedData.aiOutput,
          model: sanitizedData.model,
          sessionId: sanitizedData.sessionId,
          namespace: sanitizedData.namespace,
          metadata: sanitizedData.metadata as any,
        },
      });

      const duration = Date.now() - startTime;

      logInfo('Chat history stored successfully', {
        component: 'ChatHistoryManager',
        chatId: result.id,
        duration,
        sessionId: data.sessionId,
        namespace: data.namespace,
      });

      // Record performance metrics
      this.databaseContext.recordOperationMetrics({
        operationType,
        startTime,
        success: true,
        duration,
        recordCount: 1,
      });

      return result.id;

    } catch (error) {
      const duration = Date.now() - startTime;

      logError('Failed to store chat history', {
        component: 'ChatHistoryManager',
        chatId: data.chatId,
        sessionId: data.sessionId,
        namespace: data.namespace,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      // Record failed operation metrics
      this.databaseContext.recordOperationMetrics({
        operationType,
        startTime,
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get chat history by ID with namespace validation
   */
  async getChatHistory(chatId: string, namespace?: string): Promise<ChatHistoryData | null> {
    const startTime = Date.now();
    const operationType = 'get_chat_history';

    try {
      // Sanitize chat ID input
      const sanitizedChatId = this.sanitizeString(chatId, {
        fieldName: 'chatId',
        maxLength: 100,
        allowNewlines: false,
      });

      logInfo('Retrieving chat history', {
        component: 'ChatHistoryManager',
        chatId: sanitizedChatId,
        namespace,
      });

            // Build where clause with namespace filtering
      const whereClause: any = { id: sanitizedChatId };
      if (namespace) {
        const sanitizedNamespace = this.sanitizeNamespace(namespace, { fieldName: 'namespace' });
        whereClause.namespace = sanitizedNamespace;
      }

      const result = await this.prisma.chatHistory.findUnique({
        where: whereClause,
      });

      const duration = Date.now() - startTime;

      if (result) {
        logInfo('Chat history retrieved successfully', {
          component: 'ChatHistoryManager',
          chatId: result.id,
          sessionId: result.sessionId,
          duration,
        });

        // Record successful operation metrics
        this.databaseContext.recordOperationMetrics({
          operationType,
          startTime,
          success: true,
          duration,
          recordCount: 1,
        });

        return {
          chatId: result.id,
          userInput: result.userInput,
          aiOutput: result.aiOutput,
          model: result.model,
          sessionId: result.sessionId,
          namespace: result.namespace,
          metadata: result.metadata as unknown,
        };
      } else {
        logInfo('Chat history not found', {
          component: 'ChatHistoryManager',
          chatId: sanitizedChatId,
          namespace,
          duration,
        });

        // Record successful operation (not found is not an error)
        this.databaseContext.recordOperationMetrics({
          operationType,
          startTime,
          success: true,
          duration,
          recordCount: 0,
        });

        return null;
      }

    } catch (error) {
      const duration = Date.now() - startTime;

      logError('Failed to retrieve chat history', {
        component: 'ChatHistoryManager',
        chatId,
        namespace,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      // Record failed operation metrics
      this.databaseContext.recordOperationMetrics({
        operationType,
        startTime,
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get chat history by session ID with optional namespace filtering
   */
  async getChatHistoryBySession(
    sessionId: string,
    namespace?: string,
    options?: {
      limit?: number;
      offset?: number;
      orderBy?: 'asc' | 'desc';
    },
  ): Promise<ChatHistoryData[]> {
    const startTime = Date.now();
    const operationType = 'get_chat_history_by_session';

    try {
      // Sanitize session ID input
      const sanitizedSessionId = this.sanitizeString(sessionId, {
        fieldName: 'sessionId',
        maxLength: 100,
        allowNewlines: false,
      });

      logInfo('Retrieving chat history by session', {
        component: 'ChatHistoryManager',
        sessionId: sanitizedSessionId,
        namespace,
        limit: options?.limit,
        offset: options?.offset,
      });

            // Build where clause
      const whereClause: any = { sessionId: sanitizedSessionId };
      if (namespace) {
        const sanitizedNamespace = this.sanitizeNamespace(namespace, { fieldName: 'namespace' });
        whereClause.namespace = sanitizedNamespace;
      }

      // Set defaults for options
      const limit = Math.min(options?.limit || 100, 1000); // Cap at 1000 for security
      const offset = options?.offset || 0;
      const orderBy = options?.orderBy || 'asc';

      const results = await this.prisma.chatHistory.findMany({
        where: whereClause,
        orderBy: { timestamp: orderBy },
        take: limit,
        skip: offset,
      });

      const duration = Date.now() - startTime;

      logInfo('Chat history by session retrieved successfully', {
        component: 'ChatHistoryManager',
        sessionId: sanitizedSessionId,
        resultCount: results.length,
        duration,
      });

      // Record successful operation metrics
      this.databaseContext.recordOperationMetrics({
        operationType,
        startTime,
        success: true,
        duration,
        recordCount: results.length,
      });

      // Transform results to ChatHistoryData format
      return results.map(result => ({
        chatId: result.id,
        userInput: result.userInput,
        aiOutput: result.aiOutput,
        model: result.model,
        sessionId: result.sessionId,
        namespace: result.namespace,
        metadata: result.metadata as unknown,
      }));

    } catch (error) {
      const duration = Date.now() - startTime;

      logError('Failed to retrieve chat history by session', {
        component: 'ChatHistoryManager',
        sessionId,
        namespace,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      // Record failed operation metrics
      this.databaseContext.recordOperationMetrics({
        operationType,
        startTime,
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Delete chat history by ID with namespace validation
   */
  async deleteChatHistory(chatId: string, namespace?: string): Promise<boolean> {
    const startTime = Date.now();
    const operationType = 'delete_chat_history';

    try {
      // Sanitize chat ID input
      const sanitizedChatId = this.sanitizeString(chatId, {
        fieldName: 'chatId',
        maxLength: 100,
        allowNewlines: false,
      });

      logInfo('Deleting chat history', {
        component: 'ChatHistoryManager',
        chatId: sanitizedChatId,
        namespace,
      });

            // Build where clause with namespace filtering
      const whereClause: any = { id: sanitizedChatId };
      if (namespace) {
        const sanitizedNamespace = this.sanitizeNamespace(namespace, { fieldName: 'namespace' });
        whereClause.namespace = sanitizedNamespace;
      }

      const result = await this.prisma.chatHistory.deleteMany({
        where: whereClause,
      });

      const duration = Date.now() - startTime;
      const deleted = result.count > 0;

      logInfo('Chat history deletion completed', {
        component: 'ChatHistoryManager',
        chatId: sanitizedChatId,
        deleted,
        duration,
      });

      // Record operation metrics
      this.databaseContext.recordOperationMetrics({
        operationType,
        startTime,
        success: true,
        duration,
        recordCount: result.count,
      });

      return deleted;

    } catch (error) {
      const duration = Date.now() - startTime;

      logError('Failed to delete chat history', {
        component: 'ChatHistoryManager',
        chatId,
        namespace,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      // Record failed operation metrics
      this.databaseContext.recordOperationMetrics({
        operationType,
        startTime,
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Clean up old chat history based on age and optional namespace filtering
   */
  async cleanupOldChatHistory(
    olderThanDays: number,
    namespace?: string,
    options?: {
      dryRun?: boolean;
      batchSize?: number;
    }
  ): Promise<number> {
    const startTime = Date.now();
    const operationType = 'cleanup_old_chat_history';

    try {
      // Validate input parameters
      if (olderThanDays < 1 || olderThanDays > 3650) { // Max 10 years
        throw new ValidationError(
          'olderThanDays must be between 1 and 3650',
          'olderThanDays',
          olderThanDays.toString(),
          'parameter_validation',
        );
      }

      const dryRun = options?.dryRun || false;
      const batchSize = Math.min(options?.batchSize || 1000, 5000); // Cap batch size

      logInfo('Starting chat history cleanup', {
        component: 'ChatHistoryManager',
        olderThanDays,
        namespace,
        dryRun,
        batchSize,
      });

            // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Build where clause
      const whereClause: any = {
        timestamp: { lt: cutoffDate }
      };

      if (namespace) {
        const sanitizedNamespace = this.sanitizeNamespace(namespace, { fieldName: 'namespace' });
        whereClause.namespace = sanitizedNamespace;
      }

      if (dryRun) {
        // Count records that would be deleted (dry run)
        const countResult = await this.prisma.chatHistory.count({
          where: whereClause,
        });

        const duration = Date.now() - startTime;

        logInfo('Chat history cleanup dry run completed', {
          component: 'ChatHistoryManager',
          recordsToDelete: countResult,
          olderThanDays,
          namespace,
          duration,
        });

        // Record operation metrics
        this.databaseContext.recordOperationMetrics({
          operationType,
          startTime,
          success: true,
          duration,
          recordCount: countResult,
        });

        return countResult;
      } else {
        // Perform actual cleanup in batches to avoid overwhelming the database
        let totalDeleted = 0;
        let hasMore = true;

        while (hasMore) {
          const batchResult = await this.prisma.chatHistory.deleteMany({
            where: whereClause,
          });

          const deletedInBatch = batchResult.count;
          totalDeleted += deletedInBatch;

          logInfo('Chat history cleanup batch completed', {
            component: 'ChatHistoryManager',
            batchDeleted: deletedInBatch,
            totalDeleted,
            olderThanDays,
            namespace,
          });

          // If we deleted fewer records than batch size, we're done
          hasMore = deletedInBatch >= batchSize;

          // Prevent infinite loops
          if (totalDeleted > 100000) { // Safety limit
            logError('Chat history cleanup safety limit reached', {
              component: 'ChatHistoryManager',
              totalDeleted,
              safetyLimit: 100000,
            });
            break;
          }
        }

        const duration = Date.now() - startTime;

        logInfo('Chat history cleanup completed successfully', {
          component: 'ChatHistoryManager',
          totalDeleted,
          olderThanDays,
          namespace,
          duration,
        });

        // Record operation metrics
        this.databaseContext.recordOperationMetrics({
          operationType,
          startTime,
          success: true,
          duration,
          recordCount: totalDeleted,
        });

        return totalDeleted;
      }

    } catch (error) {
      const duration = Date.now() - startTime;

      logError('Failed to cleanup old chat history', {
        component: 'ChatHistoryManager',
        olderThanDays,
        namespace,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      // Record failed operation metrics
      this.databaseContext.recordOperationMetrics({
        operationType,
        startTime,
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get chat history statistics for a namespace
   */
  async getChatHistoryStats(namespace?: string): Promise<{
    totalConversations: number;
    uniqueSessions: number;
    averageMessagesPerSession: number;
    conversationsByModel: Record<string, number>;
    recentActivity: {
      last24Hours: number;
      last7Days: number;
      last30Days: number;
    };
  }> {
    const startTime = Date.now();
    const operationType = 'get_chat_history_stats';

    try {
      logInfo('Retrieving chat history statistics', {
        component: 'ChatHistoryManager',
        namespace,
      });

            // Build base where clause
      const whereClause: any = {};
      if (namespace) {
        const sanitizedNamespace = this.sanitizeNamespace(namespace, { fieldName: 'namespace' });
        whereClause.namespace = sanitizedNamespace;
      }

      // Execute parallel queries for comprehensive statistics
      const [
        totalConversations,
        uniqueSessionsResult,
        modelBreakdown,
        last24Hours,
        last7Days,
        last30Days,
      ] = await Promise.all([
        this.prisma.chatHistory.count({ where: whereClause }),
        this.prisma.chatHistory.findMany({
          where: whereClause,
          select: { sessionId: true },
          distinct: ['sessionId'],
        }),
        this.prisma.chatHistory.groupBy({
          by: ['model'],
          where: whereClause,
          _count: { id: true },
        }),
        this.prisma.chatHistory.count({
          where: {
            ...whereClause,
            timestamp: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        }),
        this.prisma.chatHistory.count({
          where: {
            ...whereClause,
            timestamp: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
        this.prisma.chatHistory.count({
          where: {
            ...whereClause,
            timestamp: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

      const uniqueSessions = uniqueSessionsResult.length;
      const averageMessagesPerSession = uniqueSessions > 0 ? totalConversations / uniqueSessions : 0;

      // Process model breakdown
      const conversationsByModel: Record<string, number> = {};
      modelBreakdown.forEach(item => {
        conversationsByModel[item.model || 'unknown'] = item._count.id;
      });

      const duration = Date.now() - startTime;
      const result = {
        totalConversations,
        uniqueSessions,
        averageMessagesPerSession: Math.round(averageMessagesPerSession * 100) / 100,
        conversationsByModel,
        recentActivity: {
          last24Hours,
          last7Days,
          last30Days,
        },
      };

      logInfo('Chat history statistics retrieved successfully', {
        component: 'ChatHistoryManager',
        namespace,
        ...result,
        duration,
      });

      // Record successful operation metrics
      this.databaseContext.recordOperationMetrics({
        operationType,
        startTime,
        success: true,
        duration,
        recordCount: totalConversations,
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      logError('Failed to retrieve chat history statistics', {
        component: 'ChatHistoryManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      // Record failed operation metrics
      this.databaseContext.recordOperationMetrics({
        operationType,
        startTime,
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Sanitize chat history input data comprehensively
   */
  private sanitizeChatHistoryInput(data: ChatHistoryData): ChatHistoryData {
    return {
      chatId: this.sanitizeString(data.chatId, {
        fieldName: 'chatId',
        maxLength: 100,
        allowNewlines: false,
      }),
      userInput: this.sanitizeString(data.userInput, {
        fieldName: 'userInput',
        maxLength: 10000,
        allowHtml: false,
      }),
      aiOutput: this.sanitizeString(data.aiOutput, {
        fieldName: 'aiOutput',
        maxLength: 10000,
        allowHtml: false,
      }),
      model: this.sanitizeString(data.model, {
        fieldName: 'model',
        maxLength: 100,
        allowNewlines: false,
      }),
      sessionId: this.sanitizeString(data.sessionId, {
        fieldName: 'sessionId',
        maxLength: 100,
        allowNewlines: false,
      }),
      namespace: this.sanitizeNamespace(data.namespace, {
        fieldName: 'namespace',
      }),
      metadata: data.metadata ? sanitizeJsonInput(
        JSON.stringify(data.metadata),
        { fieldName: 'metadata', maxSize: 50000 },
      ) : undefined,
    };
  }

  /**
   * Validate chat history data for completeness and correctness
   */
  private validateChatHistoryData(data: ChatHistoryData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required fields
    if (!data.chatId || data.chatId.trim().length === 0) {
      errors.push('chatId is required');
    }

    if (!data.userInput || data.userInput.trim().length === 0) {
      errors.push('userInput is required');
    }

    if (!data.aiOutput || data.aiOutput.trim().length === 0) {
      errors.push('aiOutput is required');
    }

    if (!data.model || data.model.trim().length === 0) {
      errors.push('model is required');
    }

    if (!data.sessionId || data.sessionId.trim().length === 0) {
      errors.push('sessionId is required');
    }

    if (!data.namespace || data.namespace.trim().length === 0) {
      errors.push('namespace is required');
    }

    // Validate field lengths
    if (data.chatId && data.chatId.length > 100) {
      errors.push('chatId is too long (max 100 characters)');
    }

    if (data.userInput && data.userInput.length > 10000) {
      errors.push('userInput is too long (max 10000 characters)');
    }

    if (data.aiOutput && data.aiOutput.length > 10000) {
      errors.push('aiOutput is too long (max 10000 characters)');
    }

    if (data.model && data.model.length > 100) {
      errors.push('model is too long (max 100 characters)');
    }

    if (data.sessionId && data.sessionId.length > 100) {
      errors.push('sessionId is too long (max 100 characters)');
    }

    // Validate metadata size if provided
    if (data.metadata) {
      const metadataString = JSON.stringify(data.metadata);
      if (metadataString.length > 50000) {
        errors.push('metadata is too large (max 50000 characters)');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
