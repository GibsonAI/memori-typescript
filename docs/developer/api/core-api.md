# Core API Reference

This guide shows how to use the main Memorits APIs from your application code:

- `Memori` – advanced control over ingestion, search, maintenance.
- `MemoriAI` – simplified facade for most app integrations.
- Configuration inputs – how to pass config and environment safely.

All behavior described is backed by the implementation in [`src/core/Memori.ts`](src/core/Memori.ts:21), [`src/core/MemoriAI.ts`](src/core/MemoriAI.ts:37), and [`src/core/infrastructure/config/ConfigManager.ts`](src/core/infrastructure/config/ConfigManager.ts:29).

## Memori

Advanced API for memory orchestration, ingestion control, search, statistics, and maintenance.

Location:
- [`src/core/Memori.ts`](src/core/Memori.ts:21)

### Construction (how to create it in your app)

```ts
new Memori(config?: Partial<MemoriAIConfig>)
```

Key config behavior:
- Loads baseline from environment via `ConfigManager.loadConfig()`:
  - [`ConfigManager`](src/core/infrastructure/config/ConfigManager.ts:29)
- If `config.mode` is provided:
  - `automatic` → `autoIngest = true`, `consciousIngest = false`
  - `manual` → both disabled
  - `conscious` → `consciousIngest = true`, `autoIngest = false`
- Other fields (`databaseUrl`, `apiKey`, `baseUrl`, `namespace`, `userContext`, etc.) override defaults.

Errors:
- Synchronous construction does not throw for DB connectivity; config validation errors can be thrown by `ConfigManager`.

### enable()

```ts
await memori.enable()
```

Responsibilities:
- Initializes providers (dual-provider architecture).
- Creates:
  - `DatabaseManager`
  - `MemoryAgent`
  - `ConsciousAgent` if `consciousIngest` is enabled.
- Starts background monitoring if conscious mode is active.

Key properties:
- Throws if called when already enabled.
- Conscious initialization failures are logged but do not cause `enable()` to reject.

Reference:
- [`Memori.enable`](src/core/Memori.ts:174)

### recordConversation()

```ts
await memori.recordConversation(userInput, aiOutput, options?)
```

Behavior:
- Requires `enable()` to have been called; otherwise throws.
- Persists chat via `DatabaseManager.storeChatHistory`.
- Ingestion by mode:
  - autoIngest: triggers asynchronous `processMemory`.
  - consciousIngest: only stores; background/conscious agent processes later.
  - neither: store-only.

Errors:
- DB write errors propagate.
- In auto mode, memory processing errors are logged; the call resolves once chat is stored.

Reference:
- [`Memori.recordConversation`](src/core/Memori.ts:226)

### processMemory() (internal-facing)

```ts
// Called internally; exposed as method for advanced usage
await memori['processMemory'](chatId, userInput, aiOutput)
```

Behavior:
- Ensures `MemoryAgent` is initialized.
- Calls `MemoryAgent.processConversation`.
- Persists `ProcessedLongTermMemory`.
- If `enableRelationshipExtraction` and relationships exist:
  - Stores via `storeMemoryRelationships`.

Guarantees:
- Logs and swallows errors (does not throw to caller of recordConversation in auto mode).

Reference:
- [`Memori.processMemory`](src/core/Memori.ts:277)

### storeProcessedMemory()

```ts
await memori.storeProcessedMemory(processedMemory, chatId, namespace?)
```

Use:
- For advanced flows where you run your own processing but still want to reuse Memori’s persistence and logging.

Behavior:
- Requires `enable()` (Memori must be enabled).
- Ensures a `ChatHistory` row exists for the provided `chatId`, creating a minimal one if necessary.
- Persists long-term memory and logs metadata.

Reference:
- [`Memori.storeProcessedMemory`](src/core/Memori.ts:655)

### Search APIs

#### searchMemories()

```ts
const results = await memori.searchMemories(query, options?)
```

Options (simplified):
- `limit`
- `minImportance`
- `categories`
- `includeMetadata`
- (internal SearchOptions may include temporal/metadata filters, strategy hints)

Behavior:
- Delegates to `DatabaseManager.getSearchManager().searchMemories`.
- Uses configured strategies with FTS5 where available; falls back safely when not.

Reference:
- [`Memori.searchMemories`](src/core/Memori.ts:371)

#### searchMemoriesWithStrategy()

```ts
const results = await memori.searchMemoriesWithStrategy(query, strategy, options?)
```

Behavior:
- Requires `enable()`.
- Uses `SearchService.searchWithStrategy`.
- Maps results into `MemorySearchResult` shape.

Errors:
- Logs and throws a clear error if the strategy call fails.

Reference:
- [`Memori.searchMemoriesWithStrategy`](src/core/Memori.ts:385)

#### getAvailableSearchStrategies()

```ts
const strategies = await memori.getAvailableSearchStrategies()
```

Reference:
- [`Memori.getAvailableSearchStrategies`](src/core/Memori.ts:435)

#### searchRecentMemories()

```ts
const results = await memori.searchRecentMemories(limit?, includeMetadata?, temporalOptions?, strategy?)
```

Behavior:
- Uses RECENT strategy or delegates to `searchMemoriesWithStrategy` when specified.

Reference:
- [`Memori.searchRecentMemories`](src/core/Memori.ts:443)

### Statistics

#### getMemoryStatistics()

```ts
const stats = await memori.getMemoryStatistics(namespace?)
```

Returns aggregate counts from `StatisticsManager`.

Reference:
- [`Memori.getMemoryStatistics`](src/core/Memori.ts:886)

#### getDetailedMemoryStatistics()

```ts
const detailed = await memori.getDetailedMemoryStatistics(namespace?)
```

Includes breakdowns by type, importance, category, recent activity, and average confidence.

Reference:
- [`Memori.getDetailedMemoryStatistics`](src/core/Memori.ts:927)

### Duplicate & Relationship APIs

#### findDuplicateMemories()

```ts
const duplicates = await memori.findDuplicateMemories(content, { similarityThreshold?, namespace?, limit? })
```

Behavior:
- Requires `enable()`.
- Delegates to `DuplicateManager` via `DatabaseManager`.
- Returns potential duplicates above threshold.

Reference:
- [`Memori.findDuplicateMemories`](src/core/Memori.ts:735)

#### extractMemoryRelationships()

```ts
const rels = await memori.extractMemoryRelationships(content, options?)
```

- Advanced API; relies on `MemoryAgent` relationshipProcessor.
- Throws if MemoryAgent/RelationshipProcessor not available.

Reference:
- [`Memori.extractMemoryRelationships`](src/core/Memori.ts:983)

#### buildRelationshipGraph()

```ts
const graph = await memori.buildRelationshipGraph(namespace?, { maxDepth?, includeWeakRelationships? })
```

- Builds derived relationship graph using RelationshipProcessor via MemoryAgent.

Reference:
- [`Memori.buildRelationshipGraph`](src/core/Memori.ts:1050)

### Index Maintenance

#### getIndexHealthReport(), optimizeIndex(), createIndexBackup(), restoreIndexFromBackup()

- All require `enable()`.
- Delegate to `SearchIndexManager` via `DatabaseManager`.

References:
- [`Memori.getIndexHealthReport`](src/core/Memori.ts:794)
- [`Memori.optimizeIndex`](src/core/Memori.ts:824)
- [`Memori.createIndexBackup`](src/core/Memori.ts:856)
- [`Memori.restoreIndexFromBackup`](src/core/Memori.ts:1112)

### Lifecycle

#### close()

```ts
await memori.close()
```

Behavior:
- Stops background monitoring.
- Attempts to clean up SearchService.
- Closes DatabaseManager.

Reference:
- [`Memori.close`](src/core/Memori.ts:467)

---

## MemoriAI

High-level, user-facing API that wraps a provider plus an internal Memori instance.

Location:
- [`src/core/MemoriAI.ts`](src/core/MemoriAI.ts:37)

### Construction

```ts
new MemoriAI(config: MemoriAIConfig)
```

Key points:
- Generates `sessionId`.
- Detects provider via:
  - `config.provider` (if set), or
  - API key patterns / `ollama-local`.
  - See [`MemoriAI.detectProvider`](src/core/MemoriAI.ts:313).
- Creates:
  - User-facing provider for chat/embeddings.
  - Internal Memori with mapped config (databaseUrl, apiKey, model, namespace, mode).

### chat()

```ts
const res = await memoriAI.chat(params: ChatParams)
```

Behavior:
- Sends chat to `userProvider.createChatCompletion`.
- In `mode: 'automatic'`:
  - Ensures `Memori` is enabled.
  - Calls `Memori.recordConversation` to persist dialogue.
- Returns normalized `ChatResponse`.

Errors:
- Logs via `logError` with component `MemoriAI`.
- Propagates provider errors.

Reference:
- [`MemoriAI.chat`](src/core/MemoriAI.ts:97)

### searchMemories()

```ts
const results = await memoriAI.searchMemories(query, options?)
```

- Converts options to internal shape.
- Delegates to `Memori.searchMemories`.

Reference:
- [`MemoriAI.searchMemories`](src/core/MemoriAI.ts:153)

### searchMemoriesWithStrategy(), getAvailableSearchStrategies()

- Thin wrappers around Memori’s implementations.

References:
- [`MemoriAI.searchMemoriesWithStrategy`](src/core/MemoriAI.ts:293)
- [`MemoriAI.getAvailableSearchStrategies`](src/core/MemoriAI.ts:306)

### createEmbeddings()

```ts
const res = await memoriAI.createEmbeddings(params: EmbeddingParams)
```

- Uses `userProvider.createEmbedding`.
- Returns normalized EmbeddingResponse.

Reference:
- [`MemoriAI.createEmbeddings`](src/core/MemoriAI.ts:167)

### recordConversation() (manual/conscious modes)

```ts
const chatId = await memoriAI.recordConversation(userInput, aiOutput, options?)
```

- Only allowed when mode is `manual` or `conscious`.
- Forwards to `Memori.recordConversation`.

Reference:
- [`MemoriAI.recordConversation`](src/core/MemoriAI.ts:247)

### getMemoryStatistics()

```ts
const stats = await memoriAI.getMemoryStatistics(namespace?)
```

- Delegates to `Memori.getMemoryStatistics`.

Reference:
- [`MemoriAI.getMemoryStatistics`](src/core/MemoriAI.ts:286)

### close()

```ts
await memoriAI.close()
```

- Disposes user provider (if any).
- Closes underlying Memori.

Reference:
- [`MemoriAI.close`](src/core/MemoriAI.ts:203)

---

## Configuration Overview

Memori and MemoriAI rely on two main configuration layers:

1. MemoriAIConfig (user-facing)
2. MemoriConfig via ConfigManager (env-driven defaults)

### MemoriAIConfig (selected fields)

Defined in:
- [`src/core/MemoriAIConfig.ts`](src/core/MemoriAIConfig.ts)

Key fields:
- `databaseUrl`
- `apiKey`
- `baseUrl`
- `model`
- `namespace`
- `mode`: 'automatic' | 'manual' | 'conscious'
- `provider` (optional hint)
- `memoryProvider` (optional advanced configuration for memory side)

Used by:
- [`MemoriAI`](src/core/MemoriAI.ts:37)
- `Memori` (when constructed via MemoriAI config subset)

### MemoriConfig via ConfigManager

Defined/loaded in:
- [`MemoriConfigSchema`](src/core/infrastructure/config/ConfigManager.ts:11)
- [`ConfigManager.loadConfig`](src/core/infrastructure/config/ConfigManager.ts:29)

Environment variables:
- `DATABASE_URL` / `MEMORI_DATABASE_URL`
- `MEMORI_NAMESPACE`
- `MEMORI_CONSCIOUS_INGEST`
- `MEMORI_AUTO_INGEST`
- `MEMORI_ENABLE_RELATIONSHIP_EXTRACTION`
- `MEMORI_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (incl. Ollama-style endpoints)

Rules:
- If no valid API key and no `OPENAI_BASE_URL`, throws configuration error.
- If `OPENAI_BASE_URL` is set without key, assigns `ollama-local` as synthetic key.
- All values sanitized and validated; throws `SanitizationError` / `ValidationError` on invalid input.

---

This core API reference is intended to be stable and code-accurate. Any symbol not listed here or in top-level exports should be treated as internal and subject to change.
