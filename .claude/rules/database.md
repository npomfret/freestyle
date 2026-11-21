# Database Rules

Applies to `db/**` and any `src/**` code that reads or writes Postgres.

- `db/schema.sql` is the canonical bootstrap schema. Migration files in `db/migrate-*.sql` must be idempotent enough to reason about safely.
- Consider transaction boundaries for multi-step writes and read-modify-write behavior.
- Consider indexes and query shape when adding filters, joins, search paths, or looped queries.
- Preserve existing resource, kind, topic, region, link-check, queue, analysis and embedding relationships and invariants unless explicitly changing the data model.
- Know which database a change touches: local Docker Postgres, the remote DB over the `npm run db:tunnel` tunnel, or production.
- Schema and migration conventions: `.claude/references/database-conventions.md`.
- Run migrations, direct write SQL and scripts that mutate the remote database when the task calls for them; state it in your report.
