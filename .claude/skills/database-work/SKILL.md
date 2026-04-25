---
description: Use for schema changes, migrations, SQL, resource queries, Postgres performance, pgvector/trigram search, queue processing, or scripts that read/write the database.
paths:
  - db/**
  - src/lib/db.ts
  - src/lib/catalog.ts
  - src/lib/resource-queries.ts
  - src/**/*.ts
user-invocable: true
---

# Database Work

Load `.claude/rules/database.md` and `.claude/references/database-conventions.md`.

Before editing:

1. Identify whether the task touches local Docker Postgres, the remote DB over tunnel, or production deployment.
2. Inspect existing tables, indexes, query shapes, and caller expectations.
3. Decide whether the change needs a migration, query-only change, data repair, or operational runbook.

Rules:

- Ask before write-capable DB commands or remote DB mutation.
- Use transactions for multi-step writes when consistency matters.
- Consider indexes with new filters, joins, ordering, uniqueness, or hot paths.
- Preserve existing data invariants around resources, kinds, topics, regions, link checks, queue rows, analyses, and embeddings.
- Keep migrations focused and reviewable.

Verification options:

- Static inspection of SQL and callers.
- `npm run compile`
- Targeted tests, or explicit user-approved DB commands when needed.
