# Duplicate Management

Memorits includes tooling to surface and manage duplicate memories so your knowledge base stays concise. The functionality lives in `DuplicateManager` (`src/core/infrastructure/database/DuplicateManager.ts`) and is surfaced through `Memori` and `ConsciousAgent`.

## Finding Potential Duplicates

`Memori.findDuplicateMemories` wraps the duplicate detection pipeline. It compares supplied content against existing memories using Jaccard and trigram similarity metrics.

```typescript
import { Memori } from 'memorits';

const memori = new Memori({ databaseUrl: 'file:./memori.db' });
await memori.enable();

const duplicates = await memori.findDuplicateMemories(
  'The offsite is scheduled for the first week of June.',
  {
    similarityThreshold: 0.75,
    limit: 10,
    namespace: 'support'
  }
);

duplicates.forEach(match => {
  console.log(`${match.summary} (similarity ${match.metadata?.searchScore ?? 0})`);
});
```

Behind the scenes `DuplicateManager`:

- Runs a text search via `SearchManager` to obtain candidate memories.
- Calculates combined similarity scores (token overlap + character n-grams).
- Filters results above the requested threshold.
- Emits structured logs (`component: DuplicateManager`) so you can trace detection.

## Conscious Context Consolidation

When conscious mode is enabled you can trigger duplicate clean-up through `ConsciousAgent`. `Memori` invokes it internally, but you can call it manually for batch jobs:

```typescript
await memori.initializeConsciousContext();

const consolidation = await memori['consciousAgent']?.consolidateDuplicates({
  similarityThreshold: 0.8,
  dryRun: true
});

if (consolidation) {
  console.log(`Analysed ${consolidation.totalProcessed} memories, found ${consolidation.duplicatesFound} potential duplicates.`);
}
```

> **Note:** `consciousAgent` is a private property; use TypeScript index access as shown only in controlled scripts. A public wrapper is planned in the API surface.

The consolidation run:

- Validates that the primary memory exists and is not already being consolidated.
- Estimates memory usage and captures basic performance statistics.
- Can run in `dryRun` mode to preview results.

## Supporting Utilities

`DuplicateManager` also exposes helper methods:

- `calculateContentSimilarity(a, b)` – returns a score between 0 and 1. Useful for manual checks.
- `detectDuplicateCandidates(namespace, { minSimilarity, limit })` – scans recent memories for likely duplicates without needing an explicit query.
- `validateConsolidationSafety(primaryId, duplicateIds)` – ensures memories exist and are in an appropriate state for consolidation.
- `getConsolidationHistory(namespace?)` – returns an in-memory log of previous operations performed during the current process lifetime.

Import them directly when you need finer control:

```typescript
import { DuplicateManager } from 'memorits/core/infrastructure/database/DuplicateManager';
```

As with other internal imports, this path is subject to change until a public facade is provided.

## Practical Workflow

1. Use `findDuplicateMemories` when ingesting new information to alert users about potential duplicates.
2. Schedule a periodic conscious consolidation run (`consolidateDuplicates`) if conscious mode is enabled.
3. Log or review similarity scores above a manual threshold before deleting or merging content.
4. Consider storing references in memory metadata (e.g., `metadata.relatedIds`) when a duplicate is intentionally retained.

Duplicate detection is designed to be conservative: it surfaces likely matches without deleting anything automatically. This keeps the system safe by default while giving you the hooks to build richer moderation or review workflows.
