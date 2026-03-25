# CLI Tool

Build a CLI (`src/cli.ts`) that exercises the REST API and outputs markdown by default, JSON with `--json`.

## Commands

| Command | Endpoint | Description |
|---------|----------|-------------|
| `stats` | `GET /api/stats` | Database statistics as a markdown table |
| `topics` | `GET /api/topics` | All topics with resource counts |
| `recent` | `GET /api/recent` | Recently added resources |
| `search <query>` | `GET /api/search` | Semantic search |
| `browse` | `GET /api/resources` | Browse/filter resources |
| `get <id>` | `GET /api/resources/:id` | Single resource detail |
| `help` | — | Usage info |

## Options

- `--json` — JSON output instead of markdown
- `--topic <topic>` — filter by topic (search, browse)
- `--kind <kind>` — filter by kind: api, dataset, service, code (search, browse)
- `--source <source>` — filter by source project (browse)
- `--limit <n>` — max results
- `--offset <n>` — pagination offset

## Environment

- `FREESTYLE_API_URL` — API base URL (default: `http://localhost:${PORT ?? 3001}`)

## Notes

- Add `"cli": "tsx src/cli.ts"` to package.json scripts
- Markdown output: tables for stats/topics, numbered lists for resources with name, URL, kinds, topics, similarity score, first description
- No extra dependencies needed — uses native `fetch`
