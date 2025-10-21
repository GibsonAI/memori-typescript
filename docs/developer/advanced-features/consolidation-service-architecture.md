# Consolidation Service Architecture

Memorits encapsulates duplicate detection and memory consolidation in a dedicated service layer. Understanding this architecture helps you customise workflows without touching low-level database code.

## Key Pieces

- **`DuplicateManager`** (`src/core/infrastructure/database/DuplicateManager.ts`) – Detects similar memories and provides helper utilities (`findPotentialDuplicates`, `detectDuplicateCandidates`, `validateConsolidationSafety`).
- **`ConsolidationService` interface** (`src/core/infrastructure/database/interfaces/ConsolidationService.ts`) – Defines the contract for consolidation operations (detect, preview, consolidate, analytics).
- **`MemoryConsolidationService`** (`src/core/infrastructure/database/MemoryConsolidationService.ts`) – Implements the interface using Prisma repositories, duplicate detection, and transaction management.
- **`DatabaseManager`** (`src/core/infrastructure/database/DatabaseManager.ts`) – Acts as a facade; exposes `getConsolidationService()`, scheduling helpers, and metrics.

## Accessing the Service

```typescript
import { Memori } from 'memorits';

const memori = new Memori({ databaseUrl: 'file:./memori.db' });
await memori.enable();

const consolidationService = memori.getConsolidationService();
```

`Memori.getConsolidationService()` delegates to the underlying `DatabaseManager`, so you can work with the high-level interface directly.

## Detecting & Consolidating

```typescript
const duplicates = await consolidationService.detectDuplicateMemories(
  'Reminder: invoices go out on the 5th.',
  0.75
);

if (duplicates.length > 0) {
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

The service performs safety checks, records audit entries, and handles rollbacks if consolidation fails.

## Scheduling

`DatabaseManager` can run consolidation on a schedule. Use it for background maintenance jobs:

```typescript
memori.getConsolidationService(); // ensure service initialised

memori['dbManager'].startConsolidationScheduling({
  intervalMinutes: 120,
  maxConsolidationsPerRun: 20,
  similarityThreshold: 0.8,
  dryRun: true
});
```

The scheduling methods live on `DatabaseManager`. Access them from scripts where you control the lifecycle. Scheduled runs log progress under the `DatabaseManager` component.

## Metrics & Analytics

```typescript
const analytics = await consolidationService.getConsolidationAnalytics();
console.log(`Success rate: ${analytics.successRate}%`);

const history = await consolidationService.getConsolidationHistory({ limit: 50 });
console.log(`Recent consolidations: ${history.length}`);
```

These APIs provide insight into how often duplicates appear, how long consolidations take, and which namespaces are most affected.

## Extending the Service

- Implement the `ConsolidationService` interface if you need alternative behaviour (e.g., custom similarity scoring).
- Provide a custom repository implementing `IConsolidationRepository` (`src/core/infrastructure/database/interfaces/IConsolidationRepository.ts`) if you want to swap out the persistence layer.
- For tests, construct `MemoryConsolidationService` with mock repositories to isolate domain logic.

## Best Practices

- Run consolidations in dry-run mode first to understand the impact.
- Combine duplicate detection with user-facing review flows before deleting memories.
- Monitor analytics and adjust `similarityThreshold` and batch sizes to balance precision and performance.
- Treat direct access to `DatabaseManager` internals (`startConsolidationScheduling`, etc.) as advanced usage; wrap them in your own services if you need stable interfaces.

The consolidation architecture keeps business logic separate from persistence, making it easier to test, reason about, and extend memory management in production systems.
