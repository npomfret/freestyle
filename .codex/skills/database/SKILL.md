---
name: database
description: >-
  The required rules for every part of this project that touches its database:
  schema, migrations, SQL, views, indexes, constraints, transactions and the
  tests around them. Load this before adding or changing a table, column,
  index, view, constraint or migration, before writing or tuning a query,
  before storing anything that comes back from an external API, and when a
  query is slow or a screen is waiting on the database. Covers never storing
  what can be derived, keeping one fact in one place, views instead of
  denormalised tables, keeping external payloads whole, proving every query
  has an index, timing every query and reporting a slow one with the plan and
  parameters needed to debug it, referential integrity and every other
  constraint in the database rather than the application, forward-only
  migrations, running every modification inside a transaction, and testing
  against the real engine.
---

## Database

This standard covers every project with a database: its schema, its migrations, the
queries the application issues, and the tests that exercise them. The default engine
is Postgres, in Docker, driven with SQL the project owns — `pg` directly, or a
builder thin enough that the SQL is still visible. Postgres features are used, not
avoided for portability: views, generated columns, partial and expression indexes,
`jsonb`, triggers, row-level security, in-database job queues.

The spine of it is one idea: **a fact is stored once, in the place that owns it, and
everything else is derived**. Most defects this standard prevents are two copies of
one fact disagreeing.

### Anti-patterns

No project has a good reason for these, and no comment excuses one. Everything else
in this standard is a strong default with a stated way out; these have none.

- SQL assembled by string concatenation with a value in it.
- Floating point for money or quantities.
- A naive timestamp, or an instant held as a string.
- Editing a migration that has already been applied somewhere.
- A query issued once per row of a loop.
- A connection or pool with no statement timeout.
- A stored derivation that application code has to keep up to date.

### Never store what can be derived

- A column whose value can be computed from other columns, other rows or other
  tables is not stored. Counts, totals, balances, running sums, ages, durations,
  `is_active`, `has_paid`, `full_name`, a formatted date, a copy of a parent's
  label: all derived.
- Derive at read time — in the query, in a view, or in a generated column.
- The reason is drift, not disk. A stored derivation has to be recomputed by every
  writer, and one day it is not: a backfill, a manual correction, a second service,
  a bug, a migration that inserts rows. Then two columns disagree and nothing in the
  database says which is right. A derivation cannot drift.
- The exception is a **measured** read cost, and it is paid for by letting the
  database maintain the value, never the application: a `GENERATED ALWAYS AS (…)
  STORED` column, or a materialized view. Record the measurement beside the
  migration that adds it.
- Store the instant, not its parts. A timestamp plus `year`, `month`, `week` or
  `day_of_week` columns beside it is the same mistake; index an expression instead.

### One fact, one place

- Normalise. Every value is written in exactly one column of one row, and referred
  to elsewhere by key.
- A foreign key, not a copied label. If a screen needs the name, join for it.
- Two columns that must agree are a single column somewhere else.
- The exception is a value that is deliberately **historical** rather than copied:
  the price at the time of sale, the address an invoice was issued to. That is not
  denormalisation, it is a different fact, and its column name says so
  (`price_charged`, not `price`).

### Views, not denormalised tables

- The wide shape a screen or report wants is a **view** over normalised tables. It
  costs nothing to change, it cannot fall out of step, and it is deleted when the
  screen is.
- A table the application fills with data copied from other tables is the thing this
  standard exists to prevent. A change to it means a migration and a backfill, and
  it is wrong between the two writes.
- When a plain view is too slow — measured, on realistic data — use a materialized
  view. Give it exactly one refresh owner, say in the migration what triggers the
  refresh, and make its staleness visible to whatever reads it. `REFRESH … CONCURRENTLY`
  needs a unique index.
- Name a view for the question it answers.

### External data arrives whole

- Store a provider's response as it arrived, in `jsonb` or an archive, alongside
  what was asked for, which provider answered, and when.
- Derive the columns from that record. Never let the parse be the only copy of what
  came back.
- The reason is that the parse is provisional. A decoder improves, a provider adds a
  field, an assumption turns out wrong — and re-deriving must not mean re-fetching.
  Refetching costs money, is rate-limited, and for chain and market data is often
  impossible: the answer was true at a block height that has passed.
- Do not reshape at the edge for tidiness — renaming the provider's fields,
  collapsing its enums into local ones, dropping what looks irrelevant, flattening a
  nested structure. The original shape is evidence; the local shape is an opinion,
  and opinions get revised.
- Raw records are immutable. A correction is a new row, not an edit, and the
  interpretation layer decides which record wins.

### Every query has an index

- Every query the application issues has an index that serves its filtering, its
  joins and its ordering. A sequential scan on a growing table is a defect, not a
  slow query.
- Prove it with `EXPLAIN (ANALYZE, BUFFERS)` against realistic data. An empty
  development table plans everything as a scan and tells you nothing.
- Postgres does **not** index a foreign key for you. Index the ones that are joined
  or filtered on.
- Composite index order is equality columns, then the range column, then the sort.
  One well-ordered composite beats three single-column indexes.
- A query that always carries the same predicate gets a partial index. A query that
  calls a function on a column gets an expression index. A `jsonb` field that is
  queried gets a GIN or expression index, or it should have been a column.
- An index no query uses is deleted: every index is a tax on every write.
- A new query path and its index land in the same change, and the migration that
  adds an index names the query that needs it.

### Every query is timed, and slow ones report themselves

- Every query the application issues is timed and recorded, in every environment,
  always on. Measurement is not a thing switched on after a complaint: by then the
  slow query has already happened and nobody knows which one it was.
- The timing belongs in the one place that issues SQL — the pool wrapper, the
  repository base, the query-builder plugin. Never at call sites, or it will cover
  the queries someone remembered and not the one that is slow.
- Separate **waiting** from **executing**. Time spent waiting for a pool
  connection, and time the statement itself took, are different defects with
  different fixes, and a single duration hides which one happened.
- Over a threshold, emit one structured record — a fixed event name and fields,
  never an interpolated sentence — carrying everything needed to fix it without
  reproducing it:
  - the statement as sent, with its placeholders intact, and the bound parameters
    beside it, so it can be pasted into `psql` and run;
  - duration, split into wait and execution, and the row count;
  - where it came from: the module or repository method, and the request, job or
    run id, so it can be tied to what the user or worker was doing;
  - whether it ran inside a transaction, and how long that transaction was open;
  - the plan. Fetch `EXPLAIN (ANALYZE, BUFFERS)` for the statement when it breaches
    the threshold — never for every query — and include it, because a plan captured
    at the moment it was slow is worth more than one obtained afterwards on
    different data.
- Redact by column, not by hope. Parameters carry personal data, keys and wallet
  identities, and a slow-query record is still a log.
- **Count queries per unit of work as well as timing them.** An N+1 is two hundred
  fast queries and no slow one, so it is invisible to a duration threshold alone.
  Record the number of queries and the total database time for each request or job,
  and report anything above the project's budget the same way.
- Thresholds and budgets are configuration, recorded with the reason for the number.
  A query that is legitimately slow — a nightly aggregate, a backfill — is excluded
  by name, never by raising the threshold for everything else.
- The database keeps its own account, and it is the backstop that catches what the
  application layer cannot see: migrations, scripts, `psql`, another service. Enable
  `pg_stat_statements`, and set `log_min_duration_statement` — `auto_explain` where
  the plans are worth having. Read `pg_stat_statements` by total time, not by worst
  case: the query that costs the most is usually a quick one run constantly.
- A report that does not let the engineer reproduce the problem is not a report.
  Anything that says only that something was slow is a defect in the instrumentation.

### Constraints belong in the database

- `NOT NULL` is the default. A nullable column is a claim that absence means
  something; say what it means.
- **Every reference is a foreign key.** A column holding another table's key with no
  constraint on it is a relationship the database does not know about, and the row
  it points at will eventually not be there — deleted by a cleanup, missed by a
  backfill, never inserted because the write order was wrong. Declare it wherever
  the engine can: same database, real column, both sides present.
- Every foreign key states `ON DELETE` explicitly. `CASCADE` where the child has no
  meaning without its parent, `RESTRICT` where losing the parent should be refused,
  `SET NULL` only where null already means something in that column. Deciding it
  later means deciding it never, and the default is rarely the one intended.
- Where a foreign key genuinely cannot be declared — a key buried in `jsonb`, a
  reference to another service's data, a partitioned table the engine will not
  constrain — that is first an argument about the shape: lift the key into a column
  of its own. If it still stands, integrity becomes a trigger or a job that reports
  orphans, the migration records which and why, and a circular insert order uses a
  `DEFERRABLE` constraint rather than no constraint. An unenforced reference is not
  flexibility, it is a rule nobody checks.
- `UNIQUE` for anything that is an identity. `CHECK` for ranges, enumerations and
  invariants that hold within a row.
- An invariant enforced only in application code is enforced nowhere. Migrations,
  backfills, scripts, a second service and `psql` all write to this database.
- The application still validates at its edge, for good error messages. The database
  is what makes the rule true.

### Types

- `timestamptz`, stored in UTC. Never a naive timestamp, never a string.
- Money and quantities are `numeric` or integer minor units. Never floating point.
- A fixed set of values is a lookup table with a foreign key, or a `CHECK`. Not a
  free-text column, and not an enum type that needs a migration to add a value.
- `jsonb` is for genuinely document-shaped data — a provider payload, a captured
  request. It is not a way to avoid designing columns for fields the application
  filters, sorts or joins on.
- One identity scheme per project, applied consistently. A natural key only when it
  is a real, stable, external identity.

### Migrations

- Numbered, checked in, plain SQL, one concern each. Prefer forward-only to a down
  migration: the correction for a bad migration is the next migration, and a down
  path that is never exercised is not a rollback, it is an untested one.
- An applied migration is never edited. Not even a typo in a comment — a checked-in
  migration has run somewhere.
- Schema, the code that uses it, and regenerated types all land in the same commit.
- A migration is run against a copy of real data before it runs anywhere that
  matters. Size and lock time are the things that go wrong, and neither shows up on
  an empty table.
- Do not hold a long lock. Add a column nullable, backfill in batches, then add the
  constraint. Build indexes `CONCURRENTLY` on a table that is in use.
- Dropping a column or table is its own migration, after the change that stopped
  using it has shipped.

### Transactions and concurrency

- **Every modification runs in a transaction.** Inserts, updates, deletes and DDL,
  including the ones that are a single statement today. Postgres wraps a lone
  statement anyway, so writing it out buys nothing this minute — it buys the minute
  someone adds a second statement beside it, which otherwise becomes two independent
  writes with a window between them and nothing in the diff to show it.
- One unit of work is one transaction. Every write that must succeed or fail
  together is inside it, and so are the reads that decide them: a read that chooses
  a write and sits outside its transaction is a race.
- The layer that owns SQL owns the boundary, and offers it as the only way to write
  — a `withTransaction(fn)` the caller runs inside. A repository method that writes
  accepts the transaction it was given and never reaches for its own connection,
  which is what makes "I forgot" impossible rather than discouraged.
- Never split one unit of work across two transactions to save a round trip. Two
  transactions have a state between them, and something will observe it.
- Transactions stay short and contain no network calls. Never hold one open across
  an external request.
- A backfill or batch job is chunked, one transaction per chunk, and restartable
  from where it stopped. One transaction over a million rows holds locks, bloats the
  table and cannot be resumed after it fails.
- Migrations run in a transaction, so a failure leaves nothing half-applied. The
  statements that cannot — `CREATE INDEX CONCURRENTLY` among them — are the reason
  those get a migration to themselves.
- Let the database settle races: a unique constraint with `INSERT … ON CONFLICT`, an
  advisory lock, `SELECT … FOR UPDATE`. "Check, then insert" is not a decision, it is
  a guess about timing.
- Where the isolation level can fail a transaction — serialization failure,
  deadlock — the caller retries. Say so where it is relied upon.

### Queries from the application

- SQL is written, not concatenated. Values reach it as bound parameters, always,
  including in scripts and one-off tools.
- Prefer naming the columns to `SELECT *`, which breaks silently when the schema
  changes.
- No N+1. A loop issuing one query per row is one query with a join or an aggregate.
- Paginate by keyset — `WHERE (sorted_at, id) < ($1, $2)` — not `OFFSET`, on anything
  large or live.
- Large result sets are streamed or batched, not loaded whole.
- Connections come from a pool, and there is a statement timeout. A query with no
  timeout is an outage waiting for its input.

### Testing

- Prefer the real engine at the production version, in Docker, to a stand-in: not
  SQLite for Postgres, and not a mocked database. The things worth testing are
  constraints, transactions, indexes and SQL semantics, and a stand-in has none of
  them.
- Each test creates the data it needs and depends on no other test's state.
- Migrations are tested by running them, from empty and from a realistic dump.
- A query added for performance is tested for correctness and measured for the plan
  it actually gets.

### Departing from this standard

Everything here except the anti-patterns is a default, and a project can have a real
reason to differ.

- A departure carries a comment where it happens — in the migration, beside the
  query, on the column — naming the constraint that makes the standard's route
  impossible. Verify the claim first: if the comment says a foreign key cannot be
  declared, check that it cannot.
- Where the reason is cost, it is **measured**, on realistic data, and the
  measurement is recorded beside the change. An unmeasured performance claim is not
  a reason.
- A second departure for the same reason is not two exceptions. Change the shape —
  lift the key into a column, extend the view, fix the index — so the reason stops
  applying.

### Finishing

- The migration, the code and the regenerated types are in one commit, and the
  project's check is green.
- The summary says what was derived rather than stored, which view answers the new
  shape, and the plan for any new query path.

*Generated from `npomfret/agent-standards`. Edit the standard there, not this copy.*
