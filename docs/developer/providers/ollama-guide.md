# Ollama Provider Guide

Ollama lets you run LLMs locally. Memorits integrates via the OpenAI-compatible HTTP API.

## Prerequisites

1. Install Ollama from <https://ollama.ai>.
2. Start the compatibility server: `ollama serve`.
3. Pull the models you plan to use, e.g. `ollama pull llama3`.

## Configuration

Set the base URL to the OpenAI-compatible endpoint (`/v1`) and use the synthetic API key `ollama-local`:

```typescript
import { MemoriAI } from 'memorits';

const ai = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: 'ollama-local',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3'
});
```

Alternatively, create a provider directly:

```typescript
import { LLMProviderFactory, ProviderType } from 'memorits';

const provider = await LLMProviderFactory.createProvider(ProviderType.OLLAMA, {
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

## Notes

- Ollama runs locally; no real API key is required.
- Ensure the server is listening on the same network address your application uses.
- Large models require ample CPU/GPU resources; tune `timeout` in the provider config if requests take longer than the default.
- Use `provider.isHealthy()` to check connectivity before issuing chat requests.

Once configured, all memory features behave exactly like the hosted providers.
