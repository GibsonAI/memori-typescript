# Search Strategies in Memorits

The search stack is implemented under `src/core/domain/search`. `Memori` and `MemoriAI` both delegate to the `SearchManager` / `SearchService` combination and ultimately return `MemorySearchResult` objects. This document explains what each strategy does and how to select it deliberately.

## Strategy Catalogue

`SearchStrategy` is defined in `src/core/domain/search/types.ts`:

```typescript
enum SearchStrategy {
  FTS5 = 'fts5',
  LIKE = 'like',
  RECENT = 'recent',
  SEMANTIC = 'semantic',
  CATEGORY_FILTER = 'category_filter',
  TEMPORAL_FILTER = 'temporal_filter',
  METADATA_FILTER = 'metadata_filter',
  RELATIONSHIP = 'relationship'
}
```

Each strategy lives in its own class (see `src/core/domain/search/strategies` and sibling folders) and is registered by `SearchService` when the necessary prerequisites are met (for example, the FTS5 strategy is skipped when SQLite lacks FTS5).

## Default Behaviour

`Memori.searchMemories(query, options)` chooses a strategy automatically:

- When FTS5 is available, keyword queries run through the FTS strategy.
- Empty queries or those dominated by time filters fall back to the recent or temporal strategies.
- The LIKE strategy is used as a fallback when FTS5 fails or is unavailable.

You will always receive an array of `MemorySearchResult` objects. When `includeMetadata` is `true`, the `metadata` field includes `searchScore`, `searchStrategy`, `memoryType`, and other diagnostic values.

## Selecting a Strategy Explicitly

```typescript
import { Memori, SearchStrategy } from 'memorits';

const memori = new Memori({ databaseUrl: 'file:./memori.db' });
await memori.enable();

const results = await memori.searchMemoriesWithStrategy(
  'vector indexing',
  SearchStrategy.FTS5,
  {
    limit: 20,
    includeMetadata: true
  }
);
```

If a strategy throws, the `SearchManager` attempts a fallback, so you still receive results when possible. Check `metadata.searchStrategy` to see what executed in the end.

## Temporal Filtering

`TemporalFilterOptions` live in `src/core/types/models.ts`:

```typescript
const temporal = await memori.searchMemories('standup notes', {
  limit: 10,
  temporalFilters: {
    relativeExpressions: ['last 7 days'],
    absoluteDates: [new Date('2024-06-01')],
    timeRanges: [
      { start: new Date('2024-05-01'), end: new Date('2024-05-15') }
    ]
  }
});
```

Supplying temporal filters automatically biases the strategy selection toward `TEMPORAL_FILTER` or `RECENT`. You can override this by passing `strategy: SearchStrategy.TEMPORAL_FILTER`.

## Metadata Filtering

```typescript
const filtered = await memori.searchMemories('renewal', {
  metadataFilters: {
    fields: [
      { key: 'metadata.topic', operator: 'eq', value: 'billing' },
      { key: 'metadata.accountTier', operator: 'in', value: ['enterprise', 'pro'] }
    ]
  },
  includeMetadata: true
});
```

Metadata filters run through `MetadataFilterStrategy` and can be combined with the text query. When you need more expressive logic, use `filterExpression` which is parsed by `AdvancedFilterEngine`.

```typescript
const advanced = await memori.searchMemories('', {
  filterExpression: 'importanceScore >= 0.7 AND metadata.topic = "operations"',
  limit: 25
});
```

## Relationship Search

The relationship strategy traverses the relationship graph generated during memory processing.

```typescript
const related = await memori.searchMemoriesWithStrategy(
  'incident response',
  SearchStrategy.RELATIONSHIP,
  {
    limit: 15,
    includeMetadata: true,
    includeRelatedMemories: true,
    maxRelationshipDepth: 2
  }
);
```

When `includeRelatedMemories` is `true`, additional related entries are appended to the result set. The underlying relationships come from `MemoryRelationship` objects stored in the database.

## Recent Memory Helper

```typescript
const recent = await memori.searchRecentMemories(
  10,
  true,
  {
    relativeExpressions: ['today']
  }
);
```

This helper wraps the temporal strategy. It is exposed on `Memori` and internally calls `searchMemoriesWithStrategy` on your behalf.

## Strategy Configuration

`SearchStrategyConfigManager` (see `src/core/domain/search/SearchStrategyConfigManager.ts`) stores per-strategy configuration such as timeouts, scoring weights, and cache settings. Use `memori.getAvailableSearchStrategies()` to see what is active, and inspect the configuration manager if you need to adjust priorities or enable/disable strategies at runtime.

## Error Handling and Fallbacks

Strategies instrument their execution with `logInfo`/`logError` calls. When a strategy fails:

1. The failure is logged with the component name `SearchManager`.
2. `SearchManager` selects a fallback (usually LIKE) and re-runs the query.
3. Error statistics are recorded so you can inspect performance later via `getIndexHealthReport`.

Always wrap search calls in try/catch when building production systems:

```typescript
try {
  const results = await memori.searchMemories('customer escalation');
  // ...
} catch (error) {
  // Decide whether to surface the error or retry with relaxed filters
}
```

Armed with this knowledge you can mix and match strategies to suit your use case while staying aligned with the actual implementation inside the repository.
