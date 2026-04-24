# CLI Tool

The CLI lives in `src/search.ts` and runs via the existing `npm run search` script.

## Commands

| Command | Description |
|---------|-------------|
| `help` | Show usage information |
| `search <query>` | Search the catalog directly against the database |
| `random` | Return one random matching resource from the database |

## Options

- `--kind <kind>` — filter by kind: api, dataset, service, code
- `--topic <topic>` — filter by topic
- `--region <region>` — filter by region
- `--limit <n>` — max results for `search`
- `--markdown` — markdown output instead of plain text

## Examples

- `npm run search -- help`
- `npm run search -- search "satellite imagery for agriculture" --limit 10`
- `npm run search -- search "commodity data" --kind dataset --markdown`
- `npm run search -- random --kind api`
- `npm run search -- random --topic economics --markdown`

## Notes

- This CLI does not call the HTTP API; it queries Postgres directly through shared catalog logic.
- The implementation reuses the same query and enrichment layer as the API routes.
- There is no `src/cli.ts`, no `--json` flag, and no `FREESTYLE_API_URL` setting in the current implementation.
