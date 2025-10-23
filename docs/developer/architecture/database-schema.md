# Database Schema

Memorits stores all data in SQLite using Prisma. The schema lives in `prisma/schema.prisma` and is synchronised with the database via `npm run prisma:push`. This document walks through the real tables, indexes, and supporting infrastructure so you know exactly how data is laid out.

## ID Generation Strategy

Memorits uses **UUID v4** for all primary keys across the database for consistency with the application layer. UUIDs are generated in the application code using the `IdGenerator` utility class and explicitly set during record creation. This approach provides:

- **Consistency**: Single ID format (UUID) across entire system
- **Database Compatibility**: Better support for multiple database types
- **Debugging**: Easier ID correlation across application layers
- **Standard Compliance**: UUID is widely supported in database tooling

The `IdGenerator` class provides methods for generating different types of IDs:
- `generateId()` - Standard UUID v4
- `generateMemoryId()` - Memory record ID
- `generateChatId()` - Chat record ID
- `generateSessionId()` - Session ID

## Core Tables

### `chat_history`

Stores raw conversations that feed the memory pipeline.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String @id @default("")` | Primary key (UUID v4 generated in application) |
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
| `id` | `String @id @default("")` | Primary key (UUID v4 generated in application) |
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
| `id` | `String @id @default("")` | Primary key (UUID v4 generated in application) |
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

## ID Generation Implementation

The `IdGenerator` utility class (`src/core/infrastructure/database/utils/id-generator.ts`) handles all UUID generation across the entire application:

```typescript
import { IdGenerator } from '../utils/id-generator';

// Standard UUID generation
const id = IdGenerator.generateId();

// Specialized ID types for different purposes
const memoryId = IdGenerator.generateMemoryId();           // For memory records
const chatId = IdGenerator.generateChatId();               // For chat/conversation records
const sessionId = IdGenerator.generateSessionId();         // For MemoriAI sessions
const requestId = IdGenerator.generateRequestId();         // For API requests
const conversationId = IdGenerator.generateConversationId(); // For conversation tracking
const recordId = IdGenerator.generateRecordId('chat');     // For prefixed records (chat_record_timestamp_uuid)

// Batch operations
const batchIds = IdGenerator.generateBatchIds(10);

// Debug and validation utilities
const isValid = IdGenerator.isValidUUID(someId);
const timestamp = IdGenerator.extractTimestampFromId(debugId); // Supports multiple formats

// Timestamped IDs for debugging (includes timestamp prefix)
const debugId = IdGenerator.generateTimestampedId('CHAT');
```

### Available ID Generation Methods

| Method | Purpose | Example Usage |
|--------|---------|---------------|
| `generateId()` | Standard UUID v4 | General purpose IDs |
| `generateMemoryId()` | Memory record IDs | `MemoryManager.createMemory()` |
| `generateChatId()` | Chat record IDs | `ChatHistoryManager.saveChat()` |
| `generateSessionId()` | Session tracking | `MemoriAI` instance sessions |
| `generateRequestId()` | API request tracking | `Provider.request()` calls |
| `generateConversationId()` | Conversation tracking | OpenAI integration layer |
| `generateRecordId(type)` | Prefixed record IDs | Database record creation (chat_record/embedding_record) |
| `generateBatchIds(count)` | Batch operations | High-volume record creation |
| `generateTimestampedId(prefix)` | Debug-friendly IDs | Development and troubleshooting |

### ID Format Examples

```typescript
// Standard UUID v4 format (no timestamp extractable)
"9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"

// Prefixed format (timestamp extractable)
"chat_record_1697905764123_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"

// Timestamped format (timestamp extractable)
"1697905764123_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
```

**Timestamp Extraction Support:**
- ✅ Prefixed IDs: `prefix_timestamp_uuid` → extracts `timestamp`
- ✅ Simple timestamped: `timestamp_uuid` → extracts `timestamp`
- ❌ Plain UUIDs: `uuid` → returns `null` (no timestamp available)
```

IDs are explicitly set during record creation in the database managers rather than relying on database auto-generation, ensuring consistency across different database systems and providing better traceability.

## Working with Prisma

- Update the schema by editing `prisma/schema.prisma`.
- Apply changes locally with:

  ```bash
  npm run prisma:push
  npm run prisma:generate
  ```

- **Important**: After schema changes, always run both commands in sequence to ensure the Prisma Client is updated.
- `DATABASE_URL` controls the SQLite file path; tests often use file-scoped temporary databases for isolation.

## Inspecting Data

```bash
sqlite3 memori.db ".headers on" ".mode column" \
  "SELECT id, summary, memoryImportance, namespace FROM long_term_memory ORDER BY createdAt DESC LIMIT 5;"

sqlite3 memori.db "SELECT name FROM sqlite_master WHERE type = 'table';"
sqlite3 memori.db "SELECT rowid, content FROM memory_fts LIMIT 5;"
```

**Note**: All `id` fields now contain UUID v4 format (e.g., `9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d`) instead of CUID format. This provides better consistency with the application layer and improved database compatibility.

Knowing the actual schema helps when you build reporting dashboards, perform maintenance, or deploy the database to another engine. The Prisma models and supporting search infrastructure described above are the single source of truth for Memorits’ storage layer.

## Design Benefits

The UUID v4 implementation provides several advantages for the database architecture:

- **🔄 Consistency**: Unified ID format across application and database layers
- **🌐 Database Compatibility**: Better support for PostgreSQL, MySQL, and other databases
- **🔧 Tooling**: Improved compatibility with database administration tools
- **🐛 Debugging**: Easier correlation of logs and database records
- **📈 Scalability**: Better performance characteristics for high-volume systems

This design aligns the database layer with the existing application architecture and prepares the system for multi-database deployment scenarios.
