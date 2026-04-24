# API And CLI Implementation Note

This task added a shared catalog layer, extended the API with markdown output and a random-resource endpoint, and upgraded the existing search script into a small CLI with explicit commands and built-in help.

## What Changed

### Shared backend logic

- Added `src/lib/catalog.ts`
- Centralizes:
  - semantic search with text-search fallback
  - browse/filter queries
  - recent resources
  - single resource lookup
  - related resources
  - random resource selection
  - resource enrichment (kinds, topics, regions, sources, descriptions, analysis)
- Purpose:
  - API and CLI now use the same query path
  - avoids duplicating SQL across `src/server.ts` and `src/search.ts`

### Markdown formatting

- Added `src/lib/markdown.ts`
- Provides markdown rendering for:
  - a single resource
  - a list of resources
  - paginated search/browse results
- Includes:
  - name
  - URL
  - kinds/topics/regions
  - created/updated timestamps when present
  - similarity score when present
  - descriptions
  - sources
  - analysis text

### API changes

- Updated `src/server.ts`
- Existing API routes now support markdown output when either of these is used:
  - `?format=markdown`
  - `?format=md`
  - `Accept: text/markdown`
- Added a new route:
  - `GET /api/random`
- `GET /api/random` supports optional filters:
  - `kind`
  - `topic`
  - `source`
  - `region`
- Existing validation for `kind` was kept and moved into shared code.

### CLI changes

- Updated `src/search.ts`
- The old one-off search script is now a small command-based CLI.
- Supported commands:
  - `help`
  - `search`
  - `random`
- Supported options:
  - `--kind`
  - `--topic`
  - `--region`
  - `--limit` for `search`
  - `--markdown`
- Examples:
  - `npm run search -- help`
  - `npm run search -- search "commodity data" --limit 10`
  - `npm run search -- random --kind api --markdown`

### Docs

- Updated `README.md`
- Added examples for:
  - CLI help
  - CLI search
  - CLI random

## Files Changed

- `src/lib/catalog.ts`
- `src/lib/markdown.ts`
- `src/server.ts`
- `src/search.ts`
- `README.md`

## Behavior Summary

### API

- `/api/random` returns one random resource from the database
- `/api/random` can be filtered before random selection
- search/browse/detail/recent/related responses can optionally be returned as markdown
- JSON remains the default response format

### CLI

- `help` prints usage and option documentation
- `search` queries the same backend catalog logic used by the API
- `random` returns one random matching resource
- `--markdown` switches CLI output from plain text to markdown

## Verification

### Confirmed

- `npm run compile` passed
- `node --import tsx/esm src/search.ts help` worked and printed the expected help text

### Runtime issue encountered during live verification

Live API and DB-backed CLI verification did not complete successfully in the current environment because the test server process I started was not authenticating against the SSH tunnel.

Observed failure:

- `password authentication failed for user "freestyle"`

Observed context:

- local HTTP server was reachable on `http://127.0.0.1:3001`
- SSH tunnel was listening on `127.0.0.1:5543`
- the test backend process was not using credentials accepted by the tunneled database

This means the route wiring itself is in place, but I did not complete end-to-end verification against a confirmed-good backend/database pairing in this session.

## Suggested Review Checks

Once the backend is running with the correct tunnel-backed `DATABASE_URL`, these should be the main review checks:

```bash
curl 'http://127.0.0.1:3001/api/random'
curl -H 'Accept: text/markdown' 'http://127.0.0.1:3001/api/random?kind=api'
curl 'http://127.0.0.1:3001/api/search?q=commodity&limit=2&format=markdown'
node --import tsx/esm src/search.ts help
node --import tsx/esm src/search.ts random --kind api --markdown
```

## Notes

- The CLI still lives in `src/search.ts`; this task did not introduce a separate `src/cli.ts`.
- Markdown support was implemented in the API response layer, not by adding separate markdown-only endpoints.
- The random selection uses SQL `ORDER BY random() LIMIT 1`, which is correct for current scope but may need revisiting if the resource table becomes very large.
