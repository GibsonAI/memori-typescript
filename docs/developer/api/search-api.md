# Search API Reference

This reference documents the advanced search API backed by `Memori` and `SearchService`. It describes the `SearchOptions` type, available strategies, and sample queries grounded in the implementation under `src/core/domain/search`.

## Search Options (`src/core/types/models.ts`)

```typescript
interface SearchOptions {
  namespace?: string;
  limit?: number;
  includeMetadata?: boolean;

  minImportance?: MemoryImportanceLevel;
  categories?: MemoryClassification[];
  temporalFilters?: TemporalFilterOptions;
  metadataFilters?: MetadataFilterOptions;

  sortBy?: { field: string; direction: 'asc' | 'desc' };
  offset?: number;

  strategy?: SearchStrategy;
  timeout?: number;
  enableCache?: boolean;

  filterExpression?: string;
  includeRelatedMemories?: boolean;
  maxRelationshipDepth?: number;
}
```

Pass this structure to `Memori.searchMemories` or `Memori.searchMemoriesWithStrategy`.

## Strategies (`SearchStrategy` enum)

```typescript
enum SearchStrategy {
  FTS5 = 'fts5',
  LIKE = 'like',
  RECENT = 'recent',
  SEMANTIC = 'semantic',            // placeholder for future vector search backends
  CATEGORY_FILTER = 'category_filter',
  TEMPORAL_FILTER = 'temporal_filter',
  METADATA_FILTER = 'metadata_filter',
  RELATIONSHIP = 'relationship'
}
```

Use `Memori.searchMemoriesWithStrategy(query, SearchStrategy.FTS5, options)` to force a specific path; otherwise the search layer selects one automatically.

## Examples

### Importance and Category Filters

```typescript
const important = await memori.searchMemories('roadmap', {
  minImportance: 'high',
  categories: ['essential', 'reference'],
  includeMetadata: true,
  limit: 20
});
```

### Temporal Filters

```typescript
const recentUpdates = await memori.searchMemories('launch', {
  temporalFilters: {
    relativeExpressions: ['last 14 days']
  },
  limit: 15
});
```

`TemporalFilterOptions` supports `timeRanges`, `relativeExpressions`, `absoluteDates`, and `patterns`. Combine them as needed.

### Metadata Filters

```typescript
const billingNotes = await memori.searchMemories('', {
  metadataFilters: {
    fields: [
      { key: 'metadata.topic', operator: 'eq', value: 'billing' },
      { key: 'metadata.importanceScore', operator: 'gte', value: 0.7 }
    ]
  },
  includeMetadata: true,
  limit: 10
});
```

Supported operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `like`.

### Filter Expressions

```typescript
const filtered = await memori.searchMemories('', {
  filterExpression: 'importance_score >= 0.7 AND category = "essential"',
  limit: 25
});
```

`filterExpression` uses the `AdvancedFilterEngine` parser and accepts SQL-like syntax with `AND`, `OR`, `NOT`, comparison operators, and quoted string literals.

### Relationship Search

```typescript
const related = await memori.searchMemories('incident response', {
  includeRelatedMemories: true,
  maxRelationshipDepth: 2,
  includeMetadata: true
});
```

When `includeRelatedMemories` is true the relationship strategy augments results with linked memories captured by `MemoryAgent`.

### Recent Helper

```typescript
const recent = await memori.searchRecentMemories(
  10,
  true,
  { relativeExpressions: ['today'] }
);
```

This convenience method maps to the temporal strategy internally.

## Result Structure (`MemorySearchResult`)

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

- `metadata.searchStrategy` identifies the strategy used when `includeMetadata` is true.
- `metadata.searchScore` contains the raw score emitted by the strategy (when available).
- `confidenceScore` is the value stored with the memory, not necessarily the search similarity.

## Error Handling

- Invalid search options trigger `ValidationError` from `SearchManager`.
- When a primary strategy fails, a fallback strategy runs automatically; errors are logged via `SearchManager`.
- Explicit strategy calls (`searchMemoriesWithStrategy`) throw if the strategy is unknown or unavailable.

## Performance Tips

- Use namespaces to segment tenants and avoid scanning unrelated data.
- Set `limit` to a reasonable number—strategies cap results at 100 by default.
- Include metadata only when needed to reduce payload size.
- Combine `filterExpression` with `temporalFilters` to narrow result sets before they reach the relationship strategy.

For more context on how strategies work together, see `core-concepts/search-strategies.md` and `architecture/search-architecture.md`.
