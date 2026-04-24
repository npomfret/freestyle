# Freestyle

Freestyle is a system for finding, recording, analysing, and maintaining a database of free or near-free datasets, databases, APIs, services, and related developer resources. It runs against a Postgres database with an Express API and a small React frontend for cataloging and search.

## Project Shape

- `src/` contains the TypeScript backend, data pipeline scripts, and maintenance jobs.
- `db/schema.sql` bootstraps the Postgres schema, including `pgvector` and trigram search support.
- `web/` contains the Vite/React frontend.

## Local Setup

The canonical database runs on the server (`fsd.snowmonkey.co.uk`). Day-to-day local development points at that server over an SSH tunnel — see [Remote DB tunnel](#remote-db-tunnel) below. **The tunnel must be running in a separate terminal before you start the backend or any DB-backed script (`npm run server`, `embed`, `discover`, `validity-check`, `repair`, `add-url`); nothing that talks to the database will work without it.** The CLI (`npm run search`) is the exception — it talks to the running API, not the database, so it only needs the server up. A local Docker Postgres is supported but rarely used; reach for it only for offline work or destructive experiments you don't want touching the real data.

1. Install dependencies in both app roots:
   - `npm install`
   - `cd web && npm install`
2. Copy `.env.example` to `.env` and fill in your keys
3. Start the SSH tunnel to the server DB with `npm run db:tunnel` in a separate terminal and leave it running, then point `DATABASE_URL` at it (see [Remote DB tunnel](#remote-db-tunnel)). The server and the pipeline scripts all assume the tunnel is already up. Only fall back to a local Postgres if you explicitly need one.
4. Set up an LLM provider (see LLM Providers below)
5. Generate embeddings (only when working against a local DB; the server DB already has them):
   - `npm run embed`
6. Start the backend:
   - `npm run server`
7. Start the frontend in another terminal:
   - `npm run dev:web`

`npm run dev` starts only the API server and Vite dev server. It does not start Docker Postgres or run migrations.

Defaults:

- API server: `http://localhost:3001`
- Frontend dev server: Vite default on `http://localhost:5173`
- Database URL (server via tunnel): `postgresql://freestyle:<server-password>@127.0.0.1:5543/freestyle`
- Database URL (local Docker, rarely used): `postgresql://freestyle:freestyle@localhost:5433/freestyle`

## Deployment

Production deploys are intended for `fsd.snowmonkey.co.uk` using Docker Compose from `/opt/freestyle`.

- `freestyle-db` runs `pgvector/pgvector:pg17` and is only exposed on server loopback, not publicly.
- `freestyle-app` serves both the API and the built frontend on port `3001`.
- Shared nginx stays outside this repo and should proxy to `freestyle-app:3001` on `snowmonkey-proxy-network`.
- Initial data should be copied from the local Postgres with `pg_dump` and restored into the server DB before starting the app.
- Ongoing local writes to the remote DB should use an SSH tunnel to the loopback-bound Postgres port, not a public DB port.

### Deploy from your laptop

`npm run deploy` orchestrates the whole thing locally:

1. **Pre-flight**: working tree clean, on the deploy branch, in sync with `upstream/<branch>`, `npm run compile` passes.
2. **Remote**: SSHes to the server, runs `git pull --ff-only && npm run deploy:build && npm run deploy:up` in `/opt/freestyle`.
3. **Verify**: polls `/health` until it responds or times out.

Any step failing aborts the deploy before the next one runs, so a bad commit or a type error never reaches the server.

Overridable via env vars when you need to deploy to a different target or branch:

- `DEPLOY_HOST` — default `root@fsd.snowmonkey.co.uk`
- `DEPLOY_PATH` — default `/opt/freestyle`
- `DEPLOY_BRANCH` — default `main`
- `DEPLOY_HEALTH_URL` — default `http://127.0.0.1:3001/health` (curled from the server)
- `HEALTH_ATTEMPTS` — default `10`

The individual steps (`deploy:build`, `deploy:db`, `deploy:up`, `deploy:logs`) still exist for when you want to run them manually on the server — they all shell out to `docker compose -f docker-compose.production.yml --env-file .env.production`.

### Remote DB tunnel

This is the normal way to run the app locally — the database lives on the server, not on your machine.

- `npm run db:tunnel` opens an SSH tunnel from local `localhost:5543` to the server Postgres on `fsd.snowmonkey.co.uk`
- Leave that terminal open while running local scripts against the remote database
- Point `DATABASE_URL` at the tunnel, for example: `postgresql://freestyle:<server-password>@127.0.0.1:5543/freestyle`
- Optional overrides:
  - `SSH_TUNNEL_HOST` defaults to `root@fsd.snowmonkey.co.uk`
  - `SSH_TUNNEL_LOCAL_PORT` defaults to `5543`
  - `SSH_TUNNEL_REMOTE_HOST` defaults to `127.0.0.1`
  - `SSH_TUNNEL_REMOTE_PORT` defaults to `5543`

For the exact server bootstrap, restore, nginx handoff, and SSH tunnel steps, see [docs/deploy.md](/Users/nickpomfret/projects/freestyle/docs/deploy.md).

## LLM Providers

The pipeline jobs (discover, validity-check, repair) need an LLM. Four provider backends are supported. Set `LLM_PROVIDER` in `.env`.

### `gemini-cli` (default)

Uses the [Gemini CLI](https://github.com/google-gemini/gemini-cli) to call Gemini models for free. The CLI handles auth via Google OAuth — run `gemini` once to set it up.

Since the CLI doesn't support native function calling, the provider simulates it by asking the model to output structured JSON and parsing the result. This is experimental but works well (~89% first-try success rate on the repair job).

**Model cascade**: Configure `GEMINI_MODELS` with a comma-separated list of models ordered cheapest-first. When one model hits its rate limit, the provider automatically escalates to the next. When all Gemini models are exhausted, it falls back to the `local` provider for the rest of the run (if `LOCAL_LLM_URL` is set).

```
GEMINI_MODELS=gemini-2.5-flash-lite,gemini-2.5-flash,gemini-3-flash-preview,gemini-2.5-pro,gemini-3.1-pro-preview
```

There are three independent free-tier quotas (flash-lite, flash, pro) spread across five models. This maximizes daily throughput without spending anything.

### `local` (OpenAI-compatible)

Any local server that speaks the OpenAI `/v1/chat/completions` API — MLX Studio, LM Studio, vllm, etc. Free and offline.

For MLX Studio each port runs one model, so `LOCAL_LLM_MODEL` is optional (the port determines the model). For multi-model servers like vllm, set `LOCAL_LLM_MODEL` to select the model.

```
LOCAL_LLM_URL=http://localhost:12334
LOCAL_LLM_MODEL=qwen2.5:7b   # optional for MLX Studio
```

### `ollama` (Ollama native)

Runs inference via [Ollama](https://ollama.com) using its native `/api/chat` format. `LOCAL_LLM_MODEL` is required.

```
LOCAL_LLM_MODEL=qwen2.5:32b
LOCAL_LLM_URL=http://localhost:11434
```

### `gemini` (paid API)

Uses the Gemini API directly with native function calling. Requires `GEMINI_API_KEY` and `GEMINI_MODEL`. This is the most reliable provider but costs money per request.

## Env Vars

See `.env.example` for a complete template.

- `DATABASE_URL` — Postgres connection string
- `PORT` — API server port
- `LLM_PROVIDER` — `gemini-cli` (default), `local`, `ollama`, or `gemini`
- `GEMINI_MODEL` — model name for `gemini-cli` (single model) and `gemini` providers
- `GEMINI_MODELS` — comma-separated model cascade for `gemini-cli` (overrides `GEMINI_MODEL`)
- `LOCAL_LLM_URL` — URL of the local LLM server (used by both `local` and `ollama` providers)
- `LOCAL_LLM_MODEL` — model name sent in requests; required for `ollama`, optional for `local` (MLX Studio ignores it — the port determines the model)
- `GEMINI_API_KEY` — required for the `gemini` provider and for web search grounding in `discover`
- `FREESTYLE_API_URL` — base URL the CLI (`npm run search`) hits; defaults to the deployed server (`https://fsd.snowmonkey.co.uk`). Set to `http://localhost:3001` (or similar) when exercising a local dev server.
## Important Run Targets

- `npm run embed` generates embeddings for resources and creates the vector index; optional env override example: `DATABASE_URL=postgresql://user:pass@localhost:5432/freestyle npm run embed`
- `npm run re-embed` re-embeds resources against the current local model; optional env override example: `DATABASE_URL=postgresql://user:pass@localhost:5432/freestyle npm run re-embed`
- `npm run server` starts the Express API and serves `web/dist` when it exists; examples: `PORT=4000 npm run server` or `PORT=4000 DATABASE_URL=postgresql://user:pass@localhost:5432/freestyle npm run server`
- `npm run dev:web` starts the Vite frontend in `web/`; extra Vite args can be forwarded, for example `npm run dev:web -- --host 0.0.0.0 --port 4173`
- `npm run build:web` builds the frontend for production
- API routes support optional markdown output with `?format=markdown`, `?format=md`, or `Accept: text/markdown`
- `GET /api/random` returns one random resource; optional filters: `kind`, `topic`, `source`, `region`
- `npm run search -- help` shows the CLI help text
- `npm run search -- search "your query"` runs a semantic search against the running API; example: `npm run search -- search "satellite imagery for agriculture" --limit 10`
- `npm run search -- random` returns one random resource from the running API; example: `npm run search -- random --kind api --markdown`
- The CLI hits the deployed server by default — no local setup required. Point `FREESTYLE_API_URL` at a local dev server if you want to test against uncommitted API changes (e.g. `FREESTYLE_API_URL=http://localhost:3001 npm run search -- random`).
- `npm run discover` runs the AI-assisted discovery flow and adds verified resources; examples: `npm run discover -- "free biodiversity datasets"`, `npm run discover -- --process-queue`, or `npm run discover -- --loop` to run continuously with auto-selected topics
- `npm run validity-check` checks resource URLs are still alive and attempts to repair broken ones; examples: `npm run validity-check -- 25`, `npm run validity-check -- --id 42`, `npm run validity-check -- --url https://example.com/api`
- `npm run validity-check:suspect` runs validity-check on only resources currently marked as suspect
- `npm run repair` re-indexes metadata for alive resources (name, description, topics, regions, analysis) using the LLM; examples: `npm run repair -- 25`, `npm run repair -- --id 42`
- `npm run repair:no-analysis` runs repair only on resources that have no analysis text yet
- `npm run repair:no-description` runs repair only on resources that have no description yet
- `npm run add-url -- <url>` runs the discovery agent on a specific URL you've found; example: `npm run add-url -- https://github.com/sportstimes/f1`. For GitHub organization URLs (e.g. `https://github.com/sportstimes`) it automatically fetches the repositories listing and queues all member repos for evaluation.

Notes:

- Docker Compose also supports `POSTGRES_PORT` and `POSTGRES_PASSWORD`, for example `POSTGRES_PORT=5434 docker compose up -d db`.
- `npm run embed` improves search quality; without embeddings the API falls back to text search.
- There is no single full-stack dev command yet, so backend and frontend are started separately.

## Debugging

Logs are written as newline-delimited JSON to `tmp/logs/`. Each process writes to a named file (`repair.log`, `discover.log`, `validity-check.log`, `server.log`). Previous runs are archived to `tmp/logs/archive/` with a timestamp suffix.

Tail a live run:

```
tail -f tmp/logs/repair.log | npx pino-pretty
# or without pino-pretty:
tail -f tmp/logs/repair.log
```

Common things to look for:

- `"all gemini models rate-limited, falling back to local LLM"` — all Gemini quotas are exhausted for the day. Either wait for reset, set `LOCAL_LLM_URL` to a running local server, or use the paid `gemini` provider.
- `"ECONNREFUSED … LOCAL_LLM_URL"` — the local LLM fallback URL is set but the server isn't running. Start your local LLM server or unset `LOCAL_LLM_URL` to disable the fallback.
- `"skipping — page appears broken (run validity-check first)"` — the fetch detected a redirect, 404, or empty page. Run `npm run validity-check` to mark those resources before repairing.
- `"repair failed"` with a stack trace — the agent crashed mid-turn. The `id` field identifies the resource; re-run with `npm run repair -- --id <id>` to retry it in isolation.
