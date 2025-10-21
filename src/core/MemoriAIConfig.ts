/**
 * MemoriAI configuration types and interfaces
 *
 * This file contains the configuration types for the MemoriAI class,
 * providing a clean interface that leverages sophisticated infrastructure.
 */

import { ProviderType } from '../core/infrastructure/providers/ProviderType';
import { ChatMessage } from '../core/infrastructure/providers/types/ChatCompletionParams';
import { IProviderConfig } from './infrastructure/providers/IProviderConfig';

/**
 * Clean MemoriAI configuration interface
 *
 * Simple, intuitive configuration that supports both basic and advanced use cases.
 * Leverages existing IProviderConfig sophistication when needed.
 */
export interface MemoriAIConfig {
  /** Database connection URL - required field */
  databaseUrl: string;
  /** API key for LLM provider */
  apiKey: string;
  /** LLM provider type (optional - auto-detected from API key if not provided) */
  provider?: 'openai' | 'anthropic' | 'ollama';
  /** Model to use (optional - provider default if not specified) */
  model?: string;
  /** Base URL for custom endpoints (optional) */
  baseUrl?: string;
  /** Operating mode for memory processing */
  mode?: 'automatic' | 'manual' | 'conscious';
  /** Namespace for memory operations (optional) */
  namespace?: string;

  // Optional: Different providers for different operations
  /** Provider configuration for chat operations */
  userProvider?: {
    provider: 'openai' | 'anthropic' | 'ollama';
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };

  /** Provider configuration for memory processing (optional - defaults to userProvider) */
  memoryProvider?: {
    provider: 'openai' | 'anthropic' | 'ollama';
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };

  // Access to full IProviderConfig features when needed
  /** Advanced configuration options */
  features?: IProviderConfig['features'];

  /** Enable relationship extraction for memory processing */
  enableRelationshipExtraction?: boolean;
}

/**
 * Simplified chat parameters for the unified API
 */
export interface ChatParams {
  /** Messages to process */
  messages: ChatMessage[];
  /** Model to use (optional, falls back to config default) */
  model?: string;
  /** Sampling temperature (0.0 to 2.0) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Whether to stream the response */
  stream?: boolean;
  /** Additional options */
  options?: Record<string, any>;
}

/**
 * Simplified chat response for the unified API
 */
export interface ChatResponse {
  /** Generated message */
  message: ChatMessage;
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'function_call' | 'content_filter' | 'tool_calls' | 'null';
  /** Usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Unique identifier for the completion */
  id: string;
  /** Model used for generation */
  model: string;
  /** Creation timestamp */
  created: number;
}

/**
 * Memory search options for the unified API
 */
export interface SearchOptions {
  /** Namespace to search in (optional) */
  namespace?: string;
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum importance level filter */
  minImportance?: 'low' | 'medium' | 'high' | 'critical';
  /** Categories to filter by */
  categories?: string[];
  /** Include metadata in results */
  includeMetadata?: boolean;
  /** Sort field and direction */
  sortBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  /** Offset for pagination */
  offset?: number;
}

/**
 * Memory search result for the unified API
 */
export interface MemorySearchResult {
  /** Unique identifier */
  id: string;
  /** Memory content */
  content: string;
  /** Brief summary */
  summary: string;
  /** Classification category */
  classification: string;
  /** Importance level */
  importance: 'low' | 'medium' | 'high' | 'critical';
  /** Main topic */
  topic?: string;
  /** Extracted entities */
  entities: string[];
  /** Keywords for search */
  keywords: string[];
  /** Confidence score */
  confidenceScore: number;
  /** Classification explanation */
  classificationReason: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Embedding request parameters
 */
export interface EmbeddingParams {
  /** Text input to embed */
  input: string | string[];
  /** Model to use (optional) */
  model?: string;
  /** Encoding format for the embeddings */
  encodingFormat?: 'float' | 'base64';
  /** Number of dimensions for the embeddings */
  dimensions?: number;
  /** User identifier for the request */
  user?: string;
}

/**
 * Embedding response
 */
export interface EmbeddingResponse {
  /** Generated embeddings */
  embeddings: number[][];
  /** Usage statistics */
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
  /** Model used for generation */
  model: string;
  /** Unique identifier for the request */
  id: string;
  /** Creation timestamp */
  created: number;
}

/**
 * Provider detection result
 */
export interface ProviderInfo {
  /** Detected provider type */
  type: ProviderType;
  /** Provider name */
  name: string;
  /** Default model for this provider */
  defaultModel: string;
  /** Base URL for the provider */
  baseUrl?: string;
}