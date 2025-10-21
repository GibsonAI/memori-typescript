# Memori API Patterns

`Memori` is the full-featured core class that powers Memorits. This guide complements the core API reference by showing canonical workflows built on top of its methods.

## Enabling and Shutting Down

```typescript
import { Memori } from 'memorits';

const memori = new Memori({
  databaseUrl: 'file:./memori.db',
  mode: 'automatic',
  namespace: 'assistant'
});

await memori.enable();
// ... perform operations ...
await memori.close();
```

Always call `enable()` before interacting with the instance and `close()` when shutting down your application.

## Manual Conversation Recording

```typescript
const chatId = await memori.recordConversation(
  'Remember that invoices go out on the 5th.',
  'Acknowledged. I will remind you before the 5th.',
  {
    metadata: {
      topic: 'billing',
      importanceScore: 0.8
    }
  }
);
```

This method stores the exchange, runs it through `MemoryAgent`, and persists the resulting memories.

## Advanced Search

```typescript
import { SearchStrategy } from 'memorits/core/domain/search/types';

const results = await memori.searchMemories('billing reminder', {
  limit: 10,
  includeMetadata: true,
  minImportance: 'medium',
  temporalFilters: { relativeExpressions: ['last 30 days'] },
  metadataFilters: {
    fields: [
      { key: 'metadata.topic', operator: 'eq', value: 'billing' }
    ]
  },
  filterExpression: 'importanceScore >= 0.7'
});

const relationshipResults = await memori.searchMemoriesWithStrategy(
  'billing reminder',
  SearchStrategy.RELATIONSHIP,
  { includeMetadata: true }
);
```

The advanced `SearchOptions` type enables temporal filters, metadata filters, filter expressions, strategy overrides, and relationship traversal.

## Recent Memory Helper

```typescript
const today = await memori.searchRecentMemories(
  5,
  true,
  { relativeExpressions: ['today'] }
);
```

Returns the most recent memories, optionally combining temporal filters and metadata.

## Conscious Processing

```typescript
await memori.initializeConsciousContext();
await memori.checkForConsciousContextUpdates();
```

Call these helpers when running in conscious mode to promote important memories into short-term context.

## Duplicate Handling

```typescript
const potentialDupes = await memori.findDuplicateMemories(
  'Invoices must be sent before the 5th of each month.',
  { similarityThreshold: 0.8, limit: 5 }
);

const consolidationService = memori.getConsolidationService();
const recommendations = await consolidationService.getOptimizationRecommendations();
```

Use `findDuplicateMemories` for quick checks and the consolidation service for full duplicate workflows (analytics, scheduling, consolidation).

## Index Maintenance

```typescript
const health = await memori.getIndexHealthReport();
console.log(health.recommendations);

await memori.optimizeIndex(); // defaults to merge

const backup = await memori.createIndexBackup();
await memori.restoreIndexFromBackup(backup.id);
```

These methods proxy `SearchIndexManager`, making it simple to maintain the FTS index.

## Statistics

```typescript
const stats = await memori.getMemoryStatistics();
console.log(stats.totalMemories, stats.longTermMemories);

const detailed = await memori.getDetailedMemoryStatistics();
console.log(detailed.importanceBreakdown);
```

Statistics help monitor ingestion health and memory distribution.

## Provider Access

For advanced scenarios where you need direct control of providers, fetch the underlying instances after `enable()`:

```typescript
const consolidationService = memori.getConsolidationService();
const providers = memori['userProvider']; // internal access; wrap in your own service for stability
```

Direct property access is considered advanced usage and may change; prefer higher-level methods when possible.

## Error Handling

Wrap calls in `try/catch`. Many operations throw domain-specific errors when prerequisites are not met (e.g., calling before `enable()`, invalid search options, consolidation validation failures).

```typescript
try {
  await memori.searchMemories('query');
} catch (error) {
  console.error('Search failed', error);
}
```

Use the structured logging emitted by `Memori` and related services to correlate failures with specific components (`DuplicateManager`, `SearchManager`, etc.).

This guide should help you compose `Memori` operations into robust workflows. For lower-level details, read through the source files referenced above or explore the `advanced-features/` documents.
