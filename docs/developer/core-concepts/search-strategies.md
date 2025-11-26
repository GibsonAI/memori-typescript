# Search Strategies

This document explains how Memorits search strategies work and how to use them via stable public APIs.

It is grounded in:
- [`Memori.searchMemories`](src/core/Memori.ts:371)
- [`Memori.searchMemoriesWithStrategy`](src/core/Memori.ts:385)
- [`Memori.searchRecentMemories`](src/core/Memori.ts:443)
- [`Memori.getAvailableSearchStrategies`](src/core/Memori.ts:435)
- [`MemoriAI.searchMemories`](src/core/MemoriAI.ts:153)
- [`MemoriAI.searchMemoriesWithStrategy`](src/core/MemoriAI.ts:293)
- Search infrastructure under `src/core/infrastructure/database` and `src/core/domain/search`

Only behavior that exists in the codebase is documented here. Anything else should be treated as internal.

---

## 1. Entry Points

### 1.1 Using Memori

- Default search:

```ts
const results = await memori.searchMemories('deployment notes', {
  limit: 20,
  minImportance: 'medium',
  includeMetadata: true,
});
```

- Strategy-based search:

```ts
import { SearchStrategy } from 'memorits'; // from public types if exported

const results = await memori.searchMemoriesWithStrategy(
  'incident report',
  SearchStrategy.RECENT,
  {
    limit: 50,
    includeMetadata: true,
  }
);
```

- Recent helper:

```ts
const recent = await memori.searchRecentMemories(
  10,
  true,
  { relativeExpressions: ['last 24 hours'] }
);
```

### 1.2 Using MemoriAI

MemoriAI forwards to Memori:

```ts
const results = await memoriAI.searchMemories('project x', { limit: 10 });
const withStrategy = await memoriAI.searchMemoriesWithStrategy('project x', strategy, { limit: 10 });
```

Use MemoriAI when you want a single object for chat + memory + search.

---

## 2. Discovering Supported Strategies

Instead of hardcoding strategy names, use:

```ts
const strategies = await memori.getAvailableSearchStrategies();
// or
const strategies = await memoriAI.getAvailableSearchStrategies();
```

Treat this as the source of truth for what the current build supports.

Reference:
- [`Memori.getAvailableSearchStrategies`](src/core/Memori.ts:435)

Recommended pattern:
- Check `getAvailableSearchStrategies()` at startup.
- Enable/disable features in your app based on what’s available.

---

## 3. Common Strategy Behaviors

The exact list of strategies is implementation-defined. However, several behaviors are stable and relied upon by higher-level APIs.

### 3.1 RECENT / Time-Aware Search

Usage:
- `Memori.searchRecentMemories`
- `searchMemoriesWithStrategy` with a RECENT-like strategy (when available).

Behavior:
- Focuses on most recent memories in the target namespace.
- Can combine with `TemporalFilterOptions` to constrain time windows.
- Typical use cases:
  - "What happened in the last 24h?"
  - Dashboards and activity feeds.

See:
- [`docs/developer/advanced-features/temporal-filtering.md`](docs/developer/advanced-features/temporal-filtering.md)

### 3.2 Temporal Filtering (Strategy-Agnostic)

Enabled via `temporalFilters` in `SearchOptions`:

- When a temporal-aware strategy is active:
  - Filters / ranks using time intervals, relative expressions, etc.
- When not:
  - Temporal options may be ignored or used conservatively.

Key points:
- Represents supported behavior; callers should inspect metadata when `includeMetadata` is enabled to confirm which strategy ran.

Details:
- [`docs/developer/advanced-features/temporal-filtering.md`](docs/developer/advanced-features/temporal-filtering.md)

### 3.3 Metadata Filtering

Enabled via `metadataFilters` in `SearchOptions`:

- Filters based on structured metadata stored with memories.
- Supports operators such as `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `like` according to the runtime implementation.

Usage:
- Narrow results for operational cases:
  - Importance thresholds.
  - Specific categories.
  - Tenant/account-level filters.

Details:
- [`docs/developer/advanced-features/metadata-filtering.md`](docs/developer/advanced-features/metadata-filtering.md)

---

## 4. FTS5 vs LIKE Fallbacks

The search layer is designed to support environments:

- With FTS5 enabled:
  - Strategies may use FTS5-backed virtual tables for efficient full-text search and ranking.
- Without FTS5:
  - Fallback to:
    - Standard LIKE queries
    - Other safe filters implemented in `SearchManager` / `SearchService`.

Important:
- As a caller, you SHOULD NOT depend on a specific underlying mechanism.
- You SHOULD rely on these guarantees:
  - Queries respect `namespace`, `limit`, documented filters.
  - When FTS5 is unavailable, you still get functionally correct (if less sophisticated) results.
- To detect FTS status, use the database/index health APIs rather than assuming availability.

---

## 5. Recommended Usage Patterns

1. Basic keyword or general search:
   - Use `searchMemories(query, { limit, minImportance })`.
2. Time-focused:
   - Use `searchRecentMemories` or a RECENT strategy.
   - Optionally pass `temporalFilters`.
3. Structured filters:
   - Add `metadataFilters` and/or categories to narrow by metadata.
4. Adaptive strategy selection:
   - On startup, call `getAvailableSearchStrategies()`.
   - Route advanced queries only through known strategies.
5. Debugging behavior:
   - Use `includeMetadata: true` to inspect:
     - `searchStrategy`
     - `searchScore`
     - Any time or filter information surfaced in metadata.

---

## 6. Stability Notes

Stable and recommended:
- `Memori.searchMemories`
- `Memori.searchMemoriesWithStrategy`
- `Memori.searchRecentMemories`
- `Memori.getAvailableSearchStrategies`
- `MemoriAI.searchMemories`
- `MemoriAI.searchMemoriesWithStrategy`
- `SearchOptions` fields used in:
  - [`docs/developer/api/search-api.md`](docs/developer/api/search-api.md)

Advanced but supported:
- Inspecting `MemorySearchResult.metadata` when `includeMetadata` is true.
- Adapting behavior based on `getAvailableSearchStrategies()`.

Internal / not guaranteed:
- Direct imports from:
  - `src/core/domain/search/**`
  - `SearchManager`, `SearchService` implementations
  - Concrete strategy classes

If you build on internal classes, treat them as unstable and wrap them in your own abstraction.

This document is intended to remain synchronized with the implementation; discrepancies should be corrected as documentation bugs.
