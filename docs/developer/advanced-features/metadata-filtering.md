# Metadata Filtering

Metadata filtering lets you target memories using structured fields instead of (or in addition to) free text. It is implemented by `MetadataFilterStrategy` in `src/core/domain/search/filtering/MetadataFilterStrategy.ts` and configured through the `metadataFilters` field on `SearchOptions`.

## Metadata Filter Options

The type in `src/core/types/models.ts` is intentionally compact:

```typescript
interface MetadataFilterOptions {
  fields?: Array<{
    key: string;
    value: unknown;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'like';
  }>;
}
```

Each filter entry describes a field within the stored metadata (dot notation is supported for nested values), the comparison operator, and the value to match.

## Basic Usage

```typescript
import { Memori } from 'memorits';

const memori = new Memori({ databaseUrl: 'file:./memori.db' });
await memori.enable();

const byModel = await memori.searchMemories('', {
  metadataFilters: {
    fields: [
      { key: 'metadata.model', operator: 'eq', value: 'gpt-4o-mini' },
      { key: 'metadata.provider', operator: 'eq', value: 'openai' }
    ]
  },
  includeMetadata: true,
  limit: 25
});
```

In this example the filter reads from the `metadata` object stored alongside each memory (populated when you pass metadata via `recordConversation` or when providers add annotations during processing).

## Combining Operators

```typescript
const filtered = await memori.searchMemories('incident', {
  metadataFilters: {
    fields: [
      { key: 'metadata.importanceScore', operator: 'gte', value: 0.7 },
      { key: 'metadata.category', operator: 'in', value: ['operations', 'security'] },
      { key: 'metadata.hasEntities', operator: 'eq', value: true }
    ]
  },
  limit: 10,
  includeMetadata: true
});
```

Use `in` for array membership, `contains`/`like` for string matching, and the numeric comparison operators for scores or counters.

## Nested Fields

Dot notation traverses nested metadata safely. The strategy sanitises keys and values before building the SQL query.

```typescript
const nested = await memori.searchMemories('', {
  metadataFilters: {
    fields: [
      { key: 'user.preferences.theme', operator: 'eq', value: 'dark' },
      { key: 'context.account.tier', operator: 'eq', value: 'enterprise' }
    ]
  }
});
```

Ensure your metadata structure is consistent to avoid unexpected `undefined` comparisons.

## Advanced Expressions

For more complex scenarios, combine metadata filters with `filterExpression` (handled by `AdvancedFilterEngine`). This lets you mix logical operators in a single expression.

```typescript
const advanced = await memori.searchMemories('', {
  filterExpression: 'metadata.importanceScore >= 0.8 AND metadata.topic = "roadmap"',
  includeMetadata: true
});
```

The expression parser supports `AND`, `OR`, `NOT`, comparison operators (`=`, `!=`, `>`, `>=`, `<`, `<=`), and string literals in double quotes.

## Tips

- Metadata filters are case-sensitive because the underlying JSON is stored as-is. Normalise values when writing metadata if you need case-insensitive searches.
- Combine metadata filters with text search or temporal filters to reduce the candidate set before applying advanced logic.
- `includeMetadata: true` is useful to inspect which fields triggered your filters and to debug data quality issues.
- If you routinely filter on the same metadata keys, consider storing denormalised values (`categoryPrimary`, `importanceScore`) to leverage existing indexes.

Metadata filtering is a core part of Memorits’ search capabilities and works in concert with the other strategies described in `core-concepts/search-strategies.md`.
