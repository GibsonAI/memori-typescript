# System Overview

Memorits follows a domain-driven architecture: domain logic lives separately from infrastructure, and the public API layers (`MemoriAI`, `Memori`, provider integrations) compose these building blocks. This document maps the folders in `src/` to their responsibilities so you can navigate the code confidently.

## High-Level Layout

```
src/
├─ core/
│  ├─ Memori.ts            // advanced API surface, orchestrates everything
│  ├─ MemoriAI.ts          // simplified facade (chat + memory)
│  ├─ domain/
│  │  ├─ memory/           // MemoryAgent, ConsciousAgent, state managers
│  │  └─ search/           // Strategies, configuration, relationship traversal
│  ├─ infrastructure/
│  │  ├─ database/         // Prisma-based management, search coordination
│  │  ├─ providers/        // OpenAI/Anthropic/Ollama adapters + factory
│  │  └─ config/           // ConfigManager, sanitisation, logger
│  ├─ performance/         // Dashboard and analytics services
│  └─ types/               // Zod schemas, models, enums
├─ integrations/
│  └─ openai-dropin/       // MemoriOpenAI drop-in client & factory
└─ providers/              // Provider-specific helper docs (exported via docs)
```

## Data Flow: From Chat to Memory

1. **Entry point** – Applications call `MemoriAI.chat` or `Memori.recordConversation`.
2. **Provider interaction** – `MemoriAI` uses an `ILLMProvider` implementation from `src/core/infrastructure/providers`. Providers share an interface so multi-provider support is uniform.
3. **Memory processing** – Recorded exchanges are passed to `MemoryAgent` (`src/core/domain/memory/MemoryAgent.ts`) which:
   - summarises the dialogue,
   - assigns `MemoryClassification` and `MemoryImportanceLevel`,
   - extracts entities and keywords,
   - emits scores and metadata.
4. **Persistence** – `DatabaseManager` (`src/core/infrastructure/database/DatabaseManager.ts`) writes the processed memory to Prisma models defined in `prisma/schema.prisma`.
5. **Search orchestration** – `SearchManager` / `SearchService` (`src/core/infrastructure/database/SearchManager.ts` & `src/core/domain/search/SearchService.ts`) coordinate the search strategies and fallbacks when you query stored memories.
6. **Conscious processing** – If enabled, `ConsciousAgent` copies long-term memories into short-term context, leveraging state tracking and duplicate checks.

Each stage logs structured payloads using `Logger.ts`, tagging the component (e.g., `MemoriAI`, `MemoryAgent`, `SearchManager`) to simplify tracing.

## Key Components

### `MemoriAI`

- Location: `src/core/MemoriAI.ts`
- Public surface (as implemented):
  - `chat` – chat completion with optional automatic recording via `Memori` ([`MemoriAI.chat`](src/core/MemoriAI.ts:97))
  - `searchMemories` / `searchMemoriesWithStrategy` – delegates to `Memori` search APIs ([`MemoriAI.searchMemories`](src/core/MemoriAI.ts:153), [`MemoriAI.searchMemoriesWithStrategy`](src/core/MemoriAI.ts:293))
  - `getAvailableSearchStrategies` – enumerates supported strategies ([`MemoriAI.getAvailableSearchStrategies`](src/core/MemoriAI.ts:306))
  - `createEmbeddings` – provider-backed embeddings API ([`MemoriAI.createEmbeddings`](src/core/MemoriAI.ts:167))
  - `recordConversation` – manual/conscious mode recording wrapper ([`MemoriAI.recordConversation`](src/core/MemoriAI.ts:247))
  - `getMemoryStatistics` – statistics via underlying `Memori` ([`MemoriAI.getMemoryStatistics`](src/core/MemoriAI.ts:286))
  - `close` – disposes provider and `Memori` ([`MemoriAI.close`](src/core/MemoriAI.ts:203))
- Delegates heavy lifting (ingestion, search, consolidation) to `Memori` while owning user-facing provider lifecycle.

### `Memori`

- Location: `src/core/Memori.ts`
- Key responsibilities (all verified in code):
  - Ingestion:
    - `enable` – initializes providers, `MemoryAgent`, optional `ConsciousAgent` ([`Memori.enable`](src/core/Memori.ts:174))
    - `recordConversation` – stores chat + triggers ingestion based on mode ([`Memori.recordConversation`](src/core/Memori.ts:226))
    - `processMemory` – runs `MemoryAgent.processConversation` + stores relationships when enabled ([`Memori.processMemory`](src/core/Memori.ts:277))
    - `storeProcessedMemory` – helper to persist externally computed memories ([`Memori.storeProcessedMemory`](src/core/Memori.ts:655))
  - Search:
    - `searchMemories` ([`Memori.searchMemories`](src/core/Memori.ts:371))
    - `searchMemoriesWithStrategy` ([`Memori.searchMemoriesWithStrategy`](src/core/Memori.ts:385))
    - `searchRecentMemories` ([`Memori.searchRecentMemories`](src/core/Memori.ts:443))
    - `getAvailableSearchStrategies` ([`Memori.getAvailableSearchStrategies`](src/core/Memori.ts:435))
  - Conscious processing:
    - `initializeConsciousContext`, `checkForConsciousContextUpdates` ([`Memori.initializeConsciousContext`](src/core/Memori.ts:534), [`Memori.checkForConsciousContextUpdates`](src/core/Memori.ts:514))
    - Background monitoring controls: `setBackgroundUpdateInterval`, `isBackgroundMonitoringActive` ([`Memori.setBackgroundUpdateInterval`](src/core/Memori.ts:617), [`Memori.isBackgroundMonitoringActive`](src/core/Memori.ts:641))
  - Index maintenance:
    - `getIndexHealthReport`, `optimizeIndex`, `createIndexBackup`, `restoreIndexFromBackup` ([`Memori`](src/core/Memori.ts:794), [`Memori.optimizeIndex`](src/core/Memori.ts:824), [`Memori.createIndexBackup`](src/core/Memori.ts:856), [`Memori.restoreIndexFromBackup`](src/core/Memori.ts:1112))
  - Stats:
    - `getMemoryStatistics`, `getDetailedMemoryStatistics` ([`Memori.getMemoryStatistics`](src/core/Memori.ts:886), [`Memori.getDetailedMemoryStatistics`](src/core/Memori.ts:927))
  - Duplicates & relationships:
    - `findDuplicateMemories` ([`Memori.findDuplicateMemories`](src/core/Memori.ts:735))
    - `extractMemoryRelationships`, `buildRelationshipGraph` ([`Memori.extractMemoryRelationships`](src/core/Memori.ts:983), [`Memori.buildRelationshipGraph`](src/core/Memori.ts:1050))
  - Lifecycle:
    - `close` – shuts down background tasks, search service, and database ([`Memori.close`](src/core/Memori.ts:467))
- Instantiates `DatabaseManager`, provider adapters, `MemoryAgent`, and optionally `ConsciousAgent`.

### Providers

- Location: `src/core/infrastructure/providers/`
- `OpenAIProvider`, `AnthropicProvider`, `OllamaProvider` extend shared base provider infrastructure (e.g. `MemoryCapableProvider` / `BaseLLMProvider`).
- `LLMProviderFactory` maps `ProviderType` + config to concrete provider classes.
- Documented guarantees:
  - Consistent config surface and logging.
  - Memory features integrated via `MemoryCapableProvider` when enabled.
- Do not assume undocumented features like global caching or pooling beyond what is implemented in each provider.

### Database Infrastructure

- `DatabaseContext` owns Prisma clients and operation metrics.
- `MemoryManager`, `SearchManager`, and other managers are composed by `DatabaseManager` as a facade; refer to concrete types rather than assuming a specific base class.
- Search coordination combines FTS5 queries where available with safe fallbacks; see `SearchManager.searchMemories` and `SearchService` orchestration.

### Performance Monitoring

- `PerformanceService` (wired through `DatabaseContext` / `DatabaseManager`) tracks database operation metrics and exposes:
  - `getPerformanceMetrics`, `getRecentOperationMetrics`, `getPerformanceAnalytics`, `getDatabasePerformanceReport`, `getPerformanceMonitoringStatus`.
- These can be surfaced via `DatabaseManager`-backed APIs for admin tooling; avoid referencing non-existent `performance` dashboard classes.

### Integrations

- `integrations/openai-dropin` exports `MemoriOpenAI` (a drop-in replacement for the official OpenAI SDK) and supporting factory helpers. It uses the same providers and memory pipeline described above.

## Configuration & Environment

- `ConfigManager` loads environment variables, sanitises them, and defaults to safe values. Expect keys like `DATABASE_URL`, `MEMORI_NAMESPACE`, `MEMORI_AUTO_INGEST`, `MEMORI_CONSCIOUS_INGEST`, `OPENAI_API_KEY`, and `OPENAI_BASE_URL`.
- All configuration validations throw descriptive `ValidationError` / `SanitizationError` exceptions when inputs don't match expectations.

## Extending the System

- **New search strategy** – Implement `ISearchStrategy`, register it in `SearchService`, and add configuration defaults through `SearchStrategyConfigManager`.
- **New provider** – Extend `MemoryCapableProvider`, implement `executeChatCompletion`/`executeEmbedding`, and register it with `LLMProviderFactory`.
- **Custom storage** – Swap Prisma datasource by adjusting `prisma/schema.prisma` and re-running `npm run prisma:push && npm run prisma:generate`.

Understanding these boundaries keeps the codebase approachable: domain components stay free from infrastructure dependencies, advanced features build on core services, and the public APIs wrap the full stack in developer-friendly facades.
