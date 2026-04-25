# Database Rules

Applies to `db/**` and any `src/**` code that reads or writes Postgres.

- `db/schema.sql` is the canonical bootstrap schema. Migration files in `db/migrate-*.sql` must be idempotent enough to reason about safely.
- Consider transaction boundaries for multi-step writes and read-modify-write behavior.
- Consider indexes and query shape when adding filters, joins, search paths, or looped queries.
- Preserve existing resource, topic, region, link-check, queue, and analysis relationships unless explicitly changing the data model.
- Ask before running migrations, direct write SQL, or scripts that mutate the remote database.
