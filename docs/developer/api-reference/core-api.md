# Core Types Overview

This appendix surfaces the primary type definitions exported by Memorits. Refer to the source files for the authoritative definitions; the snippets below highlight key fields.

## `MemoriAIConfig` (`src/core/MemoriAIConfig.ts`)

```typescript
interface MemoriAIConfig {
  databaseUrl: string;
  apiKey: string;
  provider?: 'openai' | 'anthropic' | 'ollama';
  model?: string;
  baseUrl?: string;
  mode?: 'automatic' | 'manual' | 'conscious';
  namespace?: string;
  userProvider?: ProviderOverride;
  memoryProvider?: ProviderOverride;
  features?: IProviderConfig['features'];
  enableRelationshipExtraction?: boolean;
}
```

`ProviderOverride` lets you specify a different provider for user-facing chat vs background memory processing. The `features` field exposes low-level provider configuration (performance/memory toggles).

## `ChatParams` / `ChatResponse`

```typescript
interface ChatParams {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  options?: Record<string, any>;
}

interface ChatResponse {
  message: ChatMessage;
  finishReason: 'stop' | 'length' | 'function_call' | 'content_filter' | 'tool_calls' | 'null';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  id: string;
  model: string;
  created: number;
}
```

These types normalise provider responses for `MemoriAI.chat`.

## `SearchOptions` Variants

- `MemoriAI` exports the simplified version shown above (namespace, limit, importance filters, etc.).
- `Memori` uses the extended version from `src/core/types/models.ts` which adds `temporalFilters`, `metadataFilters`, `filterExpression`, `includeRelatedMemories`, and `maxRelationshipDepth`.

## `MemorySearchResult`

```typescript
interface MemorySearchResult {
  id: string;
  content: string;
  summary: string;
  classification: MemoryClassification;
  importance: MemoryImportanceLevel;
  topic?: string;
  entities: string[];
  keywords: string[];
  confidenceScore: number;
  classificationReason: string;
  metadata?: Record<string, unknown>;
}
```

`metadata` often contains `searchScore`, `searchStrategy`, `memoryType`, and other annotations depending on the strategy and options.

## `MemoriConfig` (`src/core/types/models.ts`)

```typescript
interface MemoriConfig extends BaseConfig, ProviderConfig {
  databaseUrl: string;
  namespace: string;
  consciousIngest: boolean;
  autoIngest: boolean;
  enableRelationshipExtraction: boolean;
  userContext?: {
    userPreferences?: string[];
    currentProjects?: string[];
    relevantSkills?: string[];
  };
  backgroundUpdateInterval?: number;
}
```

`ConfigManager.loadConfig()` populates this structure from environment variables, providing defaults for any missing values.

## Provider Types

`src/core/infrastructure/providers` exports:

- `ProviderType` – `'openai' | 'anthropic' | 'ollama'`
- `IProviderConfig` – provider configuration with nested `features.performance` and `features.memory` settings.
- `LLMProviderFactory` – factory to instantiate providers, useful for advanced integrations.

## Consolidation Interfaces

`src/core/infrastructure/database/interfaces/ConsolidationService.ts` defines the service contract. Key return types include:

- `ConsolidationStats` (total memories, duplicate counts, trends)
- `ConsolidationPreview` (what would be merged)
- `OptimizationRecommendation` (action items with priority/benefit)

Use `Memori.getConsolidationService()` to obtain an implementation of this interface.

Keep this appendix handy when wiring Memorits into your application—matching these types will ensure compile-time safety and consistent behaviour with the core implementation.
