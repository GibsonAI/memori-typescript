# Duplicate Management

Memorits includes tooling to surface and manage duplicate memories so your knowledge base stays concise. The functionality lives in `DuplicateManager` (`src/core/infrastructure/database/DuplicateManager.ts`) and is surfaced through `Memori` and `ConsciousAgent`.

## Finding Potential Duplicates

`Memori.findDuplicateMemories` wraps the duplicate detection pipeline. It compares supplied content against existing memories using the internal similarity scoring implemented by the duplicate management components (threshold-based, implementation detail), returning only candidates above the configured similarity threshold.

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

## Consolidation via Public API

When you need structured consolidation workflows, use the consolidation service exposed through `Memori` instead of reaching into private agents:

```typescript
import { Memori } from 'memorits';

const memori = new Memori({ databaseUrl: 'file:./memori.db' });
await memori.enable();

const consolidationService = memori.getConsolidationService();

const duplicates = await consolidationService.detectDuplicateMemories(
  'Reminder: invoices go out on the 5th.',
  0.75
);

if (duplicates.length > 1) {
  const primaryId = duplicates[0].id;
  const others = duplicates.slice(1).map(d => d.id);

  const validation = await consolidationService.validateConsolidationEligibility(primaryId, others);
  if (validation.isValid) {
    const preview = await consolidationService.previewConsolidation(primaryId, others);
    console.log(preview.summary);

    const result = await consolidationService.consolidateMemories(primaryId, others);
    console.log(`Merged ${result.consolidated} memories`);
  }
}
```

The consolidation run is responsible for safety checks, atomic updates, and rollback support (see concrete methods on the `ConsolidationService` / `MemoryConsolidationService` implementations).

## Supporting Utilities (Advanced/Internal)

Internal components such as `DuplicateManager` and repository helpers expose lower-level utilities (e.g. candidate detection, consolidation validation, history/analytics). These are wired behind `Memori.findDuplicateMemories` and the consolidation service.

If you choose to import them directly from internal paths (e.g. `src/core/infrastructure/database/DuplicateManager.ts`), treat this as unstable advanced usage:
- APIs and paths may change without notice.
- Prefer `Memori.findDuplicateMemories` and `memori.getConsolidationService()` for stable integration.

## Practical Workflow

1. Use `Memori.findDuplicateMemories` when ingesting new information to alert users about potential duplicates.
2. Use `memori.getConsolidationService()` for controlled consolidation flows (detect → validate → preview → consolidate → rollback if needed).
3. Log or review similarity scores and previews before deleting or merging content.
4. If you must call internal managers directly, isolate that logic in your own adapter and treat it as non-stable API surface.

Duplicate detection is designed to be conservative: it surfaces likely matches without deleting anything automatically. This keeps the system safe by default while giving you the hooks to build richer moderation or review workflows.
