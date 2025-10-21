import { v4 as uuidv4 } from 'uuid';
import { BaseLLMProvider } from './BaseLLMProvider';
import {
  IProviderConfig,
  MemoryConfig,
  extractLegacyMemoryConfig,
  extractMemoryConfig,
  DEFAULT_MEMORY_CONFIG,
} from './IProviderConfig';
import {
  ProviderInitializationOptions,
  ProviderMemoryContext,
} from './ILLMProvider';
import { ChatCompletionParams } from './types/ChatCompletionParams';
import { ChatCompletionResponse } from './types/ChatCompletionResponse';
import { EmbeddingParams } from './types/EmbeddingParams';
import { EmbeddingResponse } from './types/EmbeddingResponse';
import { MemoryAgent } from '../../domain/memory/MemoryAgent';
import { DatabaseManager } from '../database/DatabaseManager';
import { ProcessedLongTermMemory, MemoryRelationship } from '../../types/schemas';
import { MemorySearchResult } from '../../types/models';
import { logError, logInfo, logWarn } from '../config/Logger';
import type {
  ChatCompletionCreateParams,
  ChatCompletion,
  ChatCompletionChunk,
  CreateEmbeddingResponse,
  EmbeddingCreateParams,
  RecordChatCompletionOptions,
  RecordEmbeddingOptions,
  MemoryRecordingResult,
  MemoryManager,
} from '../../../integrations/openai-dropin/types';

type MemoryProcessingResult = {
  memoryId?: string;
  chatId: string;
  duration: number;
  success: boolean;
  classification?: string;
  importance?: string;
};

interface MemoryPersistenceMetadata {
  userInput: string;
  aiOutput: string;
  model: string;
  isEmbedding?: boolean;
}

interface MemoryNamespaceContext {
  sessionId: string;
  namespace: string;
}

const FALLBACK_SESSION_ID = DEFAULT_MEMORY_CONFIG.sessionId ?? 'default-session';

/**
 * Base provider that embeds MemoryAgent processing directly into the provider lifecycle.
 * Concrete providers still only implement core LLM calls (executeChatCompletion / executeEmbedding).
 */
export abstract class MemoryCapableProvider
  extends BaseLLMProvider
  implements MemoryManager
{
  protected memoryConfig: MemoryConfig;
  protected memoryAgent?: MemoryAgent;
  protected databaseManager?: DatabaseManager;
  protected memoryContext?: ProviderMemoryContext;
  protected namespaceContext: MemoryNamespaceContext;
  protected memoryDisabled = false;

  private createdDatabaseManager = false;

  private memoryMetrics = {
    totalRequests: 0,
    memoryRecordingSuccess: 0,
    memoryRecordingFailures: 0,
    averageResponseTime: 0,
    averageMemoryProcessingTime: 0,
  };

  constructor(config: IProviderConfig) {
    super(config);
    this.memoryConfig = this.resolveMemoryConfig(config);
    const initialSessionId: string = this.memoryConfig.sessionId ?? FALLBACK_SESSION_ID;
    this.namespaceContext = {
      sessionId: initialSessionId,
      namespace: initialSessionId,
    };
  }

  override async initialize(
    config: IProviderConfig,
    options?: ProviderInitializationOptions,
  ): Promise<void> {
    await super.initialize(config, options);
    this.memoryConfig = this.resolveMemoryConfig(config);
    this.memoryDisabled = options?.disableMemoryProcessing ?? false;

    const resolvedSessionId: string =
      options?.memory?.sessionId ??
      this.memoryConfig.sessionId ??
      FALLBACK_SESSION_ID;
    const resolvedNamespace: string =
      options?.memory?.namespace ??
      options?.memory?.sessionId ??
      this.memoryConfig.sessionId ??
      FALLBACK_SESSION_ID;

    this.namespaceContext = {
      sessionId: resolvedSessionId,
      namespace: resolvedNamespace,
    };

    if (this.memoryDisabled || (!this.memoryConfig.enableChatMemory && !this.memoryConfig.enableEmbeddingMemory)) {
      logInfo('Memory processing disabled for provider', {
        component: 'MemoryCapableProvider',
        providerType: this.getProviderType(),
        reason: this.memoryDisabled ? 'initialization_option' : 'features_disabled',
      });
      return;
    }

    await this.setupMemoryInfrastructure(options?.memory);
  }

  override async dispose(): Promise<void> {
    await super.dispose();

    if (this.createdDatabaseManager && this.databaseManager) {
      try {
        await this.databaseManager.close();
      } catch (error) {
        logWarn('Failed to close database manager during provider disposal', {
          component: 'MemoryCapableProvider',
          providerType: this.getProviderType(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Memory-aware hook run after chat completion finishes.
   */
  protected override async afterChatCompletion(
    params: ChatCompletionParams,
    response: ChatCompletionResponse,
  ): Promise<void> {
    if (!this.shouldProcessChatMemory()) {
      return;
    }

    const lastUserMessage = this.extractLastUserMessage(params);
    const aiOutput = response.message?.content ?? '';

    if (!lastUserMessage && !aiOutput) {
      return;
    }

    const chatId = this.generateChatId('chat');
    const processingStart = Date.now();

    try {
      const processedMemory = await this.memoryAgent!.processConversation({
        chatId,
        userInput: lastUserMessage || '',
        aiOutput,
        context: {
          sessionId: this.namespaceContext.sessionId,
          conversationId: chatId,
          modelUsed: params.model || this.getModel(),
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      });

      await this.persistProcessedMemory(chatId, processedMemory, {
        userInput: lastUserMessage || '',
        aiOutput,
        model: params.model || this.getModel(),
      });

      this.recordMemoryMetrics(true, Date.now() - processingStart);
      logInfo('Chat memory processed', {
        component: 'MemoryCapableProvider',
        providerType: this.getProviderType(),
        chatId,
        classification: processedMemory.classification,
        importance: processedMemory.importance,
      });
    } catch (error) {
      this.recordMemoryMetrics(false, Date.now() - processingStart);
      logError('Failed to process chat memory', {
        component: 'MemoryCapableProvider',
        providerType: this.getProviderType(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Memory-aware hook run after embedding generation finishes.
   */
  protected override async afterEmbedding(
    params: EmbeddingParams,
    response: EmbeddingResponse,
  ): Promise<void> {
    if (!this.shouldProcessEmbeddingMemory()) {
      return;
    }

    const chatId = this.generateChatId('embedding');
    const processingStart = Date.now();

    try {
      const inputSummary = this.summarizeEmbeddingInput(params.input);
      const embeddingSummary = `Generated ${response.data.length} embeddings with ${(response.data[0]?.embedding?.length) || 0} dimensions`;

      const processedMemory = await this.memoryAgent!.processConversation({
        chatId,
        userInput: `Embedding request: ${inputSummary}`,
        aiOutput: embeddingSummary,
        context: {
          sessionId: this.namespaceContext.sessionId,
          conversationId: chatId,
          modelUsed: params.model || 'text-embedding-3-small',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      });

      await this.persistProcessedMemory(chatId, processedMemory, {
        userInput: inputSummary,
        aiOutput: embeddingSummary,
        model: params.model || 'text-embedding-3-small',
        isEmbedding: true,
      });

      this.recordMemoryMetrics(true, Date.now() - processingStart);
      logInfo('Embedding memory processed', {
        component: 'MemoryCapableProvider',
        providerType: this.getProviderType(),
        chatId,
        classification: processedMemory.classification,
        importance: processedMemory.importance,
      });
    } catch (error) {
      this.recordMemoryMetrics(false, Date.now() - processingStart);
      logError('Failed to process embedding memory', {
        component: 'MemoryCapableProvider',
        providerType: this.getProviderType(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Direct memory recording API used by MemoriOpenAI drop-in client.
   */
  async recordChatCompletion(
    params: ChatCompletionCreateParams,
    response: ChatCompletion | AsyncIterable<ChatCompletionChunk>,
    options?: RecordChatCompletionOptions,
  ): Promise<MemoryRecordingResult> {
    if (!this.shouldProcessChatMemory()) {
      return {
        success: false,
        duration: 0,
        wasStreaming: Boolean(options?.isStreaming),
        error: 'Memory processing disabled',
      };
    }

    const startTime = Date.now();

    try {
      const lastUserMessage = this.extractLastUserMessageFromChatParams(params);
      const aiOutput = this.extractAssistantOutput(response);
      const chatId = `record_${Date.now()}_${uuidv4()}`;

      const processedMemory = await this.memoryAgent!.processConversation({
        chatId,
        userInput: lastUserMessage || '',
        aiOutput,
        context: {
          sessionId: this.namespaceContext.sessionId,
          conversationId: chatId,
          modelUsed: params.model || this.getModel(),
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      });

      await this.persistProcessedMemory(chatId, processedMemory, {
        userInput: lastUserMessage || '',
        aiOutput,
        model: params.model || this.getModel(),
      });

      return {
        success: true,
        chatId,
        duration: Date.now() - startTime,
        wasStreaming: Boolean(options?.isStreaming),
        classification: processedMemory.classification,
        importance: processedMemory.importance,
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        wasStreaming: Boolean(options?.isStreaming),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async recordEmbedding(
    params: EmbeddingCreateParams,
    response: CreateEmbeddingResponse,
    options?: RecordEmbeddingOptions,
  ): Promise<MemoryRecordingResult> {
    if (!this.shouldProcessEmbeddingMemory() || options?.enableMemory === false) {
      return {
        success: true,
        duration: 0,
        wasStreaming: false,
      };
    }

    const startTime = Date.now();

    try {
      const inputSummary = this.summarizeEmbeddingInput(params.input);
      const chatId = `embedding_record_${Date.now()}_${uuidv4()}`;

      const processedMemory = await this.memoryAgent!.processConversation({
        chatId,
        userInput: `Embedding request: ${inputSummary}`,
        aiOutput: `Generated ${response.data.length} embeddings`,
        context: {
          sessionId: this.namespaceContext.sessionId,
          conversationId: chatId,
          modelUsed: params.model || 'text-embedding-3-small',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      });

      await this.persistProcessedMemory(chatId, processedMemory, {
        userInput: inputSummary,
        aiOutput: `Generated ${response.data.length} embeddings`,
        model: params.model || 'text-embedding-3-small',
        isEmbedding: true,
      });

      return {
        success: true,
        chatId,
        duration: Date.now() - startTime,
        wasStreaming: false,
        classification: processedMemory.classification,
        importance: processedMemory.importance,
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        wasStreaming: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async searchMemories(
    query: string,
    options?: {
      limit?: number;
      minImportance?: string;
      namespace?: string;
    }
  ): Promise<MemorySearchResult[]> {
    if (!this.databaseManager) {
      return [];
    }

    try {
      const searchManager = (this.databaseManager as any).searchManager;
      if (!searchManager) {
        return [];
      }

      return await searchManager.searchMemories(query, {
        limit: options?.limit ?? 5,
        minImportance: options?.minImportance,
        namespace: options?.namespace || this.namespaceContext.namespace,
      });
    } catch (error) {
      logError('Memory search failed', {
        component: 'MemoryCapableProvider',
        providerType: this.getProviderType(),
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async getMemoryStats(): Promise<{
    totalConversations: number;
    totalMemories: number;
    shortTermMemories: number;
    longTermMemories: number;
    consciousMemories: number;
    lastActivity?: Date;
  }> {
    if (!this.databaseManager) {
      return {
        totalConversations: 0,
        totalMemories: 0,
        shortTermMemories: 0,
        longTermMemories: 0,
        consciousMemories: 0,
      };
    }

    try {
      const statisticsManager = (this.databaseManager as any).statisticsManager;
      if (!statisticsManager) {
        return {
          totalConversations: 0,
          totalMemories: 0,
          shortTermMemories: 0,
          longTermMemories: 0,
          consciousMemories: 0,
        };
      }

      const stats = await statisticsManager.getDatabaseStats(this.namespaceContext.namespace);
      return {
        totalConversations: stats.totalConversations,
        totalMemories: stats.totalMemories,
        shortTermMemories: stats.shortTermMemories,
        longTermMemories: stats.longTermMemories,
        consciousMemories: stats.consciousMemories,
        lastActivity: stats.lastActivity,
      };
    } catch (error) {
      logError('Failed to retrieve memory statistics', {
        component: 'MemoryCapableProvider',
        providerType: this.getProviderType(),
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        totalConversations: 0,
        totalMemories: 0,
        shortTermMemories: 0,
        longTermMemories: 0,
        consciousMemories: 0,
      };
    }
  }

  getMemoryMetrics(): typeof this.memoryMetrics {
    return { ...this.memoryMetrics };
  }

  updateMemoryConfig(config: Partial<IProviderConfig['memory']>): void {
    if (!config) {
      return;
    }

    this.config = {
      ...this.config,
      memory: { ...this.config.memory, ...config },
    };
    this.memoryConfig = this.resolveMemoryConfig(this.config);
    const sessionId = this.memoryConfig.sessionId ?? FALLBACK_SESSION_ID;
    this.namespaceContext = {
      sessionId,
      namespace: sessionId,
    };

    logInfo('Provider memory configuration updated', {
      component: 'MemoryCapableProvider',
      providerType: this.getProviderType(),
      enableChatMemory: this.memoryConfig.enableChatMemory,
      enableEmbeddingMemory: this.memoryConfig.enableEmbeddingMemory,
      memoryProcessingMode: this.memoryConfig.memoryProcessingMode,
    });
  }

  private async setupMemoryInfrastructure(
    context?: ProviderMemoryContext,
  ): Promise<void> {
    this.memoryContext = context;

    if (context?.databaseManager) {
      this.databaseManager = context.databaseManager;
    } else {
      const databaseUrl =
        process.env.MEMORI_DATABASE_URL ||
        process.env.DATABASE_URL ||
        'file:./memori.db';
      this.databaseManager = new DatabaseManager(databaseUrl);
      this.createdDatabaseManager = true;
    }

    if (context?.memoryAgent) {
      this.memoryAgent = context.memoryAgent;
    } else {
      this.memoryAgent = new MemoryAgent(this.createAnalysisProvider(), this.databaseManager);
    }
  }

  private resolveMemoryConfig(config: IProviderConfig): MemoryConfig {
    if (config.features?.memory) {
      return extractMemoryConfig(config);
    }
    return extractLegacyMemoryConfig(config);
  }

  private shouldProcessChatMemory(): boolean {
    return (
      !this.memoryDisabled &&
      this.memoryConfig.enableChatMemory &&
      !!this.memoryAgent &&
      !!this.databaseManager
    );
  }

  private shouldProcessEmbeddingMemory(): boolean {
    return (
      !this.memoryDisabled &&
      this.memoryConfig.enableEmbeddingMemory &&
      !!this.memoryAgent &&
      !!this.databaseManager
    );
  }

  private createAnalysisProvider(): MemoryAgent['llmProvider'] {
    const self = this;
    return {
      getProviderType: () => self.getProviderType(),
      getConfig: () => ({ ...self.getConfig(), memory: { enableChatMemory: false, enableEmbeddingMemory: false } }),
      async initialize() { /* no-op */ },
      async dispose() { /* no-op */ },
      async isHealthy() { return true; },
      async getDiagnostics() {
        return {
          providerType: self.getProviderType(),
          isInitialized: true,
          isHealthy: true,
          model: self.getModel(),
          metadata: {},
          timestamp: new Date(),
        };
      },
      getModel: () => self.getModel(),
      createChatCompletion: (params: ChatCompletionParams) => self.executeChatCompletion(params),
      createEmbedding: (params: EmbeddingParams) => self.executeEmbedding(params),
      getClient: () => self.getClient(),
    };
  }

  private extractLastUserMessage(params: ChatCompletionParams): string | undefined {
    const lastUserMessage = params.messages
      .slice()
      .reverse()
      .find(message => message.role === 'user');
    if (!lastUserMessage) {
      return undefined;
    }
    if (typeof lastUserMessage.content === 'string') {
      return lastUserMessage.content;
    }

    if (Array.isArray(lastUserMessage.content)) {
      const parts = lastUserMessage.content as Array<any>;
      return parts
        .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
        .join(' ');
    }

    return String(lastUserMessage.content);
  }

  private extractLastUserMessageFromChatParams(params: ChatCompletionCreateParams): string | undefined {
    const lastUserMessage = params.messages
      .slice()
      .reverse()
      .find(message => message.role === 'user');
    if (!lastUserMessage) {
      return undefined;
    }
    if (typeof lastUserMessage.content === 'string') {
      return lastUserMessage.content;
    }

    if (Array.isArray(lastUserMessage.content)) {
      const parts = lastUserMessage.content as Array<any>;
      return parts
        .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
        .join(' ');
    }

    return String(lastUserMessage.content);
  }

  private extractAssistantOutput(response: ChatCompletion | AsyncIterable<ChatCompletionChunk>): string {
    if (Symbol.asyncIterator in Object(response as any)) {
      // Streaming responses not yet supported for direct recording
      return '';
    }
    const completion = response as ChatCompletion;
    return completion.choices?.[0]?.message?.content || '';
  }

  private summarizeEmbeddingInput(input: string | string[] | number[] | number[][]): string {
    if (Array.isArray(input)) {
      if (input.length === 0) return '';
      if (input.length === 1) return String(input[0]);
      return `${String(input[0])} (+${input.length - 1} more items)`;
    }
    return String(input);
  }

  private generateChatId(prefix: 'chat' | 'embedding'): string {
    return `${prefix}_${Date.now()}_${uuidv4()}`;
  }

  private async persistProcessedMemory(
    chatId: string,
    processedMemory: ProcessedLongTermMemory,
    metadata: MemoryPersistenceMetadata,
  ): Promise<MemoryProcessingResult> {
    if (!this.databaseManager) {
      throw new Error('Database manager not available for memory persistence');
    }

    const namespace = this.namespaceContext.namespace;

    try {
      await this.databaseManager.storeChatHistory({
        chatId,
        userInput: metadata.userInput.substring(0, 500),
        aiOutput: metadata.aiOutput.substring(0, 2000),
        model: metadata.model,
        sessionId: this.namespaceContext.sessionId,
        namespace,
        metadata: {
          memoryGenerated: true,
          isEmbedding: metadata.isEmbedding ?? false,
          providerType: this.getProviderType(),
        },
      });
    } catch (error) {
      logWarn('Failed to store chat history for memory persistence', {
        component: 'MemoryCapableProvider',
        providerType: this.getProviderType(),
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const memoryId = await this.databaseManager.storeLongTermMemory(
      processedMemory,
      chatId,
      namespace,
    );

    if (processedMemory.relatedMemories && processedMemory.relatedMemories.length > 0) {
      await this.storeMemoryRelationships(memoryId, processedMemory.relatedMemories, namespace);
    }

    return {
      chatId,
      memoryId,
      duration: 0,
      success: true,
      classification: processedMemory.classification,
      importance: processedMemory.importance,
    };
  }

  private async storeMemoryRelationships(
    memoryId: string,
    relationships: MemoryRelationship[],
    namespace: string,
  ): Promise<void> {
    if (!this.databaseManager || relationships.length === 0) {
      return;
    }

    try {
      await this.databaseManager.storeMemoryRelationships(memoryId, relationships, namespace);
    } catch (error) {
      logWarn('Failed to store memory relationships', {
        component: 'MemoryCapableProvider',
        providerType: this.getProviderType(),
        memoryId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private recordMemoryMetrics(success: boolean, duration: number): void {
    this.memoryMetrics.totalRequests += 1;
    if (success) {
      this.memoryMetrics.memoryRecordingSuccess += 1;
    } else {
      this.memoryMetrics.memoryRecordingFailures += 1;
    }

    const total = this.memoryMetrics.totalRequests;
    this.memoryMetrics.averageMemoryProcessingTime =
      (this.memoryMetrics.averageMemoryProcessingTime * (total - 1) + duration) / total;
    this.memoryMetrics.averageResponseTime =
      (this.memoryMetrics.averageResponseTime * (total - 1) + duration) / total;
  }
}
