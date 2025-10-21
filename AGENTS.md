# Agent Handbook

Practical guidance for anyone touching the `memori-ts` codebase.

## Core Commands
- Install deps: `npm install`
- Type check: `npx tsc --noEmit`
- Lint (fix): `npm run lint:fix`
- Unit tests: `npm test`
- Initialise database: `npx memorits init-db --url file:./memori.db`
- Update Prisma schema: `npm run prisma:push` then `npm run prisma:generate`
- Run examples: `npm run example:*`

## Workflow Checklist
1. **Sync env vars** – copy `.env.example` if provided and set `DATABASE_URL`, `MEMORI_*`, provider keys.
2. **Prep the DB** – run the Prisma push/generate sequence before testing anything that hits the database.
3. **Enable logging context** – use `logInfo/logError` with `component`, `sessionId`, `namespace`, etc.
4. **Run lint + tests** before sending changes. If Prisma schema changed, re-run generate and commit the updated client.
5. **Update docs** in `docs/` whenever you change public API, configuration, or workflows.

## Code Style & Patterns
- Stick to **domain-driven imports** (`domain/`, `infrastructure/`, `types/`) instead of deep relative paths when possible.
- Types live in `src/core/types/`; Zod schemas back runtime validation—extend both when adding new shapes.
- Public APIs should expose clean interfaces (`MemoriAI`, `Memori`, provider factories). Avoid leaking internal classes.
- Logging: every log must include `component` plus operation context. Failing to do so breaks downstream tooling.
- Providers are created through `src/core/infrastructure/providers`; reuse existing factories instead of new singletons.

## Memory Pipeline Guardrails
- `MemoriAI` is the entry point for clients; `Memori` is the advanced API. Keep feature parity consistent.
- Memory processing flows through `MemoryAgent` and `DatabaseManager`. When modifying ingestion, ensure both short- and long-term storage still work.
- Search relies on `SearchManager` + `SearchService`; FTS5 is optional. Always provide LIKE fallbacks.
- Duplicate handling lives in `DuplicateManager` and the consolidation service. Use transactions for write operations.

## Provider Notes
- OpenAI & Anthropic: real API keys required. Ollama: set `OPENAI_BASE_URL` and use `ollama-local` as the key.
- `LLMProviderFactory` handles initialization; do not instantiate provider classes directly unless you need custom wiring.
- Shared memory comes from pointing providers at the same `databaseUrl` + `namespace`.

## Testing Expectations
- Unit tests use Jest with TypeScript support. Place them under `tests/` mirroring source structure.
- Memory/search features often require SQLite; tests create disposable databases—do not rely on global state.
- For docs or config-only changes, note in your PR why tests were skipped.

## When in Doubt
- Read the updated developer docs under `docs/developer/`.
- Ask whether a change affects public API, configuration, or provider behaviour and update docs accordingly.
- Keep changes small and well-documented in Git commits.***
