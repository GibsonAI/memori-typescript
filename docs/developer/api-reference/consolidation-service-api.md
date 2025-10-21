# Consolidation Service API

`ConsolidationService` defines the business contract for duplicate detection and consolidation operations. `Memori.getConsolidationService()` returns an implementation backed by `MemoryConsolidationService`.

## Methods

### `detectDuplicateMemories(content, threshold?, config?)`

Returns an array of `DuplicateCandidate` objects describing potential duplicates.

- `content: string` – the text to compare against stored memories.
- `threshold?: number` – similarity threshold (0–1, default `0.7`).
- `config?: DuplicateDetectionConfig` – tweak comparison behaviour (max candidates, fuzzy matching, etc.).

### `consolidateMemories(primaryId, duplicateIds)`

Performs a consolidation and returns a `ConsolidationResult` (success flag, consolidated count, warnings, rollback data).

### `markMemoryAsDuplicate(duplicateId, originalId, reason?)`

Marks a memory as a duplicate without performing a merge. Useful for manual workflows.

### `cleanupOldConsolidatedMemories(olderThanDays?, dryRun?)`

Removes (or simulates removal of) consolidated memories older than the specified number of days. Returns a `CleanupResult`.

### `getConsolidationAnalytics()`

Returns `ConsolidationStats`:

- `totalMemories`, `duplicateCount`, `consolidatedMemories`
- `averageConsolidationRatio`
- `lastConsolidationActivity`
- `consolidationTrends` (period-based history)

### `validateConsolidationEligibility(primaryId, duplicateIds)`

Checks whether a consolidation is safe. Returns `{ isValid, errors, warnings }`.

### `getConsolidationHistory(memoryId)`

Returns the event history and current status for a specific memory. Event operations include `marked_duplicate`, `consolidated`, and `rollback`.

### `previewConsolidation(primaryId, duplicateIds)`

Simulates consolidation and returns an object containing:

- `estimatedResult` (count, data integrity hash, content/metadata changes)
- `warnings`
- `recommendations`

### `rollbackConsolidation(primaryMemoryId, rollbackToken)`

Reverses a consolidation using the rollback token produced during the original operation. Returns `{ success, restoredMemories, errors }`.

### `getOptimizationRecommendations()`

Returns an object with:

- `recommendations`: array of actionable items (type, priority, description, benefit, actions).
- `overallHealth`: `'good' | 'fair' | 'poor'`
- `nextMaintenanceDate?`

## Types

All related types (e.g., `DuplicateCandidate`, `ConsolidationResult`, `DuplicateDetectionConfig`, `CleanupResult`) are defined in `src/core/infrastructure/database/types/consolidation-models.ts`.

## Usage Pattern

```typescript
const service = memori.getConsolidationService();

const duplicates = await service.detectDuplicateMemories(content, 0.75);

if (duplicates.length) {
  const primaryId = duplicates[0].id;
  const others = duplicates.slice(1).map(d => d.id);

  const { isValid, errors } = await service.validateConsolidationEligibility(primaryId, others);

  if (isValid) {
    const preview = await service.previewConsolidation(primaryId, others);
    console.log(preview.estimatedResult);

    const result = await service.consolidateMemories(primaryId, others);
    console.log(result);
  } else {
    console.error(errors);
  }
}
```

Always wrap calls in `try/catch`; the implementation performs validation and logs failures through `Logger.ts`.
