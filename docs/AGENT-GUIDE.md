# Memorits Agent Integration Guide

This guide summarizes how to wire AI agents into the Memorits memory layer using the production APIs shipped in this repository.

## 1. Architecture at a Glance
- **MemoriAI** – convenience facade (`chat`, `searchMemories`, `createEmbeddings`, etc.). Best for agent frameworks that just need a persistent memory companion.
- **Memori** – advanced API with explicit lifecycle control, strategy selection, consolidation, and index maintenance.
- **MemoryAgent** – transforms conversations into long- and short-term memories via `DatabaseManager`. You rarely call it directly; understand the flow for debugging.
- **Search stack** – `SearchManager` + `SearchService` orchestrate FTS5, LIKE, recent, temporal, metadata, and relationship strategies with automatic fallbacks.
- **Providers** – OpenAI, Anthropic, and Ollama are normalized through `LLMProviderFactory`. Share the same memory configuration regardless of vendor.

## 2. Getting Started
```bash
npm install memorits
```

```typescript
import { MemoriAI } from 'memorits';

const ai = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY ?? 'sk-your-api-key',
  provider: 'openai',          // or 'anthropic', 'ollama'
  model: 'gpt-4o-mini',
  mode: 'automatic',
  namespace: 'agent-demo'
});
```

Environment variables worth exporting:
```
DATABASE_URL=file:./memori.db
MEMORI_NAMESPACE=default
MEMORI_AUTO_INGEST=true
MEMORI_CONSCIOUS_INGEST=false
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_BASE_URL=http://localhost:11434/v1   # for Ollama
```

Run the Prisma sequence (`npm run prisma:push` then `npm run prisma:generate`) whenever the schema changes or when setting up a fresh environment.

## 3. Recording Conversations
`MemoriAI` calls `Memori.recordConversation` for you in automatic mode. Use manual mode when you need explicit control.

```typescript
const chat = await ai.chat({
  messages: [{ role: 'user', content: 'Please remember that the offsite is 12 July.' }]
});

console.log(chat.message.content);
```

Manual ingestion:
```typescript
const manual = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY!,
  mode: 'manual'
});

await manual.recordConversation(
  'Deployments happen on Fridays.',
  'Acknowledged – Friday deployments noted.',
  { metadata: { topic: 'ops' } }
);
```

## 4. Searching Memory
```typescript
const quick = await ai.searchMemories('deployments', { limit: 5 });

const advanced = await memori.searchMemories('deployments', {
  limit: 10,
  includeMetadata: true,
  minImportance: 'medium',
  temporalFilters: { relativeExpressions: ['last 30 days'] },
  metadataFilters: {
    fields: [{ key: 'metadata.topic', operator: 'eq', value: 'ops' }]
  }
});
```

Use `memori.searchMemoriesWithStrategy(query, SearchStrategy.RELATIONSHIP, options)` to force specific strategies, and `memori.searchRecentMemories(limit, includeMetadata, temporalFilters)` for recency-driven lookups.

## 5. Memory Modes
- **automatic** – `chat` stores memory immediately (default).
- **manual** – you call `recordConversation` manually; useful when filtering sensitive data first.
- **conscious** – ingestion runs in the background; call `initializeConsciousContext()` and `checkForConsciousContextUpdates()` on a schedule.

Switch modes via config or `MEMORI_AUTO_INGEST` / `MEMORI_CONSCIOUS_INGEST`.

## 6. Working with Providers
Use the provider factory when you need direct control or want to mix vendors with the same memory store.

```typescript
import { LLMProviderFactory, ProviderType } from 'memorits';

const provider = await LLMProviderFactory.createProvider(ProviderType.ANTHROPIC, {
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20241022',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto',
    sessionId: 'anthropic-agent'
  }
});
```

Ollama specifics: set `apiKey` to `ollama-local` and `baseUrl` to the OpenAI-compatible endpoint (e.g. `http://localhost:11434/v1`).

## 7. Duplicate Handling & Maintenance
- `memori.findDuplicateMemories(content, { similarityThreshold })` surfaces likely duplicates.
- `const service = memori.getConsolidationService();` exposes detection, preview, consolidate, rollback, and analytics helpers.
- Index maintenance lives on `memori.getIndexHealthReport()`, `memori.optimizeIndex()`, and `memori.createIndexBackup()`.

## 8. Logging & Observability
`logInfo/logError` require `component`. Common values:
- `MemoriAI`, `Memori`
- `SearchManager`, `SearchService`
- `DatabaseManager`, `DuplicateManager`, `ConsciousAgent`

Include identifiers such as `sessionId`, `namespace`, `chatId`, and operation names to keep logs actionable.

## 9. Troubleshooting
- **Memories missing** – confirm `enable()` was called (for `Memori`), the mode is `automatic`, and the DB path is writable.
- **Search empty** – make sure FTS5 is available or rely on the LIKE fallback; check `includeMetadata` to inspect strategy metadata.
- **Provider errors** – verify keys, base URLs, and network access; call `provider.isHealthy()` for diagnostics.
- **Prisma errors** – re-run `npm run prisma:push && npm run prisma:generate` after schema changes.

## 10. Where to Look Next
- Developer docs under `docs/developer/` (API reference, advanced features, provider guides).
- Source of truth for public exports: `src/index.ts`.
- OpenAI drop-in implementation: `integrations/openai-dropin/`.

Stick to these patterns and your agents will benefit from durable, searchable memory without reinventing the storage layer.***
