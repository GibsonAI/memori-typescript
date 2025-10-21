# Getting Started with Memorits

This guide walks you from install to your first memory-backed completion using the real APIs provided in this repository. Everything below references the shipped TypeScript sources under `src/`.

## Prerequisites

- Node.js **18.0.0 or newer** (ESM and fetch support are required).
- SQLite 3.x (bundled with Prisma, but ensure the binary is available on your platform).
- One provider credential:
  - `OPENAI_API_KEY` for OpenAI / Azure OpenAI.
  - `ANTHROPIC_API_KEY` for Anthropic.
  - Running Ollama with the OpenAI-compatible server enabled (`ollama serve` exposes `http://localhost:11434/v1`).
- Basic familiarity with TypeScript async/await.

## 1. Install the package

```bash
npm install memorits
```

Memorits ships compiled JS and type definitions from `dist/`.

## 2. Configure environment

The `ConfigManager` pulls configuration from environment variables and sanitises them for you. The recommended `.env` entries are:

```
DATABASE_URL=file:./memori.db
MEMORI_NAMESPACE=default
MEMORI_AUTO_INGEST=true
MEMORI_CONSCIOUS_INGEST=false
MEMORI_ENABLE_RELATIONSHIP_EXTRACTION=true
OPENAI_API_KEY=sk-...
# For Ollama set OPENAI_BASE_URL=http://localhost:11434/v1 and leave api key empty.
```

Boolean values such as `MEMORI_AUTO_INGEST` are parsed with safe `true`/`false` handling; any other value triggers a validation error so typos surface early.

## 3. Prepare the database

Memorits persists to SQLite via Prisma. Run the bundled CLI once before interacting with the library:

```bash
npx memorits init-db --url file:./memori.db
```

The command wraps `prisma db push` using the schema shipped with the package and generates the Prisma client automatically. If you prefer running Prisma manually you can still execute:

```bash
npm run prisma:push
npm run prisma:generate
```

Both steps are required when running Prisma directly—the first synchronises the schema, the second emits the Prisma client used throughout `src/core/infrastructure/database`.

## 4. Create your first MemoriAI instance

```typescript
import { MemoriAI } from 'memorits';

const ai = new MemoriAI({
  databaseUrl: process.env.DATABASE_URL ?? 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY ?? 'sk-your-api-key',
  provider: 'openai',             // optional; auto-detected for known key prefixes
  model: 'gpt-4o-mini',           // default in ConfigManager, override here if needed
  mode: 'automatic',              // automatic | manual | conscious
  namespace: process.env.MEMORI_NAMESPACE ?? 'default'
});
```

- **Automatic mode** records every `chat` call through `Memori.recordConversation`.
- **Manual mode** skips auto-collection; call `ai.recordConversation(...)` yourself.
- **Conscious mode** defers ingestion and lets `Memori.checkForConsciousContextUpdates()` promote memories later.

## 5. Send a chat request and persist memory

```typescript
const reply = await ai.chat({
  messages: [
    { role: 'user', content: 'Please remember that launch day is next Friday.' }
  ],
  temperature: 0.2
});

console.log(reply.message.content);
```

In automatic mode the conversation is summarised, scored, and written to SQLite immediately. All logging (see `src/core/infrastructure/config/Logger.ts`) includes the `MemoriAI` component tag so you can wire it into existing observability pipelines.

## 6. Search stored memories

```typescript
const results = await ai.searchMemories('launch day', {
  limit: 5,
  minImportance: 'medium',
  includeMetadata: true
});

results.forEach(memory => {
  console.log(`${memory.summary} -> importance: ${memory.importance}`);
});
```

`MemoriAI` exposes the simplified `SearchOptions` used inside `src/core/MemoriAI.ts`. For advanced search parameters (`temporalFilters`, `metadataFilters`, explicit strategy selection), instantiate `Memori` directly:

```typescript
import { Memori } from 'memorits';

const memori = new Memori({
  databaseUrl: 'file:./memori.db',
  mode: 'conscious'
});

await memori.enable();

const temporal = await memori.searchMemories('launch', {
  limit: 10,
  temporalFilters: {
    relativeExpressions: ['last 7 days']
  },
  includeMetadata: true
});
```

## 7. Clean up

Always dispose providers and database connections when shutting down:

```typescript
await ai.close();
```

`MemoriAI.close()` disposes both the provider abstraction and the underlying `Memori` instance which in turn closes `DatabaseManager`.

## 8. Validate the setup

- **Type check**: `npx tsc --noEmit`
- **Run tests**: `npm test`
- **Smoke test**: `npm run example:basic`

If you switch providers or adjust Prisma schema models, rerun `npm run prisma:push` followed by `npm run prisma:generate` to keep the generated client in sync.

You are now ready to explore the deeper topics: memory modes, conscious processing, strategy-specific search, and provider integration. Continue with `basic-usage.md` for patterns you can lift directly into your project.

### 3. Verify Database

Check that memories are being stored:

```bash
# View database with Prisma Studio (recommended)
npx prisma studio --schema=./prisma/schema.prisma

# Or check the SQLite database directly
sqlite3 ./memori.db "SELECT COUNT(*) FROM chat_history;"
sqlite3 ./memori.db "SELECT COUNT(*) FROM long_term_memory;"

# View recent conversations
sqlite3 ./memori.db "SELECT userInput, aiOutput, createdAt FROM chat_history ORDER BY createdAt DESC LIMIT 5;"

# View processed memories
sqlite3 ./memori.db "SELECT searchableContent, classification, importanceScore FROM long_term_memory ORDER BY createdAt DESC LIMIT 5;"
```

## Common Issues and Solutions

### "No API key found" Error

**Solution**: Set your OpenAI API key:

```bash
export OPENAI_API_KEY="your-key-here"
# or
echo 'OPENAI_API_KEY=your-key-here' > .env
```

### "Database connection failed" Error

**Solution**: Check database permissions and path:

```typescript
const ai = new MemoriAI({
  databaseUrl: 'file:./memori.db',  // Ensure directory is writable
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  provider: 'openai',
  mode: 'automatic'
});
```

### Memory Search Returns Empty Results

**Solution**: Wait for background processing and check configuration:

```typescript
// Ensure memory processing is enabled
const ai = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  provider: 'openai',
  mode: 'automatic'  // Enable automatic memory processing
});
```

## Next Steps

Now that you have Memorits running:

1. **Explore Search Features**: Try different search queries and filtering options
2. **Customize Configuration**: Adjust memory modes for your use case
3. **Build Your Application**: Integrate memory into your AI features
4. **Monitor Performance**: Track memory usage and search performance

## Getting Help

- **📖 [Core Concepts](core-concepts/memory-management.md)** - Understand memory modes
- **🔍 [Search Strategies](core-concepts/search-strategies.md)** - Learn advanced search
- **🏗️ [Architecture](architecture/system-overview.md)** - Deep dive into system design and data flow
- **💡 [Examples](examples/basic-usage.md)** - See practical examples
- **🐛 [Report Issues](https://github.com/mrorigo/memorits/issues)** - Get help from community

Ready to build memory-enabled AI applications? You're all set! 🚀
