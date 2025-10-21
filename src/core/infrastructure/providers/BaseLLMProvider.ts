import { ILLMProvider, ProviderInitializationOptions } from './ILLMProvider';
import {
  IProviderConfig,
  PerformanceConfig,
  extractPerformanceConfig,
} from './IProviderConfig';
import { ProviderType } from './ProviderType';
import { ChatCompletionParams } from './types/ChatCompletionParams';
import { ChatCompletionResponse } from './types/ChatCompletionResponse';
import { EmbeddingParams } from './types/EmbeddingParams';
import { EmbeddingResponse } from './types/EmbeddingResponse';
import { ProviderDiagnostics } from './types/ProviderDiagnostics';
import { ConnectionPool, globalConnectionPool } from './performance/ConnectionPool';
import { HealthMonitor, globalHealthMonitor } from './performance/HealthMonitor';
import { RequestCache, globalRequestCache } from './performance/RequestCache';
import { logError, logInfo } from '../config/Logger';

/**
 * Base provider implementation that centralizes configuration, performance tooling
 * (caching, health monitoring, connection pooling) and telemetry hooks.
 * Concrete providers only need to implement initialization and core LLM calls.
 */
export abstract class BaseLLMProvider implements ILLMProvider {
  protected config: IProviderConfig;
  protected performanceConfig: PerformanceConfig;
  protected isInitialized = false;

  protected connectionPool?: ConnectionPool;
  protected requestCache?: RequestCache;
  protected healthMonitor?: HealthMonitor;

  protected metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageResponseTime: 0,
  };

  constructor(config: IProviderConfig) {
    this.config = { ...config };
    this.performanceConfig = extractPerformanceConfig(config);
    this.initializePerformanceComponents();
  }

  /**
   * Provider type implemented by subclasses.
   */
  abstract getProviderType(): ProviderType;

  /**
   * Current model identifier.
   */
  abstract getModel(): string;

  /**
   * Expose raw client for compatibility layers.
   */
  abstract getClient(): any;

  /**
   * Initialize the underlying SDK/client.
   */
  protected abstract initializeClient(): void;

  /**
   * Dispose of the underlying SDK/client.
   */
  protected abstract disposeClient(): Promise<void>;

  /**
   * Execute the provider-specific chat completion call.
   */
  protected abstract executeChatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResponse>;

  /**
   * Execute the provider-specific embedding call.
   */
  protected abstract executeEmbedding(
    params: EmbeddingParams
  ): Promise<EmbeddingResponse>;

  /**
   * Check the health of the underlying SDK/client.
   */
  protected abstract checkClientHealth(): Promise<boolean>;

  /**
   * Provider specific diagnostics payload merged into the base diagnostic response.
   */
  protected abstract getBaseDiagnostics(): Promise<Record<string, unknown>>;

  async initialize(config: IProviderConfig, _options?: ProviderInitializationOptions): Promise<void> {
    this.config = { ...config };
    this.performanceConfig = extractPerformanceConfig(config);
    this.initializePerformanceComponents();
    this.initializeClient();
    this.isInitialized = true;

    logInfo('Provider initialized', {
      component: 'BaseLLMProvider',
      providerType: this.getProviderType(),
      cachingEnabled: this.performanceConfig.enableCaching,
      poolingEnabled: this.performanceConfig.enableConnectionPooling,
      healthMonitoringEnabled: this.performanceConfig.enableHealthMonitoring,
    });
  }

  async dispose(): Promise<void> {
    await this.disposeClient();
    this.isInitialized = false;

    logInfo('Provider disposed', {
      component: 'BaseLLMProvider',
      providerType: this.getProviderType(),
    });
  }

  getConfig(): IProviderConfig {
    return { ...this.config };
  }

  async isHealthy(): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }
    try {
      return await this.checkClientHealth();
    } catch (error) {
      logError('Provider health check failed', {
        component: 'BaseLLMProvider',
        providerType: this.getProviderType(),
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async getDiagnostics(): Promise<ProviderDiagnostics> {
    const baseDiagnostics = await this.getBaseDiagnostics();

    return {
      providerType: this.getProviderType(),
      isInitialized: this.isInitialized,
      isHealthy: await this.isHealthy(),
      model: this.getModel(),
      metadata: {
        metrics: this.metrics,
        performanceConfig: this.performanceConfig,
        ...baseDiagnostics,
      },
      timestamp: new Date(),
    };
  }

  async createChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    this.ensureInitialized();

    await this.beforeChatCompletion(params);

    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      const cachedResponse = this.getCachedChat(params);
      if (cachedResponse) {
        this.metrics.cacheHits++;
        this.recordHealthMetrics(true, Date.now() - startTime);
        await this.afterChatCompletion(params, cachedResponse);
        return cachedResponse;
      }
      if (this.performanceConfig.enableCaching) {
        this.metrics.cacheMisses++;
      }

      const response = await this.executeChatCompletion(params);
      const responseTime = Date.now() - startTime;

      this.setCachedChat(params, response);
      this.recordHealthMetrics(true, responseTime);

      await this.afterChatCompletion(params, response);

      this.logChatCompletion(responseTime, false, params.model);
      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordHealthMetrics(false, responseTime, error instanceof Error ? error.message : String(error));

      logError('Chat completion failed', {
        component: 'BaseLLMProvider',
        providerType: this.getProviderType(),
        responseTime,
        model: params.model || this.getModel(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async createEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse> {
    this.ensureInitialized();

    await this.beforeEmbedding(params);

    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      const cachedResponse = this.getCachedEmbedding(params);
      if (cachedResponse) {
        this.metrics.cacheHits++;
        this.recordHealthMetrics(true, Date.now() - startTime);
        await this.afterEmbedding(params, cachedResponse);
        return cachedResponse;
      }
      if (this.performanceConfig.enableCaching) {
        this.metrics.cacheMisses++;
      }

      const response = await this.executeEmbedding(params);
      const responseTime = Date.now() - startTime;

      this.setCachedEmbedding(params, response);
      this.recordHealthMetrics(true, responseTime);

      await this.afterEmbedding(params, response);

      this.logEmbedding(responseTime, false, params.model);
      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordHealthMetrics(false, responseTime, error instanceof Error ? error.message : String(error));

      logError('Embedding request failed', {
        component: 'BaseLLMProvider',
        providerType: this.getProviderType(),
        responseTime,
        model: params.model,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Hooks for subclasses to inject logic around chat execution.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async beforeChatCompletion(params: ChatCompletionParams): Promise<void> {
    // No-op by default
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async afterChatCompletion(
    params: ChatCompletionParams,
    response: ChatCompletionResponse
  ): Promise<void> {
    // No-op by default
  }

  /**
   * Hooks for subclasses to inject logic around embedding execution.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async beforeEmbedding(params: EmbeddingParams): Promise<void> {
    // No-op by default
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async afterEmbedding(
    params: EmbeddingParams,
    response: EmbeddingResponse
  ): Promise<void> {
    // No-op by default
  }

  /**
   * Reconfigure performance helpers based on the current configuration.
   */
  protected initializePerformanceComponents(): void {
    if (this.performanceConfig.enableConnectionPooling) {
      this.connectionPool = this.shouldCreateDedicatedPool()
        ? new ConnectionPool({
            maxConnections: this.performanceConfig.connectionPool.maxConnections,
            maxIdleTime: this.performanceConfig.connectionPool.idleTimeout,
            connectionTimeout: this.performanceConfig.connectionPool.acquireTimeout,
            healthCheckInterval: this.performanceConfig.healthMonitor.checkInterval,
          })
        : globalConnectionPool;
    } else {
      this.connectionPool = undefined;
    }

    if (this.performanceConfig.enableCaching) {
      this.requestCache = this.shouldCreateDedicatedCache()
        ? new RequestCache({
            defaultTTL: this.performanceConfig.cacheTTL.chat,
            maxTTL: Math.max(
              this.performanceConfig.cacheTTL.chat,
              this.performanceConfig.cacheTTL.embedding
            ),
          })
        : globalRequestCache;
    } else {
      this.requestCache = undefined;
    }

    if (this.performanceConfig.enableHealthMonitoring) {
      this.healthMonitor = this.shouldCreateDedicatedHealthMonitor()
        ? new HealthMonitor({
            checkInterval: this.performanceConfig.healthMonitor.checkInterval,
            failureThreshold: this.performanceConfig.healthMonitor.failureThreshold,
            successThreshold: this.performanceConfig.healthMonitor.successRateThreshold,
          })
        : globalHealthMonitor;
    } else {
      this.healthMonitor = undefined;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(`${this.getProviderType()} provider not initialized`);
    }
  }

  private getCachedChat(params: ChatCompletionParams): ChatCompletionResponse | null {
    if (!this.performanceConfig.enableCaching || !this.requestCache) {
      return null;
    }
    return this.requestCache.getChatCompletion(params);
  }

  private setCachedChat(
    params: ChatCompletionParams,
    response: ChatCompletionResponse
  ): void {
    if (!this.performanceConfig.enableCaching || !this.requestCache) {
      return;
    }
    this.requestCache.setChatCompletion(params, response, this.performanceConfig.cacheTTL.chat);
  }

  private getCachedEmbedding(params: EmbeddingParams): EmbeddingResponse | null {
    if (!this.performanceConfig.enableCaching || !this.requestCache) {
      return null;
    }
    return this.requestCache.getEmbedding(params);
  }

  private setCachedEmbedding(
    params: EmbeddingParams,
    response: EmbeddingResponse
  ): void {
    if (!this.performanceConfig.enableCaching || !this.requestCache) {
      return;
    }
    this.requestCache.setEmbedding(params, response, this.performanceConfig.cacheTTL.embedding);
  }

  private recordHealthMetrics(
    success: boolean,
    responseTime: number,
    errorMessage?: string
  ): void {
    const totalRequests = this.metrics.totalRequests;
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests;

    if (this.healthMonitor) {
      this.healthMonitor.recordRequestResult(
        this,
        success,
        responseTime,
        errorMessage
      );
    }
  }

  private logChatCompletion(responseTime: number, cached: boolean, model?: string): void {
    if (this.metrics.totalRequests % 10 !== 0) {
      return;
    }

    logInfo('Chat completion completed', {
      component: 'BaseLLMProvider',
      providerType: this.getProviderType(),
      responseTime,
      cached,
      model: model || this.getModel(),
      totalRequests: this.metrics.totalRequests,
    });
  }

  private logEmbedding(responseTime: number, cached: boolean, model?: string): void {
    if (this.metrics.totalRequests % 10 !== 0) {
      return;
    }

    logInfo('Embedding completed', {
      component: 'BaseLLMProvider',
      providerType: this.getProviderType(),
      responseTime,
      cached,
      model: model || this.getModel(),
      totalRequests: this.metrics.totalRequests,
    });
  }

  private shouldCreateDedicatedPool(): boolean {
    return (
      this.performanceConfig.connectionPool.maxConnections !== 10 ||
      this.performanceConfig.connectionPool.idleTimeout !== 30000 ||
      this.performanceConfig.connectionPool.acquireTimeout !== 5000
    );
  }

  private shouldCreateDedicatedCache(): boolean {
    return (
      this.performanceConfig.cacheTTL.chat !== 300000 ||
      this.performanceConfig.cacheTTL.embedding !== 3600000
    );
  }

  private shouldCreateDedicatedHealthMonitor(): boolean {
    return (
      this.performanceConfig.healthMonitor.checkInterval !== 60000 ||
      this.performanceConfig.healthMonitor.failureThreshold !== 3 ||
      this.performanceConfig.healthMonitor.successRateThreshold !== 0.95
    );
  }
}
