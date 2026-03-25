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
2. Start the database:
   - `docker compose up -d db`
3. Load data into Postgres:
   - `npm run seed`
   - `npm run embed`
4. If you need to rebuild the catalog from source first:
   - make sure `free-stuff/` is present
   - run `npm run generate`
   - then rerun `npm run seed`
5. Start the backend:
   - `npm run server`
6. Start the frontend in another terminal:
   - `npm run dev:web`

Defaults:

- API server: `http://localhost:3001`
- Frontend dev server: Vite default on `http://localhost:5173`
- Database URL: `postgresql://freestyle:freestyle@localhost:5433/freestyle`

Optional env vars:

- `DATABASE_URL` to point at a different Postgres instance
- `PORT` to change the API port
- `GEMINI_API_KEY` for the AI-assisted `discover` and `recheck` jobs

## Important Run Targets

- `npm run generate` rebuilds generated catalog artifacts from `free-stuff/`; no CLI parameters
- `npm run seed` loads `catalog.json` into Postgres; optional env override example: `DATABASE_URL=postgresql://user:pass@localhost:5432/freestyle npm run seed`
- `npm run embed` generates embeddings for resources and creates the vector index; optional env override example: `DATABASE_URL=postgresql://user:pass@localhost:5432/freestyle npm run embed`
- `npm run re-embed` re-embeds resources against the current local model; optional env override example: `DATABASE_URL=postgresql://user:pass@localhost:5432/freestyle npm run re-embed`
- `npm run server` starts the Express API and serves `web/dist` when it exists; examples: `PORT=4000 npm run server` or `PORT=4000 DATABASE_URL=postgresql://user:pass@localhost:5432/freestyle npm run server`
- `npm run dev:web` starts the Vite frontend in `web/`; extra Vite args can be forwarded, for example `npm run dev:web -- --host 0.0.0.0 --port 4173`
- `npm run build:web` builds the frontend for production
- `npm run search -- "your query"` runs a CLI semantic search against the DB; example: `npm run search -- "satellite imagery for agriculture"`
- `npm run discover` runs the Gemini-assisted discovery flow and adds verified resources; examples: `GEMINI_API_KEY=... npm run discover -- "free biodiversity datasets"` or `GEMINI_API_KEY=... npm run discover -- --process-queue`
- `npm run recheck` revalidates existing resources and refreshes metadata/health; example: `GEMINI_API_KEY=... npm run recheck -- 25`

Notes:

- If `catalog.json` is already present, you can ignore `free-stuff/` and skip `npm run generate`.
- `free-stuff/` is only required for rebuilding the catalog from source.
- Docker Compose also supports `POSTGRES_PORT` and `POSTGRES_PASSWORD`, for example `POSTGRES_PORT=5434 docker compose up -d db`.
- `npm run embed` improves search quality; without embeddings the API falls back to text search.
- There is no single full-stack dev command yet, so backend and frontend are started separately.
