/**
 * MemoriAI - Clean User API for Memory-Enabled LLM Operations
 *
 * Streamlined implementation with minimal overlap and maximum flexibility.
 * Provides simple user-facing API while delegating to optimized services.
 *
 * Design Features:
 * - Clean user API (chat, search, embeddings)
 * - Flexible provider configuration for different operations
 * - Simple delegation to optimized Memori class
 * - Minimal complexity, maximum flexibility
 */

import { v4 as uuidv4 } from 'uuid';
import { ProviderType } from './infrastructure/providers/ProviderType';
import { IProviderConfig } from './infrastructure/providers/IProviderConfig';
import { ILLMProvider, MemoryCapableProvider, ProviderInitializationOptions } from './infrastructure/providers/';
import { Memori } from './Memori';
import { logInfo, logError } from './infrastructure/config/Logger';
import { MemoryImportanceLevel, MemoryClassification } from './types/schemas';

// Import streamlined configuration types
import {
  MemoriAIConfig,
  ChatParams,
  ChatResponse,
  SearchOptions,
  MemorySearchResult,
  EmbeddingParams,
  EmbeddingResponse
} from './MemoriAIConfig';

/**
 * Clean MemoriAI class with minimal overlap and maximum flexibility
 */
export class MemoriAI {
  private userProvider: ILLMProvider;
  private memori: Memori;
  private mode: 'automatic' | 'manual' | 'conscious';
  private sessionId: string;
  private config: MemoriAIConfig;
  private providerType: ProviderType;

  constructor(config: MemoriAIConfig) {
    this.sessionId = uuidv4();
    this.mode = config.mode || 'automatic';
    this.config = config;

    // Detect and store provider type
    this.providerType = this.detectProvider(config);

    // Create user provider for chat operations
    this.userProvider = this.createUserProvider(config);

    // Create optimized Memori instance for memory operations
    const memoriConfig: any = {
      databaseUrl: config.databaseUrl,
      apiKey: config.apiKey,
      model: config.model || 'gpt-4o-mini', // Provide default model if not specified
      baseUrl: config.baseUrl,
      namespace: config.namespace,
      mode: this.mode, // Use the mode property from MemoriAIConfig
    };

    // Handle memory provider configuration
    if (config.memoryProvider) {
      if (typeof config.memoryProvider === 'string') {
        memoriConfig.provider = config.memoryProvider;
      } else if (typeof config.memoryProvider === 'object') {
        // If memoryProvider is an object, extract the provider type
        memoriConfig.provider = config.memoryProvider.provider || 'openai';
        memoriConfig.apiKey = config.memoryProvider.apiKey;
        memoriConfig.model = config.memoryProvider.model;
        memoriConfig.baseUrl = config.memoryProvider.baseUrl;
      }
    } else {
      // Default to OpenAI if no memory provider specified
      memoriConfig.provider = 'openai';
    }

    this.memori = new Memori(memoriConfig);

    logInfo('MemoriAI constructor started', {
      component: 'MemoriAI',
      sessionId: this.sessionId,
      providerType: this.providerType,
      databaseUrl: config.databaseUrl,
      model: config.model || 'gpt-4o-mini',
      namespace: config.namespace,
    });
  }

  /**
   * Clean chat API with automatic memory recording
   */
  async chat(params: ChatParams): Promise<ChatResponse> {
    try {
      // Use user provider for chat operations
      const response = await this.userProvider.createChatCompletion({
        messages: params.messages,
        model: params.model,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        stream: params.stream,
        options: params.options,
      });

      // Record conversation in Memori if automatic mode
      if (this.mode === 'automatic') {
        // Enable Memori if not already enabled
        try {
          await this.memori.enable();
        } catch (error) {
          // Memori might already be enabled, ignore the error
        }

        // Use the correct method to record conversation
        await this.memori.recordConversation(
          params.messages[0].content || 'User message',
          response.message.content || 'AI response'
        );
      }

      // Convert response to unified format
      return {
        message: response.message,
        finishReason: response.finish_reason || 'stop',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        id: response.id,
        model: response.model,
        created: response.created,
      };

    } catch (error) {
      logError('Chat completion failed', {
        component: 'MemoriAI',
        sessionId: this.sessionId,
        providerType: this.providerType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Unified memory search API - works across all providers
   */
  async searchMemories(query: string, options: SearchOptions = {}): Promise<MemorySearchResult[]> {
    try {
      // Convert simplified options to internal format
      const convertedOptions = this.convertSearchOptions(options);
      return await this.memori.searchMemories(query, convertedOptions);
    } catch (error) {
      this.logOperationError('Memory search', error, { query });
      throw error;
    }
  }

  /**
   * Unified embeddings API - works with any provider internally
   */
  async createEmbeddings(params: EmbeddingParams): Promise<EmbeddingResponse> {
    try {
      // Use user provider for embeddings
      const response = await this.userProvider.createEmbedding({
        input: params.input,
        model: params.model,
        encoding_format: params.encodingFormat,
        dimensions: params.dimensions,
        user: params.user,
      });

      return {
        embeddings: response.data.map(d => d.embedding),
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        model: response.model,
        id: response.id || `embedding_${Date.now()}`,
        created: response.created || Date.now(),
      };

    } catch (error) {
      logError('Embedding creation failed', {
        component: 'MemoriAI',
        sessionId: this.sessionId,
        providerType: this.providerType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Unified close API - cleans up all resources
   */
  async close(): Promise<void> {
    try {
      // Close user provider if initialized
      if (this.userProvider) {
        await this.userProvider.dispose();
      }

      // Close Memori instance
      await this.memori.close();

      logInfo('MemoriAI closed successfully', {
        component: 'MemoriAI',
        sessionId: this.sessionId,
        mode: this.mode,
      });

    } catch (error) {
      logError('Error during MemoriAI close', {
        component: 'MemoriAI',
        sessionId: this.sessionId,
        mode: this.mode,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get current operating mode
   */
  getMode(): 'automatic' | 'manual' | 'conscious' {
    return this.mode;
  }

  /**
   * Manual conversation recording (for manual/conscious modes)
   */
  async recordConversation(
    userInput: string,
    aiOutput: string,
    options?: {
      model?: string;
      metadata?: Record<string, any>;
      namespace?: string;
    }
  ): Promise<string> {
    if (this.mode === 'automatic') {
      throw new Error('recordConversation() only available in manual/conscious modes. Use chat() for automatic mode.');
    }

    const chatId = uuidv4();

    try {
      await this.memori.recordConversation(userInput, aiOutput, options);

      logInfo(`Conversation recorded manually: ${chatId}`, {
        component: 'MemoriAI',
        sessionId: this.sessionId,
        mode: this.mode,
        chatId,
      });

      return chatId;
    } catch (error) {
      logError('Failed to record conversation manually', {
        component: 'MemoriAI',
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get comprehensive memory statistics for the current namespace
   */
  async getMemoryStatistics(namespace?: string) {
    return this.memori.getMemoryStatistics(namespace);
  }

  /**
   * Search memories with specific strategy (advanced search)
   */
  async searchMemoriesWithStrategy(
    query: string,
    strategy: any,
    options: SearchOptions = {}
  ): Promise<MemorySearchResult[]> {
    // Convert simplified options to internal format
    const convertedOptions = this.convertSearchOptions(options);
    return this.memori.searchMemoriesWithStrategy(query, strategy, convertedOptions);
  }

  /**
   * Get available search strategies
   */
  async getAvailableSearchStrategies() {
    return this.memori.getAvailableSearchStrategies();
  }

  /**
   * Smart provider auto-detection from minimal configuration
   */
  private detectProvider(config: MemoriAIConfig): ProviderType {
    // Check explicit provider field first (highest priority)
    if (config.provider === 'anthropic') return ProviderType.ANTHROPIC;
    if (config.provider === 'openai') return ProviderType.OPENAI;
    if (config.provider === 'ollama') return ProviderType.OLLAMA;

    // Then check API key patterns
    if (config.apiKey?.startsWith('sk-ant-')) return ProviderType.ANTHROPIC;
    if (config.apiKey?.startsWith('sk-') && config.apiKey.length > 20) return ProviderType.OPENAI;
    if (config.apiKey === 'ollama-local') return ProviderType.OLLAMA;

    // Default to OpenAI
    return ProviderType.OPENAI;
  }

  /**
   * Convert simple user config to complex internal config with mode optimization
   */
  private simplifyConfiguration(userConfig: MemoriAIConfig): IProviderConfig {
    // Get smart defaults for the detected provider
    const providerDefaults = this.getProviderDefaults(this.detectProvider(userConfig));

    // Generate session ID if not provided
    const sessionId = userConfig.namespace || `memoriai_${Date.now()}`;

    // Optimize configuration based on mode
    const { performanceConfig, memoryConfig } = this.getOptimizedConfigs(userConfig.mode || 'automatic', sessionId);

    return {
      apiKey: userConfig.apiKey || this.getDefaultApiKey(this.detectProvider(userConfig)),
      model: userConfig.model || providerDefaults.defaultModel,
      baseUrl: userConfig.baseUrl || providerDefaults.baseUrl,

      features: {
        performance: performanceConfig,
        memory: memoryConfig
      }
    };
  }

  /**
   * Get optimized configurations based on operating mode
   */
  private getOptimizedConfigs(mode: 'automatic' | 'manual' | 'conscious', sessionId: string) {
    const basePerformanceConfig = {
      enableHealthMonitoring: true, // Always enable health monitoring
      enableConnectionPooling: true,
      enableCaching: true,
    };

    const baseMemoryConfig = {
      sessionId,
      enableEmbeddingMemory: false,
      minImportanceLevel: 'all' as const,
    };

    switch (mode) {
      case 'automatic':
        return {
          performanceConfig: {
            ...basePerformanceConfig,
            // High performance for automatic mode
            enableConnectionPooling: true,
            enableCaching: true,
          },
          memoryConfig: {
            ...baseMemoryConfig,
            enableChatMemory: true,
            memoryProcessingMode: 'auto' as const,
          }
        };

      case 'manual':
        return {
          performanceConfig: {
            ...basePerformanceConfig,
            // Moderate performance for manual mode
            enableConnectionPooling: false,
            enableCaching: false,
          },
          memoryConfig: {
            ...baseMemoryConfig,
            enableChatMemory: false, // Manual control
            memoryProcessingMode: 'none' as const, // Manual control - no auto processing
          }
        };

      case 'conscious':
        return {
          performanceConfig: {
            ...basePerformanceConfig,
            // Balanced performance for conscious mode
            enableConnectionPooling: true,
            enableCaching: true,
          },
          memoryConfig: {
            ...baseMemoryConfig,
            enableChatMemory: false, // Conscious control
            memoryProcessingMode: 'conscious' as const,
          }
        };

      default:
        return {
          performanceConfig: basePerformanceConfig,
          memoryConfig: baseMemoryConfig
        };
    }
  }

  /**
   * Get default configuration for each provider type
   */
  private getProviderDefaults(providerType: ProviderType) {
    const defaults = {
      [ProviderType.OPENAI]: {
        type: ProviderType.OPENAI,
        name: 'OpenAI',
        defaultModel: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com/v1',
      },
      [ProviderType.ANTHROPIC]: {
        type: ProviderType.ANTHROPIC,
        name: 'Anthropic',
        defaultModel: 'claude-3-5-sonnet-20241022',
        baseUrl: 'https://api.anthropic.com',
      },
      [ProviderType.OLLAMA]: {
        type: ProviderType.OLLAMA,
        name: 'Ollama',
        defaultModel: 'llama2',
        baseUrl: 'http://localhost:11434',
      },
    };

    return defaults[providerType];
  }

  /**
   * Get default API key for provider (from environment)
   */
  private getDefaultApiKey(providerType: ProviderType): string {
    const envVars = {
      [ProviderType.OPENAI]: 'OPENAI_API_KEY',
      [ProviderType.ANTHROPIC]: 'ANTHROPIC_API_KEY',
      [ProviderType.OLLAMA]: 'ollama-local', // Special case for Ollama
    };

    const envKey = envVars[providerType];
    return process.env[envKey] || `${providerType}-dummy-key`;
  }

  /**
   * Build Memori configuration from simple config with mode support
   */
  private buildMemoriConfig(userConfig: MemoriAIConfig) {
    return {
      databaseUrl: userConfig.databaseUrl,
      apiKey: userConfig.apiKey,
      model: userConfig.model || this.getDefaultModel(),
      namespace: userConfig.namespace,
      mode: userConfig.mode || 'automatic', // Pass the mode to Memori
    };
  }

  /**
   * Get default model for current provider
   */
  private getDefaultModel(): string {
    return this.getProviderDefaults(ProviderType.OPENAI).defaultModel;
  }

  /**
   * Create user provider for chat operations
   */
  private createUserProvider(config: MemoriAIConfig): ILLMProvider {
    const providerType = this.detectProvider(config);
    const ProviderClass = this.getProviderClass(providerType);
    const providerConfig = this.simplifyConfiguration(config);

    const provider = new ProviderClass(providerConfig) as MemoryCapableProvider;
    const initializationOptions: ProviderInitializationOptions = {
      memory: {
        sessionId: this.sessionId,
        namespace: config.namespace || 'default',
      },
    };

    provider.initialize(providerConfig, initializationOptions).catch(error => {
      logError('Failed to initialize user provider', {
        component: 'MemoriAI',
        providerType,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return provider;
  }

  /**
   * Build provider configuration for memory operations
   */
  private buildProviderConfig(config: MemoriAIConfig): IProviderConfig {
    return this.simplifyConfiguration(config);
  }

  /**
   * Get the provider class for the given provider type
   */
  private getProviderClass(providerType: ProviderType): new (config: IProviderConfig) => MemoryCapableProvider {
    // Import provider classes dynamically to avoid circular imports
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

  /**
   * Create consistent error logging for all operations
   */
  private logOperationError(operation: string, error: unknown, extraContext?: Record<string, any>): void {
    logError(`${operation} failed`, {
      component: 'MemoriAI',
      sessionId: this.sessionId,
      mode: this.mode,
      providerType: this.providerType,
      error: error instanceof Error ? error.message : String(error),
      ...extraContext,
    });
  }

  /**
   * Convert simplified search options to internal format
   */
  private convertSearchOptions(options: SearchOptions) {
    return {
      namespace: options.namespace,
      limit: options.limit,
      includeMetadata: options.includeMetadata,
      minImportance: options.minImportance ? this.mapImportanceLevel(options.minImportance) : undefined,
      categories: options.categories ? options.categories as any : undefined,
      sortBy: options.sortBy,
      offset: options.offset,
    };
  }

  /**
   * Map string importance level to enum value
   */
  private mapImportanceLevel(level: 'low' | 'medium' | 'high' | 'critical'): MemoryImportanceLevel {
    switch (level) {
      case 'low': return MemoryImportanceLevel.LOW;
      case 'medium': return MemoryImportanceLevel.MEDIUM;
      case 'high': return MemoryImportanceLevel.HIGH;
      case 'critical': return MemoryImportanceLevel.CRITICAL;
      default: return MemoryImportanceLevel.MEDIUM;
    }
  }

  /**
   * Map string categories to enum values
   */
  private mapCategories(categories: string[]): MemoryClassification[] {
    return categories.map(cat => {
      // Check if it's already a valid enum value
      if (Object.values(MemoryClassification).includes(cat as MemoryClassification)) {
        return cat as MemoryClassification;
      }

      // Otherwise map from string
      switch (cat.toLowerCase()) {
        case 'essential': return MemoryClassification.ESSENTIAL;
        case 'contextual': return MemoryClassification.CONTEXTUAL;
        case 'conversational': return MemoryClassification.CONVERSATIONAL;
        case 'reference': return MemoryClassification.REFERENCE;
        case 'personal': return MemoryClassification.PERSONAL;
        case 'conscious-info': return MemoryClassification.CONSCIOUS_INFO;
        case 'important': return MemoryClassification.ESSENTIAL; // Map "IMPORTANT" to ESSENTIAL
        default: return MemoryClassification.CONVERSATIONAL;
      }
    });
  }

  /**
   * Get the provider type (for backward compatibility)
   */
  getProviderType(): ProviderType {
    return this.providerType;
  }
}
