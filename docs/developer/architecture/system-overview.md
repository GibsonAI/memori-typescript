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
- Designed for consumers who want a drop-in API: `chat`, `searchMemories`, `createEmbeddings`, `recordConversation` (manual mode), `getMemoryStatistics`, etc.
- Delegates most heavy lifting to `Memori` while managing provider lifecycles.

### `Memori`

- Location: `src/core/Memori.ts`
- Exposes the full surface: strategy-aware search, conscious processing, index maintenance, duplication checks, and backup/restore helpers.
- Instantiates `DatabaseManager`, provider adapters, `MemoryAgent`, and optionally `ConsciousAgent`.

### Providers

- Location: `src/core/infrastructure/providers/`
- `OpenAIProvider`, `AnthropicProvider`, `OllamaProvider` all extend `MemoryCapableProvider`.
- `LLMProviderFactory` converts `ProviderType` + config into the correct provider instance.
- Providers share connection pooling, request caching, and health monitoring utilities.

### Database Infrastructure

- `DatabaseContext` owns Prisma clients and operation metrics.
- `MemoryManager`, `SearchManager`, and supporting managers inherit from `BaseDatabaseService` to share sanitisation and metrics recording.
- Search coordination combines FTS5 queries with fallback strategies; see `SearchManager.searchMemories`.

### Performance Monitoring

- Services under `src/core/performance/` (`PerformanceDashboardService`, `PerformanceAnalyticsService`) collect metrics from search, database operations, and configuration changes. They are optional but useful for admin dashboards.

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
