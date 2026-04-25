# Architecture Map

## Backend

- `src/server.ts`: Express API, markdown negotiation, health, stats, search, browsing, resource detail, random and related endpoints.
- `src/lib/catalog.ts`: catalog read/search/browse/resource query API used by the server.
- `src/lib/db.ts`: Postgres pool creation and DB utilities.
- `src/lib/logger.ts`: newline-delimited JSON logger and `serializeError`.
- `src/lib/llm.ts`: provider selection boundary for pipeline jobs.
- `src/lib/gemini-cli-provider.ts`, `src/lib/gemini-provider.ts`, `src/lib/local-provider.ts`, `src/lib/ollama-provider.ts`: LLM provider implementations.
- `src/discover.ts`: AI-assisted discovery and queue processing.
- `src/recheck.ts`: link validity checks and suspect/dead status maintenance.
- `src/repair.ts`: metadata/analysis repair for existing resources.
- `src/generate-embeddings.ts`, `src/re-embed-all.ts`: embedding generation and refresh.
- `src/search.ts`: CLI client against the running API.

## Database

- `db/schema.sql`: canonical schema, extensions, tables, indexes, and bootstrap shape.
- `db/migrate-*.sql`: incremental migrations.
- Normal local DB-backed work points at the remote server through `npm run db:tunnel`.

## Frontend

- `web/src/App.tsx`: main app composition and screen state.
- `web/src/hooks.ts`: data fetching and resource search hooks.
- `web/src/api.ts`: API client functions.
- `web/src/types.ts`: frontend API/resource types.
- `web/src/ResourceCard.tsx`, `web/src/ResourceModal.tsx`: resource presentation.
- `web/src/App.css`, `web/src/index.css`: app and global styling.

## Verification

- `npm test`: backend tests under `src/**/*.test.ts`.
- `npm run compile`: root TypeScript check plus `web` TypeScript check.
- `npm run build:web`: Vite production build.
- `npm run format -- <files>`: dprint formatting for TS/TSX/JS/JSX/JSON.
