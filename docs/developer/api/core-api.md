# Core API Reference

This reference covers the primary classes exported by Memorits: `MemoriAI`, `Memori`, and the OpenAI drop-in client. All types referenced below come directly from the TypeScript definitions in `src/`.

## `MemoriAI`

High-level façade that combines provider access and memory management.

### Constructor

```typescript
new MemoriAI(config: MemoriAIConfig)
```

`MemoriAIConfig` lives in `src/core/MemoriAIConfig.ts` and includes:

- `databaseUrl: string`
- `apiKey: string`
- `provider?: 'openai' | 'anthropic' | 'ollama'`
- `model?: string`
- `baseUrl?: string`
- `mode?: 'automatic' | 'manual' | 'conscious'`
- `namespace?: string`
- Optional `userProvider` / `memoryProvider` overrides with provider-specific configuration.

### Methods

| Method | Description |
| --- | --- |
| `chat(params: ChatParams): Promise<ChatResponse>` | Performs a chat completion using the configured provider. In automatic mode the exchange is recorded as memory. |
| `searchMemories(query: string, options?: SearchOptions): Promise<MemorySearchResult[]>` | Searches stored memories using the simplified search options from `MemoriAIConfig`. |
| `searchMemoriesWithStrategy(query: string, strategy: SearchStrategy, options?: SearchOptions): Promise<MemorySearchResult[]>` | Forces a specific strategy (e.g., `SearchStrategy.RECENT`). |
| `createEmbeddings(params: EmbeddingParams): Promise<EmbeddingResponse>` | Creates embeddings using the active provider. |
| `recordConversation(userInput: string, aiOutput: string, options?): Promise<string>` | Available in manual/conscious mode to persist conversations explicitly. |
| `getMemoryStatistics(namespace?: string)` | Returns counts from `DatabaseManager.getMemoryStatistics`. |
| `getAvailableSearchStrategies(): Promise<SearchStrategy[]>` | Lists the strategies currently registered by `SearchService`. |
| `getSessionId(): string` | Returns the generated session identifier for telemetry. |
| `getMode(): 'automatic' | 'manual' | 'conscious'` | Indicates the configured ingestion mode. |
| `close(): Promise<void>` | Disposes provider resources and closes database connections. |

### Types

`ChatParams`, `ChatResponse`, `SearchOptions`, `MemorySearchResult`, `EmbeddingParams`, and `EmbeddingResponse` are exported from `src/core/MemoriAIConfig.ts`. The `SearchOptions` shape here is the simplified version (namespace, limit, includeMetadata, minImportance, categories, sortBy, offset).

## `Memori`

Low-level API with access to advanced search, consolidation, and maintenance APIs. Constructor accepts a partial `MemoriAIConfig`; any omitted values fall back to `ConfigManager`.

```typescript
const memori = new Memori({ databaseUrl: 'file:./memori.db', mode: 'conscious' });
await memori.enable();
```

### Key Methods

| Method | Description |
| --- | --- |
| `enable(): Promise<void>` | Initialises providers, database managers, and agents. Must be called before other operations. |
| `recordConversation(userInput, aiOutput, options?)` | Stores an exchange and processes it via `MemoryAgent`. |
| `searchMemories(query, options: SearchOptions)` | Uses the full search options defined in `src/core/types/models.ts` (including `temporalFilters`, `metadataFilters`, `filterExpression`, etc.). |
| `searchMemoriesWithStrategy(query, strategy, options)` | Executes a specific `SearchStrategy`. |
| `searchRecentMemories(limit?, includeMetadata?, temporalFilters?, strategy?)` | Convenience wrapper for recent searches. |
| `getAvailableSearchStrategies()` | Lists registered strategies. |
| `getMemoryStatistics(namespace?)` / `getDetailedMemoryStatistics(namespace?)` | Returns aggregated database stats. |
| `getIndexHealthReport()` | Proxy to `SearchIndexManager.getIndexHealthReport`. |
| `optimizeIndex(type?)` | Runs index optimisation (`MERGE`, `REBUILD`, `COMPACT`, `VACUUM`). |
| `createIndexBackup()` / `restoreIndexFromBackup(backupId)` | Manage search index backups. |
| `findDuplicateMemories(content, options?)` | Surfaces potential duplicates using `DuplicateManager`. |
| `getConsolidationService()` | Exposes the fully-fledged consolidation service for advanced workflows. |
| `initializeConsciousContext()` / `checkForConsciousContextUpdates()` | Conscious processing helpers. |
| `close()` | Disposes provider and database resources. |

Any method that reads or writes data requires `enable()` to have run first.

## `MemoriOpenAI`

Located under `integrations/openai-dropin/client`. Provides a drop-in replacement for the OpenAI SDK v5 while recording memories automatically.

```typescript
import { MemoriOpenAI } from 'memorits/integrations/openai-dropin/client';

const client = new MemoriOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto',
    sessionId: 'support-bot'
  }
});

const completion = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Remember that our stand-up is 9am PST.' }]
});

const memories = await client.memory.searchMemories('stand-up');
```

The factory helpers (`MemoriOpenAIFactory`, `memoriOpenAIFactory`, `MemoriOpenAIFromConfig`, etc.) mirror the constructors defined in `integrations/openai-dropin/factory.ts`.

## Provider Utilities

Provider abstractions live in `src/core/infrastructure/providers`. To initialise providers directly:

```typescript
import { LLMProviderFactory, ProviderType } from 'memorits';

const provider = await LLMProviderFactory.createProvider(ProviderType.ANTHROPIC, {
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20241022',
  features: {
    memory: {
      enableChatMemory: true,
      memoryProcessingMode: 'auto',
      sessionId: 'anthropic-session'
    }
  }
});
```

These utilities are considered advanced usage; most applications rely on `MemoriAI` or `Memori`.

## Logging

All core classes use `logInfo`/`logError` from `src/core/infrastructure/config/Logger.ts`. Each log entry includes a `component` field (e.g., `MemoriAI`, `SearchManager`) and contextual metadata like `sessionId`, `namespace`, or operation identifiers.

## Error Handling

- Configuration errors throw `ValidationError` or `SanitizationError`.
- Provider initialisation errors bubble up from the underlying SDKs.
- Search operations throw when options fail validation or when fallbacks also fail.
- Consolidation and duplicate operations return structured results containing `errors`/`warnings`.

Always wrap calls in `try/catch` when building production systems to handle these outcomes gracefully.

This reference should give you a working mental model of the public API. For deeper dives, consult the module-specific docs (`advanced-features/`, `core-concepts/`) or inspect the source files referenced above.
