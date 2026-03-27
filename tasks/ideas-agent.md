# Ideas Agent

## Context

The DB already has an `ideas` table linked to resources. The goal is an LLM agent that scans the catalog and generates concrete product/app ideas — things a developer could actually build using one or more of the free resources in the catalog. Each idea is stored with links to the resources it draws from.

## Database

Check schema for the existing `ideas` table and confirm columns. Add a migration if needed:
- `id`, `title`, `summary`, `resources` (array or junction), `created_at`
- If a junction table is needed: `idea_resources(idea_id, resource_id)`

## New Script: `src/ideas.ts`

Agentic loop (reuse `agent-runner.ts`) that:
1. Samples N resources from the catalog (prioritise those with analyses)
2. Asks the LLM to identify interesting combinations and generate ideas
3. Each idea: one-line title, 2–3 sentence summary, list of contributing resource IDs
4. Tool: `add_idea(title, summary, resource_ids[])` — deduplicates by title
5. Supports `--limit <n>` to cap how many ideas to generate per run

## Server

### `src/server.ts`
- `GET /api/ideas` — paginated list of ideas with their linked resources (name, URL)
- `?limit` / `?offset` query params

## Frontend

### `web/src/App.tsx`
- New "Ideas" tab or section alongside existing browse/search
- Cards showing title, summary, and linked resource names

## CLI (if cli.ts is built first)
- `ideas` command: `GET /api/ideas`, markdown list output

## Scripts (`package.json`)
- `"ideas": "tsx src/ideas.ts"`

## Verification

1. `npm run ideas` runs without error and inserts rows
2. `GET /api/ideas` returns populated ideas with linked resources
3. Re-running does not create duplicate ideas
