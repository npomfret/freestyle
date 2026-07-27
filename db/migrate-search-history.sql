-- Cross-run memory of discovery search queries.
--
-- The discover agent is stateless per run, so without this it re-issues the
-- same lookup_web terms over time and re-surfaces resources we already have.
-- Recording each query lets a run load recent queries and deliberately search
-- for different things. Expected cardinality: one row per lookup_web call
-- (low volume); reads are "recent distinct queries", covered by the index.
CREATE TABLE IF NOT EXISTS search_history (
    id         SERIAL PRIMARY KEY,
    query      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at DESC);
