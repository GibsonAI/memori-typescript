# Configuration Management

Search behaviour, provider settings, and ingestion modes are all configurable at runtime. Memorits relies on a combination of environment variables, `ConfigManager`, and strategy-specific configuration managers to keep settings flexible but safe.

## Environment Configuration

`ConfigManager` (`src/core/infrastructure/config/ConfigManager.ts`) reads and sanitises environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite connection string (default `file:./memori.db`) |
| `MEMORI_NAMESPACE` | Default namespace for operations |
| `MEMORI_AUTO_INGEST` | `"true"` enables automatic ingestion |
| `MEMORI_CONSCIOUS_INGEST` | `"true"` enables conscious processing |
| `MEMORI_ENABLE_RELATIONSHIP_EXTRACTION` | `"true"` toggles relationship extraction |
| `MEMORI_MODEL` | Default model when not supplied explicitly |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | Provider credentials (Ollama uses `OPENAI_BASE_URL` + `ollama-local`) |

All values go through sanitisation helpers (`sanitizeEnvironmentVariable`, `sanitizeNamespace`, etc.) so invalid inputs raise descriptive errors instead of silently failing.

## Search Strategy Configuration

`SearchStrategyConfigManager` (`src/core/domain/search/SearchStrategyConfigManager.ts`) governs per-strategy settings such as timeouts, cache sizes, and scoring weights. It loads defaults for every strategy and persists customisations to disk (`./config/search` by default).

### Loading and Saving Configurations

```typescript
import { SearchStrategyConfigManager } from 'memorits/core/domain/search/SearchStrategyConfigManager';

const configManager = new SearchStrategyConfigManager();

const ftsConfig = await configManager.loadConfiguration('fts5');
console.log(`FTS priority: ${ftsConfig?.priority}`);

await configManager.saveConfiguration('fts5', {
  ...configManager.getDefaultConfiguration('fts5'),
  priority: 12,
  timeout: 8000
});
```

Saving a configuration automatically validates the payload, persists it via the file-based persistence manager, and records an audit entry.

### Validation Helpers

```typescript
const candidate = {
  strategyName: 'fts5',
  enabled: true,
  priority: 5,
  timeout: 4000,
  maxResults: 50
};

const validation = await configManager.validateConfiguration(candidate);

if (!validation.isValid) {
  console.error('Config invalid:', validation.errors);
}
```

Warnings surface non-fatal issues (e.g., unusually high cache sizes) while errors block persistence.

### Cache & Performance Metrics

`SearchStrategyConfigManager` keeps lightweight metrics (`totalOperations`, `cacheHitRate`, etc.) to help diagnose configuration churn. Access them with:

```typescript
const stats = configManager.getPerformanceMetrics();
console.log(stats.cacheHitRate);
```

## Advanced Persistence

The default persistence layer stores JSON files per strategy under `./config/search`. If you need custom storage (e.g., a database), implement the `ConfigurationPersistenceManager` interface and pass it to the constructor:

```typescript
import { SearchStrategyConfigManager } from 'memorits/core/domain/search/SearchStrategyConfigManager';
import type { ConfigurationPersistenceManager } from 'memorits/core/domain/search/types';

class InMemoryPersistence implements ConfigurationPersistenceManager {
  // implement save/load/list/delete as needed
}

const configManager = new SearchStrategyConfigManager(new InMemoryPersistence());
```

Audit logging works the same way—provide a custom `ConfigurationAuditManager` if you want to forward changes to an external system.

## Runtime Tweaks

You can modify strategy settings without restarting your service. For example, boosting the `RECENT` strategy priority during an incident:

```typescript
await configManager.saveConfiguration('recent', {
  ...configManager.getDefaultConfiguration('recent'),
  priority: 15
});

// SearchService reloads configurations lazily, so subsequent searches pick up the change.
```

## Provider Configuration

`MemoriAI` and `Memori` accept provider overrides (chat vs memory provider) within `MemoriAIConfig`. For more granular control, import provider utilities:

```typescript
import { LLMProviderFactory, ProviderType } from 'memorits';

const ollama = await LLMProviderFactory.createProvider(ProviderType.OLLAMA, {
  apiKey: 'ollama-local',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3',
  features: {
    memory: { enableChatMemory: true, memoryProcessingMode: 'auto', sessionId: 'ops-bot' }
  }
});
```

This mirrors how `Memori` initialises providers internally and is useful when building custom ingestion services.

## Summary

- Prefer environment variables and `ConfigManager` for application-level settings.
- Use `SearchStrategyConfigManager` when tuning search behaviour at runtime.
- Implement custom persistence/audit managers if you need centralised configuration storage.
- Provider configuration remains type-safe through `IProviderConfig` and factory helpers.

This setup keeps configuration strongly typed, auditable, and easy to adjust without redeploying your application.
