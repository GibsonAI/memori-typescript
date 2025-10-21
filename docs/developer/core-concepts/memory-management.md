# Memory Management in Memorits

Memorits turns conversations into durable knowledge by piping chat transcripts through `MemoriAI`, the `Memori` core class, and the `MemoryAgent` that performs analysis and classification before hitting SQLite. This document explains the ingestion modes, storage layout, and operational knobs implemented in `src/core`.

## Ingestion Modes

Memorits supports three ingestion styles. Each mode maps to concrete behaviour in `MemoriAI`/`Memori` and can also be controlled through environment variables (`MEMORI_AUTO_INGEST`, `MEMORI_CONSCIOUS_INGEST`).

### Automatic (default)

- Enabled when `mode: 'automatic'` or `MEMORI_AUTO_INGEST=true`.
- `MemoriAI.chat` calls `Memori.recordConversation` immediately after every provider response.
- `Memori.enable()` ensures the providers and database manager are initialised before recording.
- Use for assistants that should remember everything without additional wiring.

### Manual

- Configure with `mode: 'manual'`; the environment flags remain `false`.
- `MemoriAI.chat` does **not** write to memory. You decide which exchanges to persist.
- Call `MemoriAI.recordConversation(userInput, aiOutput, options?)` or drop down to `Memori.recordConversation` directly.
- Ideal when you want to filter or redact information before storing it.

### Conscious

- Enabled with `mode: 'conscious'` or by setting `MEMORI_CONSCIOUS_INGEST=true`.
- Conversations are queued in the database and later promoted into short-term context by `ConsciousAgent`.
- Trigger background work with:

  ```typescript
  const memori = new Memori({ databaseUrl: 'file:./memori.db', mode: 'conscious' });
  await memori.enable();
  await memori.initializeConsciousContext();
  await memori.checkForConsciousContextUpdates();
  ```

- Useful when you want reflective processing or delayed ingestion to control resource usage.

## Storage Layers

All data lives in SQLite tables defined inside `prisma/schema.prisma`. Prisma generates the strongly typed client that backs `DatabaseManager`.

### Short-Term Memory (`short_term_memory`)

Fields to note:

- `searchableContent`, `summary` – preprocessed text used for retrieval.
- `importanceScore`, `categoryPrimary` – numeric score and primary classification.
- `isPermanentContext` – indicates the memory should persist across sessions.
- References the originating conversation through `chatId`.

The `DatabaseManager.storeShortTermMemory` path is used by `ConsciousAgent` when promoting context.

### Long-Term Memory (`long_term_memory`)

Stores the full analysis produced by `MemoryAgent`:

- `classification`, `memoryImportance` – enum-like strings (see `MemoryClassification`, `MemoryImportanceLevel` in `src/core/types/schemas.ts`).
- `entitiesJson`, `keywordsJson`, `relatedMemoriesJson` – serialized metadata for search and relationship traversal.
- `confidenceScore`, `classificationReason` – used to reason about memory quality.
- `consciousProcessed` – toggled once `ConsciousAgent` has copied the memory into short-term context.

### Chat History (`chat_history`)

Every recorded conversation is preserved with `userInput`, `aiOutput`, `model`, and `metadata`. Both short-term and long-term memories reference this table so you can reconstruct the original exchange.

## Processing Pipeline

1. **Conversation capture** – `MemoriAI.chat` or `Memori.recordConversation` receives `userInput`/`aiOutput`.
2. **MemoryAgent** (`src/core/domain/memory/MemoryAgent.ts`) analyses the exchange:
   - generates `summary`
   - classifies importance and category
   - extracts entities/keywords
   - produces consolidated metadata
3. **DatabaseManager** writes to the appropriate tables through `MemoryManager`.
4. **ConsciousAgent** (`src/core/domain/memory/ConsciousAgent.ts`) promotes conscious memories when enabled.

Logs emitted by `Logger.ts` always include the component (e.g., `MemoriAI`, `MemoryAgent`, `ConsciousAgent`) and session identifiers to simplify tracing.

## Working with Modes in Code

```typescript
import { MemoriAI, Memori } from 'memorits';

// Automatic ingestion
const auto = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY ?? 'sk-your-api-key'
});

await auto.chat({
  messages: [{ role: 'user', content: 'Remember that invoices go out on the first business day.' }]
});

// Manual ingestion
const manual = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY ?? 'sk-your-api-key',
  mode: 'manual'
});

await manual.recordConversation(
  'We should not store customer secrets.',
  'Acknowledged – this will be treated as guidance only.',
  { metadata: { policy: true } }
);

// Conscious ingestion
const memori = new Memori({ databaseUrl: 'file:./memori.db', mode: 'conscious' });
await memori.enable();
await memori.initializeConsciousContext();
await memori.checkForConsciousContextUpdates();
```

## Relationship Extraction and Duplication Control

- Relationship extraction is toggled by `enableRelationshipExtraction` (`true` by default in `ConfigManager`).
- Duplicate detection and consolidation live inside `Memori.findDuplicateMemories` and related helpers (see `src/core/Memori.ts` around the 700-line mark). Use them to prevent redundant long-term entries.

```typescript
const duplicates = await memori.findDuplicateMemories('mem_123', { similarityThreshold: 0.75 });
if (duplicates.length > 0) {
  console.log('Potential duplicates:', duplicates.map(d => d.id));
}
```

## Operational Tips

- Keep `namespace` consistent per tenant to isolate memories.
- Run `memori.checkForConsciousContextUpdates()` on an interval when conscious mode is enabled.
- Monitor `memori.getMemoryStatistics()` to keep an eye on short-term vs long-term counts.
- After schema changes run `npm run prisma:push && npm run prisma:generate` before restarting your service.

Understanding these mechanics provides the foundation for more advanced topics such as temporal search, relationship traversal, and consolidation, all of which build directly on this ingestion pipeline.
