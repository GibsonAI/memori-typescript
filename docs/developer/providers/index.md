# Provider Documentation

Memorits treats provider choice as an implementation detail: all supported providers share the same memory pipeline, logging, and configuration semantics. Use this index to find provider-specific notes.

- **[Quick Start](./quick-start.md)** – shows how to use the OpenAI drop-in client and the provider factory with minimal configuration.
- **[Anthropic Guide](./anthropic-guide.md)** – covers API keys, model selection, and any Anthropic-specific considerations.
- **[Ollama Guide](./ollama-guide.md)** – details local deployment, base URLs, and running the OpenAI-compatible endpoint.

## Core Principles

- The same memory stack (`MemoryAgent`, `DatabaseManager`, `SearchManager`) runs regardless of provider.
- Providers created through `LLMProviderFactory` accept `memory` settings that map to `IProviderConfig['features'].memory` (`enableChatMemory`, `memoryProcessingMode`, `sessionId`, etc.).
- Sharing memories across providers is as simple as pointing them at the same `databaseUrl` and `namespace`.

## Minimal Shared Setup

```typescript
const memoryConfig = {
  databaseUrl: 'file:./memori.db',
  namespace: 'support',
  enableChatMemory: true,
  memoryProcessingMode: 'auto',
  sessionId: 'support-session'
};
```

Pass `memoryConfig` to each provider (or to `MemoriAI`) to keep memories in sync. See the individual guides for provider-specific environment variables and troubleshooting tips.
