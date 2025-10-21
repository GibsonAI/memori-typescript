# Database Schema

Memorits stores all data in SQLite using Prisma. The schema lives in `prisma/schema.prisma` and is synchronised with the database via `npm run prisma:push`. This document walks through the real tables, indexes, and supporting infrastructure so you know exactly how data is laid out.

## Core Tables

### `chat_history`

Stores raw conversations that feed the memory pipeline.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String @id @default(cuid())` | Primary key used as the default `rowid` |
| `userInput` / `aiOutput` | `String` | Raw text sent/received |
| `model` | `String` | Model identifier recorded by `MemoriAI` |
| `sessionId` | `String` | Generated per `MemoriAI` instance |
| `namespace` | `String @default("default")` | Tenant/partition | 
| `metadata` | `Json?` | Optional request metadata (temperature, etc.) |
| Relationships | `ShortTermMemory[]`, `LongTermMemory[]` | Prisma relations |

### `short_term_memory`

The working context used for conscious mode and high-priority recall.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String @id @default(cuid())` | Primary key |
| `chatId` | `String?` | Optional foreign key to `chat_history.id` |
| `processedData` | `Json` | Raw payload from `MemoryAgent` |
| `importanceScore` | `Float @default(0.5)` | Numeric importance |
| `categoryPrimary` | `String` | Primary classification |
| `retentionType` | `String @default("short_term")` | Set by processors |
| `namespace` | `String` | Mirrors chat namespace |
| `searchableContent` | `String` | Text used for search |
| `summary` | `String` | Concise summary |
| `isPermanentContext` | `Boolean @default(false)` | For pinned context |
| `createdAt`/`expiresAt` | `DateTime` | Expiration used by cleanup jobs |

### `long_term_memory`

Permanent storage for processed memories.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String @id @default(cuid())` |
| `originalChatId` | `String?` | Links back to the source conversation |
| `processedData` | `Json` | Full MemoryAgent payload |
| `importanceScore` | `Float` | Cached numeric importance |
| `categoryPrimary` | `String` | Primary classification |
| `classification` | `String @default("conversational")` | Mirrors `MemoryClassification` |
| `memoryImportance` | `String @default("medium")` | Mirrors `MemoryImportanceLevel` |
| `topic` | `String?` | Optional topic |
| `entitiesJson` / `keywordsJson` | `Json?` | Extracted entity & keyword lists |
| `relatedMemoriesJson` / `supersedesJson` | `Json?` | Relationship graph |
| `duplicateOf` | `String?` | Reference to canonical memory |
| `confidenceScore` | `Float @default(0.8)` | Processing confidence |
| `classificationReason` | `String?` | Optional explanation |
| `consciousProcessed` | `Boolean @default(false)` | Flag used by `ConsciousAgent` |
| `createdAt`, `lastAccessed`, `accessCount` | Tracking fields used by maintenance jobs |
| `searchableContent`, `summary` | Denormalised search payload |

## Search Infrastructure

- `memory_fts` is created dynamically in `src/core/infrastructure/database/init-search-schema.ts` when SQLite reports FTS5 support. It stores two columns: `content` and `metadata` (JSON) and is synchronised via triggers in the search managers.
- When FTS5 is unavailable, the system falls back to LIKE queries built against `searchableContent`/`summary`.
- Additional indexes (`idx_long_term_memory_namespace`, `idx_long_term_memory_importance`, and equivalents on short-term memory) are created during initialisation to improve filtering performance.

## State Tracking

`MemoryProcessingStateManager` records transitions inside each memory’s `processedData` JSON structure. There is no separate SQL table today; the state history is written back as part of the JSON blob, keeping schema changes lightweight while still allowing detailed auditing.

## Backups & Maintenance

`SearchIndexManager` (see `src/core/domain/search/SearchIndexManager.ts`) performs optional maintenance:

- `startMaintenanceSchedule()` sets timers for health checks (hourly), optimisation checks (daily), and search-index backups (weekly).
- `createBackup()` creates a `search_index_backups` table on demand and stores compressed index snapshots alongside checksum metadata.
- `optimizeIndex()` supports `MERGE`, `REBUILD`, `COMPACT`, and `VACUUM` operations, recording before/after statistics.

These helpers are exposed through `Memori` (`getIndexHealthReport`, `optimizeIndex`, `createIndexBackup`, `restoreIndexFromBackup`).

## Working with Prisma

- Update the schema by editing `prisma/schema.prisma`.
- Apply changes locally with:

  ```bash
  npm run prisma:push
  npm run prisma:generate
  ```

- `DATABASE_URL` controls the SQLite file path; tests often use file-scoped temporary databases for isolation.

## Inspecting Data

```bash
sqlite3 memori.db ".headers on" ".mode column" \
  "SELECT id, summary, memoryImportance, namespace FROM long_term_memory ORDER BY createdAt DESC LIMIT 5;"

sqlite3 memori.db "SELECT name FROM sqlite_master WHERE type = 'table';"
sqlite3 memori.db "SELECT rowid, content FROM memory_fts LIMIT 5;"
```

Knowing the actual schema helps when you build reporting dashboards, perform maintenance, or migrate the database to another engine. The Prisma models and supporting search infrastructure described above are the single source of truth for Memorits’ storage layer.
