# Anthropic Provider Guide

Memorits integrates with Anthropic's Claude models through the `AnthropicProvider`. Use it via `MemoriAI`, `Memori`, the OpenAI drop-in client, or directly through `LLMProviderFactory`.

## Configuration

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1   # optional
```

The default model is `claude-3-5-sonnet-20241022`; override it via configuration.

## Using `MemoriAI`

```typescript
const ai = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  provider: 'anthropic',
  model: 'claude-3-haiku-20240307'
});

const reply = await ai.chat({
  messages: [{ role: 'user', content: 'Store this for later.' }]
});
```

`MemoriAI` handles provider initialisation, memory capture, and logging automatically.

## Using the Provider Factory

```typescript
import { LLMProviderFactory, ProviderType } from 'memorits';

const provider = await LLMProviderFactory.createProvider(ProviderType.ANTHROPIC, {
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20241022',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto',
    sessionId: 'anthropic-session'
  }
});

const completion = await provider.createChatCompletion({
  messages: [{ role: 'user', content: 'What should I remember about Anthropic?' }],
  max_tokens: 400
});
```

## Notes

- Anthropic’s REST API expects separate system prompts; `AnthropicProvider` handles message conversion for you.
- Streaming and function calling are not currently implemented.
- Use `provider.isHealthy()` and `provider.getDiagnostics()` for health checks and debugging.

For more advanced usage (custom retry logic, alternate base URLs, etc.), inspect `src/core/infrastructure/providers/AnthropicProvider.ts`.
