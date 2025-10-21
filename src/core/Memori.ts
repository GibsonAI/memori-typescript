// Memori Core Library
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from './infrastructure/database/DatabaseManager';
import { MemoryAgent } from './domain/memory/MemoryAgent';
import { ConsciousAgent } from './domain/memory/ConsciousAgent';
import { OpenAIProvider, OllamaProvider, AnthropicProvider, LLMProviderFactory, ProviderType, MemoryCapableProvider, ILLMProvider, IProviderConfig, ProviderInitializationOptions } from './infrastructure/providers/';
import { ConfigManager, MemoriConfig } from './infrastructure/config/ConfigManager';
import { MemoriAIConfig } from './MemoriAIConfig';
import { logInfo, logError } from './infrastructure/config/Logger';
import {
  MemorySearchResult,
  RecordConversationOptions,
  SearchOptions,
  TemporalFilterOptions,
  DatabaseStats,
} from './types/models';
import { ProcessedLongTermMemory, MemoryClassification, MemoryImportanceLevel, MemoryRelationship } from './types/schemas';
import { SearchStrategy, SearchQuery } from './domain/search/types';


export class Memori {
  private dbManager: DatabaseManager;
  private memoryAgent?: MemoryAgent;
  private consciousAgent?: ConsciousAgent;

  // Dual-provider architecture to prevent circular dependencies
  private userProvider?: MemoryCapableProvider;     // For user operations
  private memoryProvider?: ILLMProvider;                // For internal memory processing

  private config: MemoriConfig & { mode?: 'automatic' | 'manual' | 'conscious' };
  private enabled: boolean = false;
  private sessionId: string;
  private backgroundInterval?: ReturnType<typeof setInterval>;
  private backgroundUpdateInterval: number = 30000; // 30 seconds default

  constructor(config?: Partial<MemoriAIConfig>) {
    // Start with default config and merge in unified config
    const defaultConfig = ConfigManager.loadConfig();
    this.config = { ...defaultConfig };

    if (config) {
      // Handle mode configuration by mapping to legacy options
      if (config.mode) {
        switch (config.mode) {
          case 'automatic':
            this.config.autoIngest = true;
            this.config.consciousIngest = false;
            break;
          case 'manual':
            this.config.autoIngest = false;
            this.config.consciousIngest = false;
            break;
          case 'conscious':
            this.config.autoIngest = false;
            this.config.consciousIngest = true;
            break;
        }
      }

      // Apply other config options
      Object.assign(this.config, config);
    }

    this.sessionId = uuidv4();
    this.dbManager = new DatabaseManager(this.config.databaseUrl);
  }


  /**
    * Initialize the Memori instance with dual-provider architecture
    */
  private async initializeProvider(): Promise<void> {
    if (this.userProvider && this.memoryAgent) {
      return; // Already initialized
    }

    try {
      // Shared memory configuration for providers
      const baseMemoryConfig = {
        enableChatMemory: true,
        enableEmbeddingMemory: false,
        memoryProcessingMode: 'auto' as const,
        minImportanceLevel: 'all' as const,
        sessionId: this.sessionId,
      };

      // Create provider configuration for user-facing operations
      const providerConfig: IProviderConfig = {
        apiKey: this.config.apiKey,
        model: this.config.model,
        baseUrl: this.config.baseUrl,
        features: {
          performance: {
            enableConnectionPooling: false, // Disable for Memori class
            enableCaching: false,
            enableHealthMonitoring: false,
          },
          memory: baseMemoryConfig,
        },
      };

      // Detect provider type
      const providerType = this.detectProviderType(providerConfig);

      // Get provider class and create memory-capable provider
      const ProviderClass = this.getProviderClass(providerType);
      const initializationOptions: ProviderInitializationOptions = {
        memory: {
          databaseManager: this.dbManager,
          sessionId: this.sessionId,
          namespace: this.config.namespace || 'default',
        },
      };

      const userProvider = new ProviderClass(providerConfig) as MemoryCapableProvider;
      await userProvider.initialize(providerConfig, initializationOptions);
      this.userProvider = userProvider;

      // Create separate provider for analysis/memory agent with memory features disabled
      const analysisConfig: IProviderConfig = {
        ...providerConfig,
        features: {
          ...providerConfig.features,
          memory: {
            ...baseMemoryConfig,
            enableChatMemory: false,
            enableEmbeddingMemory: false,
          },
        },
      };

      const analysisProvider = new ProviderClass(analysisConfig) as ILLMProvider;
      await analysisProvider.initialize(analysisConfig, {
        ...initializationOptions,
        disableMemoryProcessing: true,
      });
      this.memoryProvider = analysisProvider;

      // Initialize memory agent with analysis provider
      this.memoryAgent = new MemoryAgent(this.memoryProvider, this.dbManager);

    } catch (error) {
      logError('Failed to initialize Memori providers', {
        component: 'Memori',
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Detect provider type from configuration (simplified version)
   */
  private detectProviderType(config: IProviderConfig): ProviderType {
    if (config.apiKey?.startsWith('sk-ant-')) return ProviderType.ANTHROPIC;
    if (config.apiKey?.startsWith('sk-') && config.apiKey.length > 20) return ProviderType.OPENAI;
    if (config.apiKey === 'ollama-local') return ProviderType.OLLAMA;
    return ProviderType.OPENAI;
  }

  /**
   * Get the provider class for the given provider type
   */
  private getProviderClass(providerType: ProviderType): new (config: IProviderConfig) => MemoryCapableProvider {
    const { OpenAIProvider } = require('./infrastructure/providers/OpenAIProvider');
    const { AnthropicProvider } = require('./infrastructure/providers/AnthropicProvider');
    const { OllamaProvider } = require('./infrastructure/providers/OllamaProvider');

    switch (providerType) {
      case ProviderType.OPENAI: return OpenAIProvider;
      case ProviderType.ANTHROPIC: return AnthropicProvider;
      case ProviderType.OLLAMA: return OllamaProvider;
      default: return OpenAIProvider;
    }
  }

  async enable(): Promise<void> {
    if (this.enabled) {
      throw new Error('Memori is already enabled');
    }

    // Ensure provider is initialized
    await this.initializeProvider();


    // Initialize ConsciousAgent if conscious ingestion is enabled
    if (this.config.consciousIngest) {
      this.consciousAgent = new ConsciousAgent(this.dbManager, this.config.namespace);
      logInfo('ConsciousAgent initialized for conscious ingestion mode', {
        component: 'Memori',
        namespace: this.config.namespace,
      });

      // Run initial conscious memory ingestion
      try {
        await this.consciousAgent.run_conscious_ingest();
        logInfo('Initial conscious memory ingestion completed', {
          component: 'Memori',
          namespace: this.config.namespace,
        });
      } catch (error) {
        logError('Error during initial conscious memory ingestion', {
          component: 'Memori',
          namespace: this.config.namespace,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Don't fail the entire enable process if conscious ingestion fails
      }
    }

    this.enabled = true;

    // Start background monitoring if conscious mode is enabled
    if (this.config.consciousIngest) {
      this.startBackgroundMonitoring();
    }

    logInfo('Memori enabled successfully', {
      component: 'Memori',
      namespace: this.config.namespace,
      sessionId: this.sessionId,
      autoIngest: this.config.autoIngest,
      consciousIngest: this.config.consciousIngest,
      ingestionMode: this.config.autoIngest ? 'auto-ingestion' : (this.config.consciousIngest ? 'conscious-ingestion' : 'no-ingestion'),
    });
  }

  async recordConversation(
    userInput: string,
    aiOutput: string,
    options?: RecordConversationOptions,
  ): Promise<string> {
    if (!this.enabled) {
      throw new Error('Memori is not enabled');
    }

    const chatId = uuidv4();

    await this.dbManager.storeChatHistory({
      chatId,
      userInput,
      aiOutput,
      model: options?.model || this.config.model,
      sessionId: this.sessionId,
      namespace: this.config.namespace,
      metadata: options?.metadata,
    });

    // Process memory based on ingestion mode
    if (this.config.autoIngest) {
      // Auto-ingestion mode: automatically process memory
      this.processMemory(chatId, userInput, aiOutput).catch((error) => {
        logError('Error processing memory in auto-ingestion mode', {
          component: 'Memori',
          chatId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      });
    } else if (this.config.consciousIngest && this.consciousAgent) {
      // Conscious ingestion mode: only store conversation, let conscious agent handle processing
      logInfo(`Conversation stored for conscious processing: ${chatId}`, {
        component: 'Memori',
        chatId,
        mode: 'conscious-ingestion',
      });
    } else {
      // No ingestion mode: just store conversation without processing
      logInfo(`Conversation stored without processing: ${chatId}`, {
        component: 'Memori',
        chatId,
        mode: 'no-ingestion',
      });
    }

    return chatId;
  }

  private async processMemory(
    chatId: string,
    userInput: string,
    aiOutput: string,
  ): Promise<void> {
    if (!this.memoryAgent) {
      await this.initializeProvider();
    }

    if (!this.memoryAgent) {
      throw new Error('Failed to initialize memory agent');
    }

    try {
      const processedMemory = await this.memoryAgent.processConversation({
        chatId,
        userInput,
        aiOutput,
        context: {
          conversationId: chatId,
          sessionId: this.sessionId,
          modelUsed: this.config.model,
          userPreferences: this.config.userContext?.userPreferences || [],
          currentProjects: this.config.userContext?.currentProjects || [],
          relevantSkills: this.config.userContext?.relevantSkills || [],
        },
      });

      const memoryId = await this.dbManager.storeLongTermMemory(
        processedMemory,
        chatId,
        this.config.namespace,
      );

      // Store memory relationships if they were extracted and relationship extraction is enabled
      const extractedRelationships = processedMemory.relatedMemories || [];
      if (extractedRelationships && extractedRelationships.length > 0 && this.config.enableRelationshipExtraction) {
        try {
          // Separate relationships by type for storage
          const generalRelationships = extractedRelationships.filter((r: MemoryRelationship) =>
            r.type !== 'supersedes',
          );
          const supersedingRelationships = extractedRelationships.filter((r: MemoryRelationship) =>
            r.type === 'supersedes',
          );

          // Store relationships using the existing DatabaseManager method
          if (generalRelationships.length > 0 || supersedingRelationships.length > 0) {
            await this.dbManager.storeMemoryRelationships(
              memoryId,
              generalRelationships.concat(supersedingRelationships),
              this.config.namespace,
            );

            logInfo(`Memory relationships stored for chat ${chatId}`, {
              component: 'Memori',
              chatId,
              memoryId,
              namespace: this.config.namespace,
              relationshipCount: extractedRelationships.length,
              generalRelationships: generalRelationships.length,
              supersedingRelationships: supersedingRelationships.length,
            });
          }
        } catch (error) {
          logError(`Failed to store memory relationships for chat ${chatId}`, {
            component: 'Memori',
            chatId,
            memoryId,
            namespace: this.config.namespace,
            error: error instanceof Error ? error.message : String(error),
          });
          // Don't fail the entire process if relationship storage fails
        }
      }

      logInfo(`Memory processed for chat ${chatId}`, {
        component: 'Memori',
        chatId,
        memoryId,
        namespace: this.config.namespace,
        relationshipsStored: processedMemory.relatedMemories?.length || 0,
      });
    } catch (error) {
      logError(`Failed to process memory for chat ${chatId}`, {
        component: 'Memori',
        chatId,
        namespace: this.config.namespace,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  async searchMemories(query: string, options: SearchOptions = {}): Promise<MemorySearchResult[]> {
    const searchManager = (this.dbManager as any).searchManager;
    return searchManager.searchMemories(query, {
      namespace: this.config.namespace,
      limit: options.limit || 5,
      minImportance: options.minImportance,
      categories: options.categories,
      includeMetadata: options.includeMetadata,
    });
  }

  /**
   * Advanced search using specific search strategy
   */
  async searchMemoriesWithStrategy(query: string, strategy: SearchStrategy, options: SearchOptions = {}): Promise<MemorySearchResult[]> {
    if (!this.enabled) {
      throw new Error('Memori is not enabled');
    }

    try {
      const searchService = await this.dbManager.getSearchService();

      const searchQuery: SearchQuery = {
        text: query,
        limit: options.limit || 10,
        includeMetadata: options.includeMetadata,
      };

      const searchResults = await searchService.searchWithStrategy(searchQuery, strategy);

      return searchResults.map(result => ({
        id: result.id,
        content: result.content,
        summary: result.metadata.summary as string || '',
        classification: (result.metadata.category as string || 'unknown') as MemoryClassification,
        importance: (result.metadata.importance as string || 'medium') as MemoryImportanceLevel,
        topic: result.metadata.category as string || undefined,
        entities: [],
        keywords: [],
        confidenceScore: result.score,
        classificationReason: result.strategy,
        metadata: options.includeMetadata ? {
          searchScore: result.score,
          searchStrategy: result.strategy,
          memoryType: result.metadata.memoryType as string || 'long_term',
          category: result.metadata.category as string,
          importanceScore: result.metadata.importanceScore as number || 0.5,
        } : undefined,
      }));

    } catch (error) {
      logError('Advanced search failed', {
        component: 'Memori',
        query,
        strategy,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Search with strategy ${strategy} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get available search strategies
   */
  async getAvailableSearchStrategies(): Promise<SearchStrategy[]> {
    const searchService = await this.dbManager.getSearchService();
    return searchService.getAvailableStrategies();
  }

  /**
    * Search for recent memories (empty query)
    */
  async searchRecentMemories(
    limit: number = 10,
    includeMetadata: boolean = false,
    temporalOptions?: TemporalFilterOptions,
    strategy?: SearchStrategy,
  ): Promise<MemorySearchResult[]> {
    // Use specific strategy if provided, otherwise use searchMemories with RECENT strategy as default
    if (strategy && strategy !== SearchStrategy.RECENT) {
      return this.searchMemoriesWithStrategy('', strategy, {
        limit,
        includeMetadata,
        temporalFilters: temporalOptions,
      });
    }

    // Use RECENT strategy for temporal relevance
    return this.searchMemories('', {
      limit,
      includeMetadata,
      temporalFilters: temporalOptions,
      strategy: SearchStrategy.RECENT,
    });
  }

  async close(): Promise<void> {
    try {
      // Stop background monitoring before closing
      this.stopBackgroundMonitoring();

      // Clean up search service to stop background timers
      try {
        const searchService = await this.dbManager.getSearchService();
        if (searchService && typeof searchService.cleanup === 'function') {
          searchService.cleanup();
        }
      } catch (error) {
        // Don't fail the close process if search service cleanup fails
        logInfo('Search service cleanup failed during Memori close (non-critical)', {
          component: 'Memori',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Close database manager
      await this.dbManager.close();
    } catch (error) {
      logError('Error during Memori close', {
        component: 'Memori',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getDatabaseManager(): DatabaseManager {
    return this.dbManager;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check for new conscious memories and process them
   * This should be called periodically for ongoing monitoring
   */
  async checkForConsciousContextUpdates(): Promise<void> {
    if (!this.enabled || !this.consciousAgent) {
      return;
    }

    try {
      await this.consciousAgent.check_for_context_updates();
    } catch (error) {
      logError('Error checking for conscious context updates', {
        component: 'Memori',
        namespace: this.config.namespace,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Initialize context from existing conscious memories
   */
  async initializeConsciousContext(): Promise<void> {
    if (!this.enabled || !this.consciousAgent) {
      return;
    }

    try {
      await this.consciousAgent.initialize_existing_conscious_memories();
    } catch (error) {
      logError('Error initializing conscious context', {
        component: 'Memori',
        namespace: this.config.namespace,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Get the ConsciousAgent instance (for advanced usage)
   */
  getConsciousAgent(): ConsciousAgent | undefined {
    return this.consciousAgent;
  }

  /**
   * Check if conscious mode is currently enabled
   */
  isConsciousModeEnabled(): boolean {
    return this.enabled && this.consciousAgent !== undefined;
  }

  /**
   * Check if auto ingestion mode is currently enabled
   */
  isAutoModeEnabled(): boolean {
    return this.enabled && this.config.autoIngest;
  }

  /**
   * Start background monitoring for conscious updates
   */
  private startBackgroundMonitoring(): void {
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
    }

    logInfo(`Starting background monitoring with ${this.backgroundUpdateInterval}ms interval`, {
      component: 'Memori',
      namespace: this.config.namespace,
      intervalMs: this.backgroundUpdateInterval,
    });

    this.backgroundInterval = setInterval(async () => {
      try {
        await this.checkForConsciousContextUpdates();
      } catch (error) {
        logError('Error in background monitoring', {
          component: 'Memori',
          namespace: this.config.namespace,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }, this.backgroundUpdateInterval);
  }

  /**
   * Stop background monitoring
   */
  private stopBackgroundMonitoring(): void {
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = undefined;
      logInfo('Background monitoring stopped', {
        component: 'Memori',
        namespace: this.config.namespace,
      });
    }
  }

  /**
   * Configure background update interval
   */
  setBackgroundUpdateInterval(intervalMs: number): void {
    if (intervalMs <= 0) {
      throw new Error('Background update interval must be positive');
    }

    this.backgroundUpdateInterval = intervalMs;

    // Restart monitoring with new interval if already running
    if (this.enabled && this.config.consciousIngest && this.backgroundInterval) {
      this.stopBackgroundMonitoring();
      this.startBackgroundMonitoring();
    }
  }

  /**
   * Get current background update interval
   */
  getBackgroundUpdateInterval(): number {
    return this.backgroundUpdateInterval;
  }

  /**
   * Check if background monitoring is active
   */
  isBackgroundMonitoringActive(): boolean {
    return this.backgroundInterval !== undefined;
  }

  /**
   * Get the ConsolidationService instance for advanced consolidation operations
   */
  getConsolidationService() {
    return this.dbManager.getConsolidationService();
  }

  /**
    * Store processed memory directly (used by memory manager components)
    */
   async storeProcessedMemory(
     processedMemory: ProcessedLongTermMemory,
     chatId: string,
     namespace?: string,
   ): Promise<string> {
     if (!this.enabled) {
       throw new Error('Memori is not enabled');
     }

     const targetNamespace = namespace || this.config.namespace;

     try {
       // For LLM-generated memories, we need to ensure there's a ChatHistory record
       // or modify the storage to handle cases without chat history
       let actualChatId = chatId;

       // Check if this chatId already exists in ChatHistory
       try {
         const chatHistoryManager = (this.dbManager as any).chatHistoryManager;
         if (chatHistoryManager) {
           const existingChat = await chatHistoryManager.getChatHistory(chatId);
           if (!existingChat) {
             // Create a minimal ChatHistory record for LLM-generated memories
             // This is needed because LongTermMemory has a foreign key to ChatHistory
             await chatHistoryManager.storeChatHistory({
               chatId,
               userInput: processedMemory.content.substring(0, 500) + (processedMemory.content.length > 500 ? '...' : ''), // Truncate for chat history
               aiOutput: 'LLM-generated memory (no original conversation)',
               model: this.config.model || 'unknown',
               sessionId: this.sessionId,
               namespace: targetNamespace || this.config.namespace || 'default',
               metadata: {
                 memoryGenerated: true,
                 memoryId: 'pending',
                 source: 'llm-direct',
               },
             });
           }
         }
       } catch (error) {
         logError('Failed to ensure ChatHistory exists for memory storage', {
           component: 'Memori',
           chatId,
           error: error instanceof Error ? error.message : String(error),
         });
         // Continue with memory storage even if ChatHistory creation fails
       }

       const memoryId = await this.dbManager.storeLongTermMemory(
         processedMemory,
         actualChatId,
         targetNamespace,
       );

      logInfo(`Processed memory stored successfully for chat ${chatId}`, {
        component: 'Memori',
        chatId,
        namespace: targetNamespace,
        classification: processedMemory.classification,
        importance: processedMemory.importance,
      });

      return memoryId;
    } catch (error) {
      logError(`Failed to store processed memory for chat ${chatId}`, {
        component: 'Memori',
        chatId,
        namespace: targetNamespace,
        classification: processedMemory.classification,
        importance: processedMemory.importance,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
    * Consolidate duplicate memories with transaction safety and intelligent data merging
    */
  async findDuplicateMemories(
    content: string,
    options?: {
      similarityThreshold?: number;
      namespace?: string;
      limit?: number;
    },
  ): Promise<MemorySearchResult[]> {
    if (!this.enabled) {
      throw new Error('Memori is not enabled');
    }

    const targetNamespace = options?.namespace || this.config.namespace;
    const threshold = options?.similarityThreshold || 0.7;
    const limit = options?.limit || 20;

    try {
      const duplicateManager = (this.dbManager as any).duplicateManager;
      if (!duplicateManager) {
        throw new Error('DuplicateManager not available');
      }

      const duplicates = await duplicateManager.findPotentialDuplicates(
        content,
        targetNamespace,
        threshold,
      );

      // Apply limit if specified
      const limitedResults = limit > 0 ? duplicates.slice(0, limit) : duplicates;

      logInfo(`Found ${limitedResults.length} potential duplicate memories`, {
        component: 'Memori',
        contentLength: content.length,
        namespace: targetNamespace,
        threshold,
        limit,
        duplicatesFound: limitedResults.length,
      });

      return limitedResults;

    } catch (error) {
      logError('Failed to find duplicate memories', {
        component: 'Memori',
        contentLength: content.length,
        namespace: targetNamespace,
        threshold,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }


  /**
   * Get comprehensive health report for the search index
   */
  async getIndexHealthReport(): Promise<import('./domain/search/SearchIndexManager').IndexHealthReport> {
    if (!this.enabled) {
      throw new Error('Memori is not enabled');
    }

    try {
      const searchIndexManager = this.dbManager.getSearchIndexManager();
      const report = await searchIndexManager.getIndexHealthReport();

      logInfo('Retrieved index health report', {
        component: 'Memori',
        health: report.health,
        issues: report.issues.length,
        recommendations: report.recommendations.length,
      });

      return report;
    } catch (error) {
      logError('Failed to get index health report', {
        component: 'Memori',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Perform index optimization with specified strategy
   */
  async optimizeIndex(type?: import('./domain/search/SearchIndexManager').OptimizationType): Promise<import('./domain/search/SearchIndexManager').OptimizationResult> {
    if (!this.enabled) {
      throw new Error('Memori is not enabled');
    }

    try {
      const searchIndexManager = this.dbManager.getSearchIndexManager();
      const result = await searchIndexManager.optimizeIndex(type);

      logInfo('Index optimization completed', {
        component: 'Memori',
        optimizationType: result.optimizationType,
        duration: result.duration,
        spaceSaved: result.spaceSaved,
        performanceImprovement: result.performanceImprovement,
      });

      return result;
    } catch (error) {
      logError('Failed to optimize index', {
        component: 'Memori',
        optimizationType: type,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Create a backup of the current search index
   */
  async createIndexBackup(): Promise<import('./domain/search/SearchIndexManager').BackupMetadata> {
    if (!this.enabled) {
      throw new Error('Memori is not enabled');
    }

    try {
      const searchIndexManager = this.dbManager.getSearchIndexManager();
      const backup = await searchIndexManager.createBackup();

      logInfo('Index backup created', {
        component: 'Memori',
        timestamp: backup.timestamp,
        documentCount: backup.documentCount,
        indexSize: backup.indexSize,
      });

      return backup;
    } catch (error) {
      logError('Failed to create index backup', {
        component: 'Memori',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get comprehensive memory statistics for the current namespace
   */
  async getMemoryStatistics(namespace?: string): Promise<DatabaseStats> {
    if (!this.enabled) {
      throw new Error('Memori is not enabled');
    }

    const targetNamespace = namespace || this.config.namespace;

    try {
      const statisticsManager = (this.dbManager as any).statisticsManager;
      if (!statisticsManager) {
        throw new Error('StatisticsManager not available');
      }

      const stats = await statisticsManager.getDatabaseStats(targetNamespace);

      logInfo('Retrieved memory statistics', {
        component: 'Memori',
        namespace: targetNamespace,
        totalConversations: stats.totalConversations,
        totalMemories: stats.totalMemories,
        shortTermMemories: stats.shortTermMemories,
        longTermMemories: stats.longTermMemories,
        consciousMemories: stats.consciousMemories,
      });

      return stats;

    } catch (error) {
      logError('Failed to retrieve memory statistics', {
        component: 'Memori',
        namespace: targetNamespace,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get detailed memory statistics with breakdowns by type, importance, and category
   */
  async getDetailedMemoryStatistics(namespace?: string): Promise<{
    totalMemories: number;
    byType: {
      longTerm: number;
      shortTerm: number;
      conscious: number;
    };
    byImportance: Record<string, number>;
    byCategory: Record<string, number>;
    recentActivity: {
      last24Hours: number;
      last7Days: number;
      last30Days: number;
    };
    averageConfidence: number;
  }> {
    if (!this.enabled) {
      throw new Error('Memori is not enabled');
    }

    const targetNamespace = namespace || this.config.namespace;

    try {
      const statisticsManager = (this.dbManager as any).statisticsManager;
      if (!statisticsManager) {
        throw new Error('StatisticsManager not available');
      }

      const detailedStats = await statisticsManager.getDetailedMemoryStats(targetNamespace);

      logInfo('Retrieved detailed memory statistics', {
        component: 'Memori',
        namespace: targetNamespace,
        totalMemories: detailedStats.totalMemories,
        longTermMemories: detailedStats.byType.longTerm,
        shortTermMemories: detailedStats.byType.shortTerm,
        consciousMemories: detailedStats.byType.conscious,
        averageConfidence: detailedStats.averageConfidence,
      });

      return detailedStats;

    } catch (error) {
      logError('Failed to retrieve detailed memory statistics', {
        component: 'Memori',
        namespace: targetNamespace,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Extract memory relationships using the sophisticated RelationshipProcessor
   */
  async extractMemoryRelationships(
    content: string,
    options?: {
      namespace?: string;
      minConfidence?: number;
      maxRelationships?: number;
    },
  ): Promise<MemoryRelationship[]> {
    if (!this.enabled) {
      throw new Error('Memori is not enabled');
    }

    const targetNamespace = options?.namespace || this.config.namespace;
    const minConfidence = options?.minConfidence || 0.5;
    const maxRelationships = options?.maxRelationships || 10;

    try {
      // Get the RelationshipProcessor from the database manager
      const relationshipProcessor = (this.dbManager as any).relationshipProcessor;
      if (!relationshipProcessor) {
        throw new Error('RelationshipProcessor not available - ensure LLM provider is configured');
      }

      const relationships = await relationshipProcessor.extractRelationships(content, {
        namespace: targetNamespace,
        minConfidence,
        maxRelationships,
      });

      logInfo('Extracted memory relationships', {
        component: 'Memori',
        namespace: targetNamespace,
        contentLength: content.length,
        relationshipsFound: relationships.length,
        minConfidence,
        maxRelationships,
      });

      return relationships;

    } catch (error) {
      logError('Failed to extract memory relationships', {
        component: 'Memori',
        namespace: targetNamespace,
        contentLength: content.length,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Build relationship graph for a namespace
   */
  async buildRelationshipGraph(
    namespace?: string,
    options?: {
      maxDepth?: number;
      includeWeakRelationships?: boolean;
    },
  ): Promise<{
    nodes: Array<{ id: string; type: string; content: string }>;
    edges: Array<{ source: string; target: string; type: string; strength: number }>;
    clusters: Array<{ id: string; nodes: string[]; strength: number }>;
  }> {
    if (!this.enabled) {
      throw new Error('Memori is not enabled');
    }

    const targetNamespace = namespace || this.config.namespace;
    const maxDepth = options?.maxDepth || 3;
    const includeWeakRelationships = options?.includeWeakRelationships || false;

    try {
      const relationshipProcessor = (this.dbManager as any).relationshipProcessor;
      if (!relationshipProcessor) {
        throw new Error('RelationshipProcessor not available - ensure LLM provider is configured');
      }

      const graph = await relationshipProcessor.buildRelationshipGraph(targetNamespace, {
        maxDepth,
        includeWeakRelationships,
      });

      logInfo('Built relationship graph', {
        component: 'Memori',
        namespace: targetNamespace,
        nodesCount: graph.nodes.length,
        edgesCount: graph.edges.length,
        clustersCount: graph.clusters.length,
        maxDepth,
        includeWeakRelationships,
      });

      return graph;

    } catch (error) {
      logError('Failed to build relationship graph', {
        component: 'Memori',
        namespace: targetNamespace,
        maxDepth,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Restore search index from a backup
   */
  async restoreIndexFromBackup(backupId: string): Promise<boolean> {
    if (!this.enabled) {
      throw new Error('Memori is not enabled');
    }

    try {
      const searchIndexManager = this.dbManager.getSearchIndexManager();
      const success = await searchIndexManager.restoreFromBackup(backupId);

      logInfo('Index backup restore completed', {
        component: 'Memori',
        backupId,
        success,
      });

      return success;
    } catch (error) {
      logError('Failed to restore index from backup', {
        component: 'Memori',
        backupId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
