# Providers Overview

This guide documents how Memorits integrates with LLM providers and how to configure them correctly.

It is grounded in:
- [`MemoriAI`](src/core/MemoriAI.ts:37)
- [`Memori`](src/core/Memori.ts:21)
- [`ConfigManager`](src/core/infrastructure/config/ConfigManager.ts:29)
- Provider infrastructure under `src/core/infrastructure/providers/`

Goals:
- Explain provider detection for MemoriAI and Memori.
- Describe Memori’s dual-provider architecture.
- Provide concrete configuration examples for OpenAI, Anthropic, and Ollama-like setups.

---

## 1. Provider Detection

### 1.1 MemoriAI

MemoriAI chooses the provider via:

1. Explicit `provider` in `MemoriAIConfig`:
   - `'openai'` → `ProviderType.OPENAI`
   - `'anthropic'` → `ProviderType.ANTHROPIC`
   - `'ollama'` → `ProviderType.OLLAMA`

2. Otherwise by API key / pattern:
   - `sk-ant-*` → Anthropic
   - `sk-*` (length > 20) → OpenAI
   - `ollama-local` → Ollama

3. Fallback:
   - Defaults to OpenAI if nothing else matches.

Reference:
- [`MemoriAI.detectProvider`](src/core/MemoriAI.ts:313)

### 1.2 Memori

Memori performs simpler detection for its internal providers:

- `detectProviderType(config: IProviderConfig)`:
  - `apiKey` starting with `sk-ant-` → Anthropic.
  - `apiKey` starting with `sk-` and long enough → OpenAI.
  - `apiKey === 'ollama-local'` → Ollama.
  - Default → OpenAI.

Reference:
- [`Memori.detectProviderType`](src/core/Memori.ts:155)

Note:
- Memori primarily relies on already-sanitized config from `ConfigManager` and the supplied overrides.

### 1.3 ConfigManager and Environment

`ConfigManager.loadConfig()` is responsible for env-driven defaults:

- Required / used environment variables:
  - `DATABASE_URL` / `MEMORI_DATABASE_URL` (normalized to `databaseUrl`)
  - `MEMORI_NAMESPACE`
  - `MEMORI_CONSCIOUS_INGEST`
  - `MEMORI_AUTO_INGEST`
  - `MEMORI_ENABLE_RELATIONSHIP_EXTRACTION`
  - `MEMORI_MODEL`
  - `OPENAI_API_KEY`
  - `OPENAI_BASE_URL` (used for custom / Ollama-like endpoints)

Key behavior:
- If no valid `OPENAI_API_KEY` and no `OPENAI_BASE_URL`:
  - Throws a `ValidationError`.
- If `OPENAI_BASE_URL` is set without a usable key:
  - Sets `apiKey = 'ollama-local'` as a synthetic key.
- All values are sanitized; bad inputs raise `SanitizationError` / `ValidationError`.

Reference:
- [`ConfigManager.loadConfig`](src/core/infrastructure/config/ConfigManager.ts:29)

---

## 2. Memori Dual-Provider Architecture

Memori uses a dual-provider design to avoid recursive memory processing:

1. User Provider (`userProvider`)
   - A `MemoryCapableProvider`.
   - Handles user-facing operations (chat, embeddings).
   - Initialized with memory features enabled/disabled based on config.
   - Connected to the shared `DatabaseManager`.

2. Memory Provider (`memoryProvider`)
   - An `ILLMProvider`.
   - Used internally by `MemoryAgent` for analysis.
   - Initialized with memory processing disabled to prevent recursion.

Flow:
- `initializeProvider()`:
  - Builds `providerConfig` (performance + memory features).
  - Detects provider type (OpenAI/Anthropic/Ollama).
  - Constructs `userProvider` as `MemoryCapableProvider`.
  - Constructs `memoryProvider` for analysis with memory disabled.
  - Creates `MemoryAgent(memoryProvider, dbManager)`.

Reference:
- [`Memori.initializeProvider`](src/core/Memori.ts:72)

Implications:
- You can:
  - Use MemoriAI or Memori with a single API key/baseUrl.
  - Let the library manage separate analysis vs user-facing traffic.
- Avoid:
  - Manually constructing providers that bypass this pattern unless you know the consequences.

---

## 3. Configuration Patterns by Provider

Below are concrete, code-accurate examples using stable surfaces.

### 3.1 OpenAI

Scenario:
- Using OpenAI for both user chat and memory analysis.

Environment:

```bash
export DATABASE_URL="file:./memori.db"
export OPENAI_API_KEY="sk-your-openai-key"
```

Using MemoriAI:

```ts
import { MemoriAI } from 'memorits';

const ai = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY!,
  mode: 'automatic',
  namespace: 'support-bot',
});

const reply = await ai.chat({
  messages: [{ role: 'user', content: 'Remember that invoices go out on the 5th.' }],
});
```

Using Memori directly:

```ts
import { Memori } from 'memorits';

const memori = new Memori({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY!,
  mode: 'automatic',
  namespace: 'support-bot',
});

await memori.enable();
```

Notes:
- No custom `provider` value is required; detection via `apiKey` is sufficient.

---

### 3.2 Anthropic

Scenario:
- Using Anthropic for both user chat and memory analysis.

Environment:

```bash
export DATABASE_URL="file:./memori.db"
export OPENAI_API_KEY="sk-ant-your-anthropic-key"
```

(Anthropic key is read via `OPENAI_API_KEY` in current ConfigManager wiring; detection is based on `sk-ant-` prefix.)

MemoriAI:

```ts
const ai = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY!,
  // Optional explicit hint:
  provider: 'anthropic',
});
```

Memori:

```ts
const memori = new Memori({
  databaseUrl: 'file:./memori.db',
  apiKey: process.env.OPENAI_API_KEY!,
});
await memori.enable();
```

Notes:
- Prefix-based detection will route to Anthropic provider.
- Consider using an Anthropic-specific env var in your app code and mapping it to `apiKey` explicitly for clarity.

---

### 3.3 Ollama / Custom Base URL

Scenario:
- Using an Ollama-compatible endpoint locally.

Environment:

```bash
export DATABASE_URL="file:./memori.db"
export OPENAI_BASE_URL="http://localhost:11434/v1"
```

Configuration rules:
- If `OPENAI_BASE_URL` is set and no valid key:
  - `ConfigManager` sets `apiKey = 'ollama-local'`.
- Memori’s detection:
  - `ollama-local` → `ProviderType.OLLAMA`.

MemoriAI:

```ts
const ai = new MemoriAI({
  databaseUrl: 'file:./memori.db',
  apiKey: 'ollama-local',
  baseUrl: process.env.OPENAI_BASE_URL,
  provider: 'ollama', // explicit and clear
  mode: 'automatic',
});
```

Memori:

```ts
const memori = new Memori({
  databaseUrl: 'file:./memori.db',
  apiKey: 'ollama-local',
  baseUrl: process.env.OPENAI_BASE_URL,
  mode: 'automatic',
});
await memori.enable();
```

Notes:
- This keeps configuration explicit and aligns with actual detection logic.
- For non-Ollama custom endpoints that are OpenAI-compatible, use an appropriate key and URL together.

---

## 4. Recommended Patterns

- Prefer MemoriAI for:
  - Simple “drop-in” usage: chat + memory + search via one object.
- Prefer Memori for:
  - Advanced control over ingestion, search strategies, consolidation, and operations.

Best practices:
- Use explicit env vars and map them into config, rather than relying solely on implicit detection.
- Keep `namespace` consistent per tenant/application.
- Use a single shared `databaseUrl` + multiple namespaces when you want shared infrastructure and isolated memory.

---

## 5. Stability Notes

Public and supported:
- Provider selection via:
  - `MemoriAI` config (`provider`, `apiKey`, `baseUrl`, `mode`).
  - `Memori` config + `ConfigManager` env handling.
- Dual-provider design of Memori (user vs memory provider) as documented here.
- Using OpenAI, Anthropic, and Ollama-like endpoints via the patterns above.

Advanced but supported:
- Tuning provider performance/memory features through `IProviderConfig.features` when using low-level provider factories.
- Sharing a database between multiple Memori/MemoriAI instances for multi-tenant cases (with distinct namespaces).

Internal:
- Direct imports from `src/core/infrastructure/providers/**` and manual provider wiring.
- Reaching into private properties (e.g. `memori['userProvider']`) is unsupported and subject to change.

If you find discrepancies between this document and the actual provider-related code, treat that as a documentation bug.