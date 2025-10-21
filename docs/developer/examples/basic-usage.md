# Basic Usage Examples

These examples demonstrate common patterns using the public API surfaces described in the reference docs.

## 1. Recording and recalling information with `MemoriAI`

```typescript
import { MemoriAI } from 'memorits';

const ai = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY ?? 'sk-your-api-key',
  provider: 'openai',
  model: 'gpt-4o-mini'
});

await ai.chat({
  messages: [
    { role: 'user', content: 'Please remember that the quarterly review is on June 15th.' }
  ]
});

const matches = await ai.searchMemories('quarterly review', { limit: 5 });
matches.forEach(memory => {
  console.log(memory.summary, memory.importance);
});

await ai.close();
```

## 2. Manual ingestion workflow

```typescript
const manual = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY ?? 'sk-your-api-key',
  mode: 'manual'
});

const chatId = await manual.recordConversation(
  'We deploy every Friday at 4pm PST.',
  'Confirmed, weekly Friday deployments.',
  { metadata: { topic: 'operations' } }
);

console.log(`Conversation recorded as ${chatId}`);
```

## 3. Advanced search with `Memori`

```typescript
import { Memori, SearchStrategy } from 'memorits';

const memori = new Memori({ databaseUrl: 'file:./memori.db', namespace: 'support' });
await memori.enable();

const filtered = await memori.searchMemories('deployment', {
  minImportance: 'medium',
  temporalFilters: { relativeExpressions: ['last 30 days'] },
  metadataFilters: {
    fields: [{ key: 'metadata.topic', operator: 'eq', value: 'operations' }]
  },
  includeMetadata: true
});

const relationships = await memori.searchMemoriesWithStrategy(
  'deployment',
  SearchStrategy.RELATIONSHIP,
  { includeMetadata: true }
);

await memori.close();
```

## 4. Conscious mode maintenance

```typescript
const conscious = new Memori({
  databaseUrl: 'file:./memori.db',
  mode: 'conscious'
});

await conscious.enable();
await conscious.initializeConsciousContext();
await conscious.checkForConsciousContextUpdates();
```

## 5. Consolidation analytics

```typescript
const service = memori.getConsolidationService();

const analytics = await service.getConsolidationAnalytics();
console.log(`Duplicates pending: ${analytics.duplicateCount}`);

const recommendations = await service.getOptimizationRecommendations();
recommendations.recommendations.forEach(rec => {
  console.log(`[${rec.priority}] ${rec.description}`);
});
```

These snippets are intentionally lightweight—compose them into classes or services that suit your application architecture. Refer to the core documentation for additional options and error handling patterns.
