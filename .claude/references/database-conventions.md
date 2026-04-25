# Database Conventions

- Schema changes should include the table/column/index reason, expected cardinality, and any backfill or migration ordering concern.
- Prefer explicit constraints over application-only assumptions when the invariant belongs in the database.
- Use indexes for new hot filters, joins, uniqueness checks, and ordering paths when existing indexes do not cover the query.
- Keep migrations small and reviewable. Avoid mixing unrelated schema changes.
- Do not run write SQL against the remote DB without explicit approval.
