# Search Architecture

Memorits provides a layered search system that balances relevance, resilience, and observability. The implementation spans `src/core/infrastructure/database/SearchManager.ts`, `src/core/domain/search/SearchService.ts`, and individual strategy classes inside `src/core/domain/search`.

This document explains how a query flows through those components and what each strategy contributes.

## Control Flow

1. **API layer** – `Memori.searchMemories` (and `MemoriAI.searchMemories`) call into `SearchManager`.
2. **SearchManager** – Validates options, normalises filters, and decides whether to use the high-level `SearchService` or direct coordination between the FTS and basic strategies.
3. **SearchService** – Maintains a registry of `ISearchStrategy` implementations, loads their configuration from `SearchStrategyConfigManager`, and executes one or more strategies based on the query.
4. **Strategy execution** – Each strategy returns `SearchResult` objects. `SearchService` merges, deduplicates, and ranks them before mapping them to `MemorySearchResult`.
5. **Fallbacks** – If a strategy fails, the manager logs the error, increments error counters, and attempts a fallback strategy (usually `LIKE`).

All operations are logged with structured payloads (component name, latency, strategy used) so that the performance dashboard can surface search behaviour.

## Strategy Registry

`SearchService` initialises the following strategies when configuration and prerequisites allow:

| Strategy | Implementation | Purpose |
| --- | --- | --- |
| `FTS5` | `SQLiteFTSStrategy` | Full-text search via SQLite FTS5, including BM25 scoring. |
| `LIKE` | `LikeSearchStrategy` | Simple SQL `LIKE` fallback when FTS5 is unavailable or fails. |
| `RECENT` | `RecentMemoriesStrategy` | Recency-focused retrieval with time decay scoring. |
| `SEMANTIC` | Placeholder currently disabled (infrastructure present for vector search backends). |
| `CATEGORY_FILTER` | `filtering/CategoryFilterStrategy` | Filter memories by classification and importance. |
| `TEMPORAL_FILTER` | `temporal/TemporalFilterStrategy` | Interpret `TemporalFilterOptions` (ranges, relative expressions). |
| `METADATA_FILTER` | `filtering/MetadataFilterStrategy` | Apply structured metadata filters and advanced expressions. |
| `RELATIONSHIP` | `relationship/RelationshipTraversalStrategy` | Traverse memory relationships stored in JSON columns. |

Each strategy inherits from `BaseSearchStrategy`, gaining logging, timeout handling, and configuration validation automatically.

## Search Options

The advanced `SearchOptions` (see `src/core/types/models.ts`) drive strategy selection. Key fields:

- `temporalFilters` – triggers the temporal strategy; supports `timeRanges`, `relativeExpressions`, `absoluteDates`, and pattern matching.
- `metadataFilters` – uses `MetadataFilterStrategy`, applying field-level comparisons.
- `filterExpression` – parsed by `AdvancedFilterEngine` for boolean expressions (e.g., `importanceScore >= 0.7 AND metadata.topic = "ops"`).
- `includeRelatedMemories`, `maxRelationshipDepth` – instruct the relationship strategy to append linked memories.
- `strategy` – forces a specific strategy (available through `Memori.searchMemoriesWithStrategy`).

`MemoriAI` exposes a trimmed version of these options suitable for quick lookups.

## Result Shaping

Strategies return `SearchResult` objects (`id`, `content`, `metadata`, `score`, `strategy`). `SearchService` maps them to `MemorySearchResult` by:

- Fetching the latest data from `long_term_memory` / `short_term_memory` when needed.
- Selecting the highest classification importance available.
- Converting metadata to the canonical structure (summary, entities, keywords, confidence).
- Attaching provenance inside `metadata.searchStrategy` and `metadata.searchScore` when `includeMetadata` is true.

`MemorySearchResult.confidenceScore` originates from the stored memory, not the search strategy. Strategy scores live in metadata.

## Index Management

`SearchIndexManager` owns operational tasks:

- **Health reports** – `getIndexHealthReport()` gathers statistics (document count, index size, query latency) and diagnoses issues.
- **Optimisation** – `optimizeIndex()` supports merge, rebuild, compaction, and vacuum operations, measuring before/after size and response time.
- **Backups** – `createBackup()` writes snapshots to `search_index_backups`; `restoreIndexFromBackup()` loads them back into `memory_fts`.
- **Maintenance schedule** – `startMaintenanceSchedule()` sets timers for health checks (hourly), optimisation checks (daily), and backups (weekly).

`Memori` exposes these capabilities with convenience methods so you can wire them into admin tooling or cron jobs.

## Error Handling and Observability

- **Sanitisation** – All inbound queries pass through `sanitizeSearchQuery`, `sanitizeNamespace`, and category sanitisation helpers to prevent SQL issues and ensure namespaces remain well-formed.
- **Metrics** – `SearchManager` tracks total searches, average latency, strategy usage, and error count. These metrics feed into `PerformanceDashboardService`.
- **Logging** – Each strategy logs start/end events with latency and counts. Failures include the error, strategy, and query length.
- **Fallbacks** – When a strategy throws, the manager records the failure and retries with a fallback. Callers still get a result array unless all strategies fail.

## Customisation Tips

- Adjust per-strategy configuration with `SearchStrategyConfigManager`. Default configs live in `src/core/domain/search/SearchStrategyConfigManager.ts`.
- Add a new strategy by implementing `ISearchStrategy`, extending `BaseSearchStrategy`, and wiring it into `SearchService.initializeStrategies()`.
- Use `searchRecentMemories` (on `Memori`) for the high-level recent-results helper—internally it delegates to `SearchStrategy.RECENT`.

This layered design keeps the core search logic composable, makes maintenance (backups, optimisation) part of the story, and surfaces enough telemetry to tune performance in production.
