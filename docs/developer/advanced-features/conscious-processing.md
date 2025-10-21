# Conscious Processing

Conscious processing mimics reflective reasoning: important memories are promoted into short-term context so future conversations start with richer knowledge. This capability is handled by `ConsciousAgent` (`src/core/domain/memory/ConsciousAgent.ts`) and orchestrated through `Memori`.

## Enabling Conscious Mode

Set `mode: 'conscious'` when constructing `Memori` or `MemoriAI`, or enable it globally via `MEMORI_CONSCIOUS_INGEST=true`.

```typescript
import { Memori } from 'memorits';

const memori = new Memori({
  databaseUrl: 'file:./memori.db',
  mode: 'conscious',
  namespace: 'research-assistant'
});

await memori.enable();
```

In conscious mode, conversations are stored first, then analysed in batches by the agent so processing can happen off the critical path.

## Initialising Context

Call `initializeConsciousContext()` to load previously processed memories into short-term storage.

```typescript
await memori.initializeConsciousContext();
```

This populates short-term memory rows from existing long-term entries flagged as `conscious-info`.

## Updating Context

Trigger the background processing loop with `checkForConsciousContextUpdates()`:

```typescript
await memori.checkForConsciousContextUpdates();
```

This method:

- Retrieves new `conscious-info` memories from long-term storage.
- Copies them into short-term memory for quick access.
- Updates processing state via `MemoryProcessingStateManager`.
- Logs promotions with component `ConsciousAgent`.

Run it on an interval (e.g., cron job or background worker) when conscious mode is active.

## Duplicate Cleanup

Conscious mode exposes a helper for duplicate consolidation:

```typescript
const consolidation = await memori['consciousAgent']?.consolidateDuplicates({
  similarityThreshold: 0.8,
  dryRun: false,
  batchSize: 20
});

if (consolidation) {
  console.log(`Processed ${consolidation.totalProcessed} memories`);
}
```

This calls into `DuplicateManager` to detect highly similar conscious memories and consolidate them (optionally in dry-run mode). Because the agent is a private property, advanced scripts access it via bracket notation; a public facade is on the roadmap.

## State Tracking

`MemoryProcessingStateManager` tracks transitions across stages:

- `PENDING` → `PROCESSING` → `PROCESSED`
- `CONSCIOUS_PENDING` → `CONSCIOUS_PROCESSING` → `CONSCIOUS_PROCESSED`
- Duplicate and consolidation states (`DUPLICATE_CHECK_PENDING`, `CONSOLIDATED`, etc.)

Transition history is stored inside each memory’s `processedData` JSON payload. Invalid transitions raise descriptive errors to keep workflows sound.

## Best Practices

- **Batch the updates**: call `checkForConsciousContextUpdates` on a schedule that matches your workload (e.g., every few minutes for chatbots, hourly for reporting tools).
- **Monitor logs**: structured logs show promoted memory IDs, namespace, and similarity scores. Pipe them to your observability stack to confirm behaviour.
- **Dry run duplicate consolidation**: set `dryRun: true` until you understand the impact.
- **Adjust metadata**: memories classified as `conscious-info` with high importance are prioritised. Ensure your prompts encourage the MemoryAgent to apply that classification when appropriate.

Conscious processing sits on top of the same ingestion pipeline as automatic mode; it simply stages the work so you can balance latency against thorough analysis.
