# Provider Quick Start

Memorits unifies multiple LLM providers behind a consistent interface. This short guide shows how to get up and running with the drop-in client and the provider factory.

## OpenAI-Compatible Drop-in

```typescript
import { MemoriOpenAI } from 'memorits/integrations/openai-dropin/client';

const client = new MemoriOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto',
    sessionId: 'quick-start'
  }
});

const completion = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Remember that I prefer dark mode.' }]
});

const memories = await client.memory.searchMemories('dark mode');
console.log(memories.length);
```

- Works with OpenAI API-compatible hosts (including Azure OpenAI and local Ollama servers running in compatibility mode).
- Memory configuration mirrors the provider features used internally by `MemoriAI`.

## Provider Factory

```typescript
import { LLMProviderFactory, ProviderType } from 'memorits';

const provider = await LLMProviderFactory.createProvider(ProviderType.OPENAI, {
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto',
    sessionId: 'factory-demo'
  }
});

const response = await provider.createChatCompletion({
  messages: [{ role: 'user', content: 'Store this in memory.' }]
});
```

Swap `ProviderType.OPENAI` for `ProviderType.ANTHROPIC` or `ProviderType.OLLAMA` with the appropriate API key and base URL.

## Environment Variables

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_BASE_URL=http://localhost:11434/v1   # for Ollama compatibility mode
DATABASE_URL=file:./memori.db
MEMORI_NAMESPACE=default
MEMORI_AUTO_INGEST=true
```

`ConfigManager` reads `DATABASE_URL`, `MEMORI_*`, and provider-specific variables automatically; override them per instance when needed.

## Shared Memory Across Providers

Point each provider at the same SQLite database to share memories:

```typescript
const memoryConfig = {
  databaseUrl: 'file:./memori.db',
  namespace: 'team-bot'
};

const openai = await LLMProviderFactory.createProvider(ProviderType.OPENAI, {
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
  memory: { ...memoryConfig, enableChatMemory: true, memoryProcessingMode: 'auto' }
});

const anthropic = await LLMProviderFactory.createProvider(ProviderType.ANTHROPIC, {
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20241022',
  memory: { ...memoryConfig, enableChatMemory: true, memoryProcessingMode: 'auto' }
});
```

All interactions persist to the same namespace, so `MemoriAI` (or any provider) can retrieve them.

## Ollama Notes

- Run `ollama serve` with the OpenAI-compatible endpoint (`/v1`).
- Set `apiKey` to `ollama-local` and `baseUrl` to `http://localhost:11434/v1`.

```typescript
const ollama = await LLMProviderFactory.createProvider(ProviderType.OLLAMA, {
  apiKey: 'ollama-local',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto',
    sessionId: 'ollama-session'
  }
});
```

With these building blocks you can mix providers freely while keeping memory persistent and searchable.
