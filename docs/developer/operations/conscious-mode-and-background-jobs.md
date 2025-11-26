# Conscious Mode and Background Jobs

This guide describes how to operate Memori in conscious mode using only stable, documented APIs.

It is based on:
- [`Memori`](src/core/Memori.ts:21)
- Conscious ingestion flags managed by [`ConfigManager`](src/core/infrastructure/config/ConfigManager.ts:29)
- Database and state handling in [`DatabaseManager`](src/core/infrastructure/database/DatabaseManager.ts:138)

Goals:
- Explain what "conscious" mode does.
- Show how to schedule background processing safely.
- Provide guidance for multi-instance deployments.

Only documented methods are used; direct access to private fields or deep internals is considered unsupported.

---

## 1. What Conscious Mode Does

Conscious mode is designed for deferred, batch-style processing of important memories.

When enabled:

- Conversations are stored immediately.
- Memory processing (promotion, consolidation, etc.) happens asynchronously via:
  - `ConsciousAgent` (internal)
  - `ConsciousMemoryManager` / related DB managers

Configuration:

- Via code (Memori):

```ts
import { Memori } from 'memorits';

const memori = new Memori({
  databaseUrl: 'file:./memori.db',
  mode: 'conscious',
  namespace: 'assistant-a',
});

await memori.enable();
```

- Via environment (ConfigManager):
  - `MEMORI_CONSCIOUS_INGEST=true`
  - `MEMORI_AUTO_INGEST=false` (if you want pure conscious mode)

Result:
- `Memori.enable()`:
  - Instantiates `ConsciousAgent` when conscious mode is active.
  - May perform an initial ingestion run.
  - Optionally starts background monitoring if configured.

Reference:
- [`Memori.enable`](src/core/Memori.ts:174)

---

## 2. Key Public Operations

### 2.1 initializeConsciousContext()

```ts
await memori.initializeConsciousContext();
```

Use:
- To bootstrap from existing `conscious-info` memories into short-term context after startup.

Behavior:
- No-op if:
  - Memori is not enabled.
  - Conscious mode is not active or `ConsciousAgent` is unavailable.
- Logs errors; does not throw for transient issues.

Reference:
- [`Memori.initializeConsciousContext`](src/core/Memori.ts:534)

### 2.2 checkForConsciousContextUpdates()

```ts
await memori.checkForConsciousContextUpdates();
```

Use:
- To process new conscious memories on demand (e.g., cron/worker).

Behavior:
- No-op when:
  - Memori is not enabled.
  - ConsciousAgent is not initialized.
- When active:
  - Pulls new `conscious-info` items.
  - Applies promotions/updates via internal services.
  - Logs any errors; does not throw for normal failures.

Reference:
- [`Memori.checkForConsciousContextUpdates`](src/core/Memori.ts:514)

### 2.3 Background Monitoring Controls

Memori can run its own timer when conscious mode is enabled.

APIs:

- `setBackgroundUpdateInterval(intervalMs: number)`
  - Updates the interval; restarts monitoring if active.
- `getBackgroundUpdateInterval(): number`
- `isBackgroundMonitoringActive(): boolean`

References:
- [`Memori.setBackgroundUpdateInterval`](src/core/Memori.ts:617)
- [`Memori.isBackgroundMonitoringActive`](src/core/Memori.ts:641)

Notes:
- `startBackgroundMonitoring` / `stopBackgroundMonitoring` are internal helpers; use the public interval APIs to influence behavior, not direct timer access.

---

## 3. Recommended Scheduling Patterns

### 3.1 Single-Instance Deployment

Simplest approach:

- Enable conscious mode on your main process:

```ts
const memori = new Memori({ databaseUrl: 'file:./memori.db', mode: 'conscious' });
await memori.enable();
```

Options:

1. Use built-in monitoring:
   - Rely on Memori’s internal background monitoring.
   - Optionally tune with `setBackgroundUpdateInterval(ms)`.

2. External scheduler (preferred for explicit control):
   - Disable or ignore built-in timer.
   - Use a cron/worker to trigger:

```ts
async function runConsciousTick(memori: Memori) {
  await memori.checkForConsciousContextUpdates();
}

setInterval(() => runConsciousTick(memori), 60_000);
```

Guidance:
- Keep interval >= tens of seconds to avoid thrashing.
- Monitor logs for errors (component `Memori` / `ConsciousAgent`).

### 3.2 Multi-Instance Deployment

When running multiple app instances:

Concerns:
- Avoid duplicated work / race conditions.
- Avoid each instance running its own tight loop by default.

Recommended patterns:

1. Dedicated worker instance:
   - One Memori instance (or service) runs with:
     - `mode: 'conscious'`
     - A controlled scheduler calling `checkForConsciousContextUpdates`.
   - Other instances:
     - Use `automatic` or `manual` modes or `conscious` without scheduling.
     - Do not run background updates.

2. External orchestrator:
   - Use a job system (e.g. cron, queue) to call an endpoint that:
     - Acquires a simple distributed lock (e.g., DB-based).
     - Runs `checkForConsciousContextUpdates` under that lock.
   - Ensures only one worker performs conscious updates at a time.

Avoid:
- Having N identical instances all run background monitoring without coordination.

---

## 4. Namespace and Tenancy Considerations

Conscious mode respects namespaces via underlying storage:

- Use distinct `namespace` values per tenant / logical agent.
- Run conscious updates per namespace if needed.

Common patterns:

- Single shared DB, multiple namespaces:
  - One consolidation/processing worker handling all namespaces.
- Per-tenant Memori instance:
  - Conscious scheduling per instance with its own namespace.

Ensure:
- You pass consistent `namespace` config when constructing Memori/MemoriAI.
- You do not mix unrelated workloads into the same namespace.

---

## 5. Failure Modes and Observability

Conscious processing methods are defensive:

- `initializeConsciousContext`:
  - Logs and returns on error.
- `checkForConsciousContextUpdates`:
  - Catches and logs errors; failures do not crash the process.

Your responsibilities:

- Monitor logs:
  - Filter by `component: 'Memori'` and `component: 'ConsciousAgent'`.
- Treat repeated failures as signals:
  - Schema issues
  - Permission problems
  - Misconfiguration (e.g., wrong database path)

Recommended:
- Wire logs into your existing observability stack.
- Add alerts for:
  - Frequent conscious update failures.
  - Unexpectedly long processing times (from your own measurements).

---

## 6. Stability Notes

Stable and recommended:
- `mode: 'conscious'` via config or env.
- `Memori.initializeConsciousContext()`
- `Memori.checkForConsciousContextUpdates()`
- `Memori.setBackgroundUpdateInterval()`
- `Memori.getBackgroundUpdateInterval()`
- `Memori.isBackgroundMonitoringActive()`

Advanced but supported:
- Running a dedicated worker / scheduler that calls `checkForConsciousContextUpdates` across namespaces with your own locking or coordination.

Internal / not guaranteed:
- Direct access to:
  - `ConsciousAgent`
  - `ConsciousMemoryManager`
  - Private timers or internal scheduling methods
- Any `memori['consciousAgent']` or `memori['dbManager']` style access:
  - Treat as unsupported; wrap at your own risk.

This guide is intended to reflect the real conscious-mode behavior. If you observe mismatches between documented and actual runtime behavior, treat that as a documentation or implementation bug to be resolved.