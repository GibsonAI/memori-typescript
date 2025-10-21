// 🚀 MemoriAI - Unified API (Clean & Simple)
// Single class handles everything - no wrapper complexity!

// Main unified API
export { MemoriAI } from './core/MemoriAI';

// Core configuration and types
export type {
  MemoriAIConfig,
  ChatParams,
  ChatResponse,
  SearchOptions,
  MemorySearchResult,
  EmbeddingParams,
  EmbeddingResponse,
  ProviderInfo
} from './core/MemoriAIConfig';

// Keep essential existing exports for backward compatibility
export { Memori } from './core/Memori';
export { ConfigManager } from './core/infrastructure/config/ConfigManager';
export type {
  MemorySearchResult as SearchResult,
  MemoriConfig
} from './core/types/models';

// Essential search types that other modules depend on
export type { SearchQuery } from './core/domain/search/SearchStrategy';

// OpenAI Drop-in replacement (unchanged)
export { default as MemoriOpenAIClient, MemoriOpenAI } from './integrations/openai-dropin/client';
export { MemoriOpenAIFactory, memoriOpenAIFactory } from './integrations/openai-dropin/factory';
export {
  MemoriOpenAIFromConfig,
  MemoriOpenAIFromEnv,
  MemoriOpenAIFromDatabase,
} from './integrations/openai-dropin/factory';

// Re-export key types from OpenAI drop-in for convenience
export type {
  ChatCompletion,
  ChatCompletionCreateParams,
  EmbeddingCreateParams,
  CreateEmbeddingResponse,
} from './integrations/openai-dropin/types';

// Provider utilities for advanced usage
export {
  LLMProviderFactory,
  ProviderType,
  IProviderConfig,
  MemoryCapableProvider,
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider,
} from './core/infrastructure/providers';

// Performance monitoring services
export { PerformanceDashboardService } from './core/performance/PerformanceDashboard';
export { PerformanceAnalyticsService } from './core/performance/PerformanceAnalyticsService';
