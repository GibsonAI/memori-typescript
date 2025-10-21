# Multi-Provider Integration

Memorits supports OpenAI, Anthropic, and Ollama through a shared provider abstraction. This guide shows how to use the OpenAI drop-in client and how to instantiate providers directly when you need finer control.

## OpenAI Drop-in Client

`MemoriOpenAI` mirrors the official OpenAI SDK v5 interface while automatically capturing memory.

```typescript
import { MemoriOpenAI } from 'memorits/integrations/openai-dropin/client';

const client = new MemoriOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto',
    sessionId: 'support-bot'
  }
});

const completion = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Remember that invoices are due on the 5th.' }]
});

const memories = await client.memory.searchMemories('invoices');
console.log(memories.length);
```

- `memory.sessionId` groups memories for a specific user or agent.
- Use `enableEmbeddingMemory` when you want automatic embedding capture (off by default).

## Provider Factory

For advanced scenarios, use `LLMProviderFactory` to create providers directly. This gives you access to the underlying `MemoryCapableProvider` instances.

```typescript
import { LLMProviderFactory, ProviderType } from 'memorits';

const anthropic = await LLMProviderFactory.createProvider(ProviderType.ANTHROPIC, {
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20241022',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto',
    sessionId: 'anthropic-session'
  }
});

const response = await anthropic.createChatCompletion({
  messages: [{ role: 'user', content: 'Store this fact for later.' }]
});
```

Providers created this way expose the same methods used internally by `MemoriAI`/`Memori` and can be integrated into custom ingestion pipelines.

## Provider Detection

`MemoriAI` auto-detects the provider when possible:

- API keys starting with `sk-` → OpenAI.
- `sk-ant-` → Anthropic.
- `ollama-local` or `OPENAI_BASE_URL` set → Ollama.

You can still override `provider` explicitly in the config.

## Ollama Notes

- Use the OpenAI-compatible API (`ollama serve`) at `http://localhost:11434/v1`.
- Set `apiKey` to `ollama-local` (the providers treat it as a dummy key).

```typescript
const ollama = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: 'ollama-local',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3'
});
```

## Multiple Providers Sharing Memory

Point different instances at the same database/namespace to share memories:

```typescript
const openaiAI = new MemoriAI({ databaseUrl, apiKey: process.env.OPENAI_API_KEY! });
const anthropicAI = new MemoriAI({ databaseUrl, apiKey: process.env.ANTHROPIC_API_KEY!, provider: 'anthropic' });

await openaiAI.chat({ messages: [{ role: 'user', content: 'I love TypeScript.' }] });
await anthropicAI.chat({ messages: [{ role: 'user', content: 'Remind me about TypeScript later.' }] });

const memories = await openaiAI.searchMemories('TypeScript');
```

Both instances persist to the same SQLite database, so search results include conversations from either provider.

## Troubleshooting

- **Authentication errors**: confirm API keys and `baseUrl` are correct, especially for Ollama.
- **FTS5 unavailable**: the search layer falls back to LIKE queries; install an SQLite build with FTS5 if you need full-text search.
- **Memory not recording**: ensure `mode: 'automatic'` (or enable chat memory in provider config) and check logs for `MemoriAI` or provider errors.

Use this integration pattern to mix providers without sacrificing memory consistency or reworking your existing OpenAI-compatible code.
