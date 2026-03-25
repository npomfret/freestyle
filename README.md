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

- `npm run generate` scans `free-stuff/` and rebuilds generated catalog artifacts; this is only needed when refreshing source data
- `npm run seed` loads `catalog.json` into Postgres
- `npm run embed` generates embeddings for resources and creates the vector index
- `npm run server` starts the Express API and serves `web/dist` when it exists
- `npm run dev:web` starts the Vite frontend in `web/`
- `npm run build:web` builds the frontend for production
- `npm run search -- "your query"` runs a CLI semantic search against the DB
- `npm run discover` runs the Gemini-assisted discovery flow and adds verified resources
- `npm run recheck` revalidates existing resources and refreshes metadata/health

Notes:

- If `catalog.json` is already present, you can ignore `free-stuff/` and skip `npm run generate`.
- `free-stuff/` is only required for rebuilding the catalog from source.
- `npm run embed` improves search quality; without embeddings the API falls back to text search.
- There is no single full-stack dev command yet, so backend and frontend are started separately.
