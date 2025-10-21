# Basic Usage Guide

This guide walks through the day-to-day operations you will perform with Memorits. It is grounded in the exact APIs exported from `src/index.ts`, so every snippet below compiles against the library in this repository.

## 1. Core workflow with `MemoriAI`

```typescript
import { MemoriAI } from 'memorits';

const ai = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY ?? 'sk-your-api-key',
  provider: 'openai',          // optional – detected from key when omitted
  model: 'gpt-4o-mini',
  mode: 'automatic',
  namespace: 'customer-support'
});

const reply = await ai.chat({
  messages: [
    { role: 'user', content: 'Remember that the deployment window is Friday afternoon.' }
  ],
  temperature: 0.2
});

console.log(reply.message.content);
```

- In **automatic mode**, `MemoriAI.chat` records each exchange by calling `Memori.recordConversation`.
- Use `namespace` to partition memories per team, tenant, or environment.

### Searching stored memories

```typescript
const matches = await ai.searchMemories('deployment window', {
  limit: 5,
  minImportance: 'medium',
  includeMetadata: true
});

matches.forEach(memory => {
  console.log(`${memory.summary} -> ${memory.importance}`);
});
```

The `MemoriAI` search options mirror the `SearchOptions` interface in `src/core/MemoriAIConfig.ts`:

```typescript
type MemoriAISearchOptions = {
  namespace?: string;
  limit?: number;
  includeMetadata?: boolean;
  minImportance?: 'low' | 'medium' | 'high' | 'critical';
  categories?: string[];
  sortBy?: { field: string; direction: 'asc' | 'desc' };
  offset?: number;
};
```

### Manual mode

```typescript
const manual = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY ?? 'sk-your-api-key',
  mode: 'manual'
});

const chatId = await manual.recordConversation(
  'The API key rotates monthly.',
  'Stored: API key rotates monthly.',
  { metadata: { topic: 'security' } }
);

console.log(`Manual record saved as ${chatId}`);
```

Manual mode avoids auto-recording so you decide which exchanges persist.

### Clean shutdown

```typescript
await ai.close();
```

Always dispose providers and database connections when you are done.

## 2. Switching to advanced control with `Memori`

The `Memori` class exposes the complete set of capabilities implemented under `src/core/Memori.ts`: advanced search filters, index health, conscious ingestion utilities, and maintenance helpers.

```typescript
import { Memori, SearchStrategy } from 'memorits';

const memori = new Memori({
  databaseUrl: 'file:./memori.db',
  mode: 'conscious',
  namespace: 'customer-support'
});

await memori.enable();
```

### Temporal and metadata filtering

```typescript
const temporal = await memori.searchMemories('deployment', {
  limit: 10,
  temporalFilters: {
    relativeExpressions: ['last 14 days']
  },
  metadataFilters: {
    fields: [
      { key: 'metadata.topic', operator: 'eq', value: 'operations' }
    ]
  },
  includeMetadata: true
});
```

The advanced `SearchOptions` in `src/core/types/models.ts` add fields such as `temporalFilters`, `metadataFilters`, `filterExpression`, `includeRelatedMemories`, and `maxRelationshipDepth`. Use `Memori` when you need those controls.

### Strategy-specific search

```typescript
const recents = await memori.searchMemoriesWithStrategy(
  '',
  SearchStrategy.RECENT,
  { limit: 15, includeMetadata: true }
);
```

`SearchStrategy` enumerates `fts5`, `like`, `recent`, `semantic`, `category_filter`, `temporal_filter`, `metadata_filter`, and `relationship`. These values map directly to the strategy implementations under `src/core/domain/search`.

### Recent memory helper

```typescript
const today = await memori.searchRecentMemories(
  10,
  true,
  {
    relativeExpressions: ['today']
  }
);
```

`searchRecentMemories(limit?, includeMetadata?, temporalFilters?, strategy?)` is available on `Memori` only. Internally it falls back to the temporal strategy when a filter is supplied.

### Conscious processing utilities

```typescript
await memori.initializeConsciousContext();
await memori.checkForConsciousContextUpdates();
```

These methods wrap `ConsciousAgent` (see `src/core/domain/memory/ConsciousAgent.ts`) and are useful when `mode: 'conscious'` or the environment flag `MEMORI_CONSCIOUS_INGEST=true` enables background promotion of important memories.

## 3. Understanding search results

Both `MemoriAI` and `Memori` return the `MemorySearchResult` structure defined in `src/core/types/models.ts`:

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

- `metadata` is only populated when you request it (`includeMetadata: true`). Expect keys such as `searchScore`, `searchStrategy`, `memoryType`, and importance scores.
- There is no standalone `score` property; use `metadata.searchScore` when a strategy calculates one, or rely on `confidenceScore`.

## 4. Maintenance routines

The `Memori` instance gives you access to database maintenance helpers implemented in `src/core/Memori.ts`:

```typescript
const stats = await memori.getMemoryStatistics();
const strategies = await memori.getAvailableSearchStrategies();
const health = await memori.getIndexHealthReport();
const optimized = await memori.optimizeIndex();       // defaults to full optimization
const backup = await memori.createIndexBackup();
```

Use these in background jobs or admin dashboards to keep the search index healthy.

## 5. Putting it together

```typescript
import { MemoriAI, Memori } from 'memorits';

const ai = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY ?? 'sk-your-api-key',
  namespace: 'support'
});

await ai.chat({
  messages: [{ role: 'user', content: 'Remember that renewals close on the 25th.' }]
});

const quickLookup = await ai.searchMemories('renewals', { limit: 3 });

const memori = new Memori({ databaseUrl: 'file:./memori.db' });
await memori.enable();

const deepLookup = await memori.searchMemories('renewals', {
  limit: 10,
  temporalFilters: { relativeExpressions: ['next 30 days'] },
  includeMetadata: true
});

await ai.close();
await memori.close();
```

Reach for `MemoriAI` when you want a concise, batteries-included interface; drop down to `Memori` when you need surgical control over ingestion, search, or index management. Both layers share the same database and provider infrastructure, so you can mix them freely within a project.
