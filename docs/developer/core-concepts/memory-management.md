# Memory Management in Memorits

Memorits turns conversations into durable knowledge by piping chat transcripts through `MemoriAI`, the `Memori` core class, and the `MemoryAgent` that performs analysis and classification before hitting SQLite. This document explains the ingestion modes, storage layout, and operational knobs implemented in `src/core`.

## Ingestion Modes

Memorits supports three ingestion styles. Each mode maps to concrete behaviour in `MemoriAI`/`Memori` and can also be controlled through environment variables (`MEMORI_AUTO_INGEST`, `MEMORI_CONSCIOUS_INGEST`).

### Automatic (default)

- Enabled when `mode: 'automatic'` or `MEMORI_AUTO_INGEST=true`.
- `MemoriAI.chat` uses its configured provider for inference and, in `mode: 'automatic'`, enables `Memori` (if needed) and calls `Memori.recordConversation` to persist the exchange ([`MemoriAI.chat`](src/core/MemoriAI.ts:97)).
- `Memori` maps `mode` → `autoIngest` / `consciousIngest` in its constructor and `enable()` ensures providers and `DatabaseManager` are initialised before ingestion ([`Memori`](src/core/Memori.ts:36), [`Memori.enable`](src/core/Memori.ts:174)).
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

Short-term memory promotion is handled via `ConsciousMemoryManager` and related helpers composed inside `DatabaseManager` (see conscious memory methods in [`DatabaseManager`](src/core/infrastructure/database/DatabaseManager.ts:741)).

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

- Relationship extraction is toggled by `enableRelationshipExtraction` (default comes from `MEMORI_ENABLE_RELATIONSHIP_EXTRACTION`, see [`ConfigManager`](src/core/infrastructure/config/ConfigManager.ts:56)).
- Duplicate detection is exposed via `Memori.findDuplicateMemories` (delegating to `DuplicateManager` through `DatabaseManager`) ([`Memori.findDuplicateMemories`](src/core/Memori.ts:735)). Use this high-level API instead of relying on internal services.

```typescript
const duplicates = await memori.findDuplicateMemories('mem_123', { similarityThreshold: 0.75 });
if (duplicates.length > 0) {
  console.log('Potential duplicates:', duplicates.map(d => d.id));
}
```

## Public Memory Update & Relationship APIs

Memorits exposes stable, additive APIs for precise memory corrections, relationship management, and curator-style delta application without reaching into internal managers.

### Updating Existing Memories

Use `Memori.updateMemory` to apply controlled updates to an existing long-term memory:

```typescript
import { Memori, type UpdateMemoryInput } from 'memorits';

const memori = new Memori({
  databaseUrl: 'file:./memori.db',
  namespace: 'my-app'
});
await memori.enable();

const ok = await memori.updateMemory('memory-id', <UpdateMemoryInput>{
  content: 'Corrected content for this memory',
  tags: ['curated', 'reviewed'],
  metadata: {
    curator: 'analyst-123',
    reason: 'factual correction'
  }
});

if (!ok) {
  // Not found, namespace mismatch, or concurrency/validation condition not met
}
```

Key points:

- Only documented fields are updatable (`content`, `title`, `tags`, `importance`, `metadata`).
- Implementation handles validation and persistence internally.
- Callers never depend on Prisma models or table/column names.

### Managing Relationships

To declare or refine explicit relationships between memories, use `Memori.updateMemoryRelationships`:

```typescript
import {
  Memori,
  type UpdateMemoryRelationshipsInput
} from 'memorits';

const input: UpdateMemoryRelationshipsInput = {
  sourceId: 'policy-memory-id',
  namespace: 'my-app',
  relations: [
    {
      targetId: 'runbook-memory-id',
      type: 'references',
      strength: 0.9,
      metadata: { source: 'curator' }
    }
  ]
};

const result = await memori.updateMemoryRelationships(input);

if (result.errors.length) {
  console.error('Relationship update issues:', result.errors);
}
```

Helpers for duplicate and supersedence semantics:

```typescript
// Mark one memory as a duplicate of another
await memori.markAsDuplicate('duplicate-id', 'original-id', { namespace: 'my-app' });

// Declare that one memory supersedes another
await memori.setSupersedes('primary-id', 'superseded-id', { namespace: 'my-app' });
```

These functions are thin public wrappers; they keep relationship semantics stable while allowing internal implementations to evolve.

### Delta Application for Curator Pipelines

For systems that compute batches of corrections, refinements, and relationships, use `Memori.applyDeltas`:

```typescript
import { Memori, type DeltaInput } from 'memorits';

const deltas: DeltaInput[] = [
  {
    type: 'note',
    content: 'SRE runbook updated for incident classification.',
    tags: ['sre', 'runbook']
  },
  {
    type: 'correction',
    targetId: 'memory-123',
    content: 'Updated recovery time objective (RTO) is 30 minutes.',
    metadata: { source: 'architecture-review' }
  },
  {
    type: 'relationship',
    relationship: {
      sourceId: 'policy-memory-id',
      targetId: 'runbook-memory-id',
      type: 'references',
      strength: 0.8
    }
  }
];

const result = await memori.applyDeltas(deltas, {
  continueOnError: true,
  defaultNamespace: 'my-app'
});

console.log('Applied deltas:', result.applied);
if (result.failed.length) {
  console.warn('Failed deltas:', result.failed);
}
```

Behavior:

- Routes to:
  - `recordConversation` for note-like deltas,
  - `updateMemory` for corrections/refinements,
  - `updateMemoryRelationships` for relationship entries.
- Returns both `applied` IDs and detailed `failed` entries for auditability.
- Designed for stable external integrations.

## Operational Tips

- Keep `namespace` consistent per tenant to isolate memories.
- Run `memori.checkForConsciousContextUpdates()` on an interval when conscious mode is enabled.
- Monitor `memori.getMemoryStatistics()` to keep an eye on short-term vs long-term counts.
- After schema changes run `npm run prisma:push && npm run prisma:generate` before restarting your service.

Understanding these mechanics and the public update APIs provides the foundation for advanced features such as temporal search, relationship traversal, consolidation, and curator pipelines built on top of Memorits.
