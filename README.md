# Freestyle

Freestyle is a local catalog and search app for free APIs, open datasets, and related developer resources. In normal use it runs from the generated `catalog.json` data and a local Postgres database, with an Express API plus a small React frontend. The checked-out `free-stuff/` repo collection is only needed if you want to regenerate the catalog from source.

## Project Shape

- `src/` contains the TypeScript backend, data pipeline scripts, and maintenance jobs.
- `db/schema.sql` bootstraps the Postgres schema, including `pgvector` and trigram search support.
- `web/` contains the Vite/React frontend.
- `free-stuff/` is an optional source corpus used only by `npm run generate`.
- `catalog.json` is the generated structured output used for seeding the database and is enough for normal local app usage.
- `CATALOG.md` is the generated long-form catalog document, if you choose to regenerate it.

## Local Setup

1. Install dependencies in both app roots:
   - `npm install`
   - `cd web && npm install`
2. Copy `.env.example` to `.env` and fill in your keys
3. Start the database:
   - `docker compose up -d db`
4. Set up an LLM provider (see LLM Providers below)
5. Load data into Postgres:
   - `npm run seed`
   - `npm run embed`
6. If you need to rebuild the catalog from source first:
   - make sure `free-stuff/` is present
   - run `npm run generate`
   - then rerun `npm run seed`
7. Start the backend:
   - `npm run server`
8. Start the frontend in another terminal:
   - `npm run dev:web`

Defaults:

- API server: `http://localhost:3001`
- Frontend dev server: Vite default on `http://localhost:5173`
- Database URL: `postgresql://freestyle:freestyle@localhost:5433/freestyle`

## LLM Providers

The pipeline jobs (discover, validity-check, repair) need an LLM. Three provider backends are supported. Set `LLM_PROVIDER` in `.env`.

### `gemini-cli` (default)

Uses the [Gemini CLI](https://github.com/google-gemini/gemini-cli) to call Gemini models for free. The CLI handles auth via Google OAuth — run `gemini` once to set it up.

Since the CLI doesn't support native function calling, the provider simulates it by asking the model to output structured JSON and parsing the result. This is experimental but works well (~89% first-try success rate on the repair job).

**Model cascade**: Configure `GEMINI_MODELS` with a comma-separated list of models ordered cheapest-first. When one model hits its rate limit, the provider automatically escalates to the next. When all Gemini models are exhausted, it falls back to Ollama for the rest of the run.

```
GEMINI_MODELS=gemini-2.5-flash-lite,gemini-2.5-flash,gemini-3-flash-preview,gemini-2.5-pro,gemini-3.1-pro-preview
```

There are three independent free-tier quotas (flash-lite, flash, pro) spread across five models. This maximizes daily throughput without spending anything.

### `ollama` (local)

Runs inference locally via [Ollama](https://ollama.com). Free and offline, but uses significant CPU/GPU — not ideal for laptops running long batch jobs.

```
OLLAMA_MODEL=qwen2.5:32b
OLLAMA_URL=http://localhost:11434
```

### `gemini` (paid API)

Uses the Gemini API directly with native function calling. Requires `GEMINI_API_KEY` and `GEMINI_MODEL`. This is the most reliable provider but costs money per request.

## Env Vars

See `.env.example` for a complete template.

- `DATABASE_URL` — Postgres connection string
- `PORT` — API server port
- `LLM_PROVIDER` — `gemini-cli` (default), `ollama`, or `gemini`
- `GEMINI_MODEL` — model name for `gemini-cli` (single model) and `gemini` providers
- `GEMINI_MODELS` — comma-separated model cascade for `gemini-cli` (overrides `GEMINI_MODEL`)
- `OLLAMA_MODEL` — Ollama model name (required when `LLM_PROVIDER=ollama`)
- `OLLAMA_URL` — Ollama server URL (default: `http://localhost:11434`)
- `GEMINI_API_KEY` — required for the `gemini` provider and for web search grounding in `discover`

## Important Run Targets

- `npm run generate` rebuilds generated catalog artifacts from `free-stuff/`; no CLI parameters
- `npm run seed` loads `catalog.json` into Postgres; optional env override example: `DATABASE_URL=postgresql://user:pass@localhost:5432/freestyle npm run seed`
- `npm run embed` generates embeddings for resources and creates the vector index; optional env override example: `DATABASE_URL=postgresql://user:pass@localhost:5432/freestyle npm run embed`
- `npm run re-embed` re-embeds resources against the current local model; optional env override example: `DATABASE_URL=postgresql://user:pass@localhost:5432/freestyle npm run re-embed`
- `npm run server` starts the Express API and serves `web/dist` when it exists; examples: `PORT=4000 npm run server` or `PORT=4000 DATABASE_URL=postgresql://user:pass@localhost:5432/freestyle npm run server`
- `npm run dev:web` starts the Vite frontend in `web/`; extra Vite args can be forwarded, for example `npm run dev:web -- --host 0.0.0.0 --port 4173`
- `npm run build:web` builds the frontend for production
- `npm run search -- "your query"` runs a CLI semantic search against the DB; example: `npm run search -- "satellite imagery for agriculture"`
- `npm run discover` runs the AI-assisted discovery flow and adds verified resources; examples: `npm run discover -- "free biodiversity datasets"`, `npm run discover -- --process-queue`, or `npm run discover -- --loop` to run continuously with auto-selected topics
- `npm run validity-check` checks resource URLs are still alive and attempts to repair broken ones; examples: `npm run validity-check -- 25`, `npm run validity-check -- --id 42`, `npm run validity-check -- --url https://example.com/api`
- `npm run repair` re-indexes metadata for alive resources (name, description, topics, regions, analysis) using the LLM; examples: `npm run repair -- 25`, `npm run repair -- --id 42`

Notes:

- If `catalog.json` is already present, you can ignore `free-stuff/` and skip `npm run generate`.
- `free-stuff/` is only required for rebuilding the catalog from source.
- Docker Compose also supports `POSTGRES_PORT` and `POSTGRES_PASSWORD`, for example `POSTGRES_PORT=5434 docker compose up -d db`.
- `npm run embed` improves search quality; without embeddings the API falls back to text search.
- There is no single full-stack dev command yet, so backend and frontend are started separately.
