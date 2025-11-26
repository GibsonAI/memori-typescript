# Search API Reference

Authoritative reference for search-related inputs and behavior in Memorits.

This document describes:
- SearchOptions and related shapes
- Search strategy usage via Memori / MemoriAI
- Temporal and metadata filtering behavior (grounded in existing implementations)

For core entrypoints, see:
- [`Memori.searchMemories`](src/core/Memori.ts:371)
- [`Memori.searchMemoriesWithStrategy`](src/core/Memori.ts:385)
- [`Memori.searchRecentMemories`](src/core/Memori.ts:443)
- [`MemoriAI.searchMemories`](src/core/MemoriAI.ts:153)
- [`MemoriAI.searchMemoriesWithStrategy`](src/core/MemoriAI.ts:293)

Only documented options and strategies here should be treated as stable.

---

## Search Entry Points

### Memori.searchMemories

```ts
const results = await memori.searchMemories(query: string, options?: SearchOptions)
```

- Delegates to `SearchManager.searchMemories`.
- Applies `namespace`, `limit`, `minImportance`, category filters, and optional filters supported by the underlying strategies.
- Used for:
  - Standard keyword/semantic-like retrieval.
  - Recent queries when combined with appropriate strategy hints.

Reference:
- [`Memori.searchMemories`](src/core/Memori.ts:371)

### Memori.searchMemoriesWithStrategy

```ts
const results = await memori.searchMemoriesWithStrategy(
  query: string,
  strategy: SearchStrategy,
  options?: SearchOptions
)
```

- Requires `memori.enable()`.
- Delegates to `SearchService.searchWithStrategy`.
- Wraps results into the `MemorySearchResult` shape, including:
  - `id`, `content`, `summary`
  - `classification`, `importance`
  - `confidenceScore`, `metadata.searchStrategy`, `metadata.searchScore`, etc. when `includeMetadata` is true.

On failure:
- Logs details with `component: 'Memori'`.
- Throws `Error` with strategy name and underlying message.

Reference:
- [`Memori.searchMemoriesWithStrategy`](src/core/Memori.ts:385)

### Memori.searchRecentMemories

```ts
const results = await memori.searchRecentMemories(
  limit?: number,
  includeMetadata?: boolean,
  temporalOptions?: TemporalFilterOptions,
  strategy?: SearchStrategy
)
```

- Convenience wrapper over:
  - `searchMemoriesWithStrategy` (if non-RECENT strategy provided)
  - or `searchMemories` with RECENT semantics / temporal filters.
- Use when primarily interested in recency/time windows.

Reference:
- [`Memori.searchRecentMemories`](src/core/Memori.ts:443)

### MemoriAI.searchMemories / searchMemoriesWithStrategy

`MemoriAI` exposes the same capabilities via:

```ts
const results = await memoriAI.searchMemories(query, options)
const results = await memoriAI.searchMemoriesWithStrategy(query, strategy, options)
```

These:
- Normalize user-facing options.
- Delegate to the underlying `Memori` instance.

References:
- [`MemoriAI.searchMemories`](src/core/MemoriAI.ts:153)
- [`MemoriAI.searchMemoriesWithStrategy`](src/core/MemoriAI.ts:293)

---

## SearchOptions (Conceptual)

The concrete types live in:
- [`src/core/types/models.ts`](src/core/types/models.ts)
- [`src/core/domain/search/types`](src/core/domain/search/types.ts)

At a high level, `SearchOptions` supports:

- `limit?: number`
  - Max results to return (sensible defaults applied).
- `offset?: number`
  - Optional pagination offset (if supported by strategy).
- `namespace?: string`
  - Logical partition for multi-tenant setups.
- `minImportance?: string`
  - Filter by minimum importance level. Mapped internally to `MemoryImportanceLevel`.
- `categories?: string[]`
  - Filter by categories / classification (strategy-specific).
- `includeMetadata?: boolean`
  - When true, includes strategy and scoring metadata in results.
- `temporalFilters?: TemporalFilterOptions`
  - Enable time-aware filtering (see below).
- `metadataFilters?: MetadataFilterOptions`
  - Enable structured metadata filtering (see below).
- Strategy hints (where supported):
  - Strategy may interpret additional hints; only rely on those documented here.

Any option not documented here or in the public types should be considered internal.

---

## SearchResult Shape (MemorySearchResult)

`MemorySearchResult` (simplified):

- `id: string`
- `content: string`
- `summary?: string`
- `classification: MemoryClassification`
- `importance: MemoryImportanceLevel`
- `topic?: string`
- `confidenceScore?: number`
- `classificationReason?: string`
- `metadata?: { ... }` when `includeMetadata` is enabled:
  - `searchScore?: number`
  - `searchStrategy?: string`
  - `memoryType?: string`
  - `category?: string`
  - `importanceScore?: number`
  - `timeRange?` / other strategy-specific annotations when provided.

Memori’s `searchMemoriesWithStrategy` uses these metadata fields explicitly:
- [`Memori.searchMemoriesWithStrategy`](src/core/Memori.ts:401)

---

## Search Strategies

Search strategies are defined in:
- [`src/core/domain/search/types`](src/core/domain/search/types.ts)
- Implementation spread across SearchManager, SearchService, and strategy classes.

Common patterns:

- `RECENT`
  - Orders by recency; used by `searchRecentMemories`.
- Temporal / metadata / relationship strategies
  - Implemented by dedicated strategy classes and wired via `SearchService`.

This version of the docs intentionally:
- Treats the concrete list of strategies as coming from `getAvailableSearchStrategies()`:
  - Use `await memori.getAvailableSearchStrategies()` or MemoriAI equivalent to discover supported strategies at runtime.
- Does not hardcode strategy names beyond RECENT/common ones to avoid divergence.

Reference:
- [`Memori.getAvailableSearchStrategies`](src/core/Memori.ts:435)

When implementing:
- Prefer using `getAvailableSearchStrategies()` to branch on capabilities.
- Handle unknown strategies defensively.

---

## Temporal Filtering

Temporal filtering is configured via `temporalFilters` in `SearchOptions`.

Type reference:
- See `TemporalFilterOptions` in [`src/core/types/models.ts`](src/core/types/models.ts)
- Detailed usage: [`docs/developer/advanced-features/temporal-filtering.md`](docs/developer/advanced-features/temporal-filtering.md)

Conceptual shape:

```ts
interface TemporalFilterOptions {
  timeRanges?: Array<{ start: Date; end: Date }>;
  relativeExpressions?: string[];
  absoluteDates?: Date[];
  patterns?: string[];
}
```

Behavior:
- Strategies interpret these options using:
  - `DateTimeNormalizer` and related helpers.
- Typical use:
  - Restrict results to:
    - Last N hours/days/weeks.
    - Specific calendar ranges.
- When combined with RECENT-like strategies, temporal filters constrain candidate sets.

Usage example (Memori):

```ts
const recent = await memori.searchMemories('deployment', {
  temporalFilters: { relativeExpressions: ['last 48 hours'] },
  includeMetadata: true,
  limit: 20,
});
```

Guarantees:
- If a temporal strategy is active, results are biased/filtered by time.
- If unsupported, temporal filters are ignored or handled conservatively; inspect `metadata` when `includeMetadata` to confirm.

---

## Metadata Filtering

Metadata filtering is configured via `metadataFilters` in `SearchOptions`.

Type reference:
- See `MetadataFilterOptions` in [`src/core/types/models.ts`](src/core/types/models.ts)
- Detailed usage: [`docs/developer/advanced-features/metadata-filtering.md`](docs/developer/advanced-features/metadata-filtering.md)

Conceptual shape:

```ts
interface MetadataFilterOptions {
  fields?: Array<{
    key: string;
    value: unknown;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'like';
  }>;
}
```

Behavior:
- Strategy builds safe SQL/JSON expressions based on:
  - Key (supports dot-notation for nested metadata).
  - Operator and value.
- Supports combining multiple fields (AND semantics in current implementation).
- Can be combined with:
  - Text query
  - Temporal filters
  - Other strategy logic

Usage example:

```ts
const filtered = await memori.searchMemories('', {
  metadataFilters: {
    fields: [
      { key: 'metadata.importanceScore', operator: 'gte', value: 0.7 },
      { key: 'metadata.category', operator: 'in', value: ['operations', 'security'] },
    ],
  },
  includeMetadata: true,
  limit: 10,
});
```

Guarantees:
- All keys/values are sanitized.
- Invalid operators/keys are rejected or ignored according to implementation; treat this API as strict.

---

## Combining Filters and Strategies

Recommended patterns:

- For basic keyword search:
  - Use `searchMemories(query, { limit, minImportance })`.
- For recent-focused:
  - Use `searchRecentMemories` or a RECENT-like strategy via `searchMemoriesWithStrategy`.
- For time + structure:
  - Combine `temporalFilters` + `metadataFilters` with an appropriate strategy.
- For advanced scenarios:
  - Discover strategies via `getAvailableSearchStrategies()`.
  - Route queries accordingly.

Implementation notes:
- FTS5 vs LIKE:
  - When FTS5 is available and initialized, strategies may use it for scoring.
  - When not, LIKE/JSON-based fallbacks are used.
  - Callers should not depend on a specific backend, only on the documented behavior:
    - Relevant matches within the given constraints,
    - Stable result shape.

---

## Stability Notes

- Public and stable:
  - `Memori.searchMemories`
  - `Memori.searchMemoriesWithStrategy`
  - `Memori.searchRecentMemories`
  - `Memori.getAvailableSearchStrategies`
  - `MemoriAI.searchMemories`
  - `MemoriAI.searchMemoriesWithStrategy`
  - `SearchOptions` fields documented above
  - `TemporalFilterOptions` and `MetadataFilterOptions` as documented

- Advanced but supported:
  - Strategy-specific metadata in `MemorySearchResult.metadata`.
  - Using `getAvailableSearchStrategies()` to branch on capabilities.

- Internal:
  - Direct imports from `src/core/domain/search/**`, `SearchManager`, and individual strategies.
  - Callers should not rely on internal class names or their exact signatures; use the high-level APIs above instead.

This reference is intended to stay synchronized with the implementation; any discrepancy should be treated as a bug in the documentation.
