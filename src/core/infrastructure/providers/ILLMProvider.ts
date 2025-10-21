import { ProviderType } from './ProviderType';
import { IProviderConfig } from './IProviderConfig';
import { ChatCompletionParams } from './types/ChatCompletionParams';
import { ChatCompletionResponse } from './types/ChatCompletionResponse';
import { EmbeddingParams } from './types/EmbeddingParams';
import { EmbeddingResponse } from './types/EmbeddingResponse';
import { ProviderDiagnostics } from './types/ProviderDiagnostics';
import type { DatabaseManager } from '../database/DatabaseManager';
import type { MemoryAgent } from '../../domain/memory/MemoryAgent';

/**
 * Optional memory-related context that can be supplied when initializing a provider.
 * Allows callers (e.g. Memori) to share infrastructure objects instead of letting
 * the provider create its own instances.
 */
export interface ProviderMemoryContext {
  databaseManager?: DatabaseManager;
  memoryAgent?: MemoryAgent;
  sessionId?: string;
  namespace?: string;
}

export interface ProviderInitializationOptions {
  memory?: ProviderMemoryContext;
  disableMemoryProcessing?: boolean;
}

/**
 * Core interface for LLM providers
 * Defines the contract that all LLM providers must implement
 */
export interface ILLMProvider {
  /**
   * Get the provider type
   */
  getProviderType(): ProviderType;

  /**
   * Get the provider configuration
   */
  getConfig(): IProviderConfig;

  /**
   * Initialize the provider.
   */
  initialize(config: IProviderConfig, options?: ProviderInitializationOptions): Promise<void>;

  /**
   * Dispose of the provider and clean up resources
   */
  dispose(): Promise<void>;

  /**
   * Check if the provider is healthy and ready to handle requests
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get diagnostic information about the provider
   */
  getDiagnostics(): Promise<ProviderDiagnostics>;

  /**
   * Get the current model being used
   */
  getModel(): string;

  /**
   * Create a chat completion
   * @param params Chat completion parameters
   * @returns Chat completion response
   */
  createChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse>;

  /**
   * Create embeddings for the given input
   * @param params Embedding parameters
   * @returns Embedding response
   */
  createEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse>;

  /**
   * Get the underlying provider client (for backward compatibility)
   * @deprecated Use specific methods instead of accessing the client directly
   */
  getClient(): any;
}
