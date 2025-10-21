# Temporal Filtering

Temporal filtering enables time-aware lookups, letting you answer questions like “What did we agree on last Friday?” or “Show me decisions from the last three weeks.” This feature is implemented in `TemporalFilterStrategy` (`src/core/domain/search/filtering/TemporalFilterStrategy.ts`) and powered by helper utilities such as `DateTimeNormalizer` and `TemporalPatternMatcher`.

## Using `TemporalFilterOptions`

`TemporalFilterOptions` lives in `src/core/types/models.ts`:

```typescript
interface TemporalFilterOptions {
  timeRanges?: Array<{ start: Date; end: Date }>;
  relativeExpressions?: string[];
  absoluteDates?: Date[];
  patterns?: string[];
}
```

Pass this object to `Memori.searchMemories` when you need time-aware filtering.

```typescript
import { Memori } from 'memorits';

const memori = new Memori({ databaseUrl: 'file:./memori.db' });
await memori.enable();

// Fetch memories from the last 48 hours
const recentDecisions = await memori.searchMemories('deployment', {
  temporalFilters: {
    relativeExpressions: ['last 48 hours']
  },
  includeMetadata: true,
  limit: 20
});
```

## Mixing Time Ranges and Text

You can combine multiple range types for precise filtering:

```typescript
const planningNotes = await memori.searchMemories('planning', {
  temporalFilters: {
    timeRanges: [
      {
        start: new Date('2024-06-01T00:00:00Z'),
        end: new Date('2024-06-15T23:59:59Z')
      }
    ],
    relativeExpressions: ['last quarter']
  },
  categories: ['essential', 'contextual'],
  minImportance: 'medium'
});
```

The strategy evaluates relative expressions first, normalises them with `DateTimeNormalizer`, and then merges them with explicit ranges.

## Shortcut: Recent Memory Helper

`Memori.searchRecentMemories(limit?, includeMetadata?, temporalFilters?, strategy?)` provides a convenience layer over the temporal strategy.

```typescript
const today = await memori.searchRecentMemories(
  10,
  true,
  { relativeExpressions: ['today'] }
);
```

When you only care about recency and not keywords, call this helper with an empty query.

## Natural Language Support

`TemporalFilterStrategy` recognises expressions such as:

- `yesterday`, `last week`, `next month`
- `this Friday at 2pm`, `tomorrow morning`
- `between 2pm and 5pm`, `during business hours`

Behind the scenes, `DateTimeNormalizer` (see `src/core/domain/search/filtering/temporal/DateTimeNormalizer.ts`) parses these phrases into concrete `Date` objects. `TemporalPatternMatcher` analyses free-form questions and extracts the relevant expressions before search execution.

If you need to reuse these helpers directly, import them from the source modules:

```typescript
import { DateTimeNormalizer } from 'memorits/core/domain/search/filtering/temporal/DateTimeNormalizer';

const normalized = DateTimeNormalizer.normalize('2 hours ago');
console.log(normalized.date); // concrete Date instance
```

The direct path import is advanced usage; it relies on project structure remaining stable. For most applications, the `temporalFilters` interface is sufficient.

## Metadata Returned

When `includeMetadata` is true, temporal searches include context such as:

- `metadata.searchStrategy` – usually `temporal_filter` or `recent`.
- `metadata.searchScore` – a normalised relevance value considering recency.
- `metadata.timeRange` – start/end timestamps used for filtering (when available).

Inspect these fields to build timeline visualisations or confirm which filters matched.

## Tips

- Combine temporal filters with `minImportance` or category filters to avoid noisy results.
- When chaining multiple relative expressions, the strategy merges them into a union. Use `timeRanges` for precise control of intersections.
- Schedule regular calls to `memori.searchRecentMemories` to populate dashboards or daily summaries.

Temporal filtering is an integral part of the search architecture, and the same options used here power the broader strategy orchestration described in `core-concepts/search-strategies.md`.
