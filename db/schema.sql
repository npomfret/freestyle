CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- Core tables (regenerated from source repos)
-- ============================================================

CREATE TABLE IF NOT EXISTS resources (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    url         TEXT NOT NULL UNIQUE,
    embedding   vector(384),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_kinds (
    resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    PRIMARY KEY (resource_id, kind)
);

CREATE TABLE IF NOT EXISTS resource_topics (
    resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    topic       TEXT NOT NULL,
    PRIMARY KEY (resource_id, topic)
);

CREATE TABLE IF NOT EXISTS resource_sources (
    resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    source      TEXT NOT NULL,
    PRIMARY KEY (resource_id, source)
);

CREATE TABLE IF NOT EXISTS resource_descriptions (
    resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    PRIMARY KEY (resource_id, description)
);

-- ============================================================
-- Source projects (the ~150 repos in free-stuff/)
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    repo_url    TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    list_based  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_labels (
    project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    PRIMARY KEY (project_id, label)
);

-- ============================================================
-- User/editorial tables (preserved across rebuilds)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_notes (
    id          SERIAL PRIMARY KEY,
    resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    note        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_ratings (
    resource_id INT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
    rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS link_checks (
    resource_id INT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
    checked_at  TIMESTAMPTZ NOT NULL,
    status_code INT,
    is_alive    BOOLEAN NOT NULL,
    notes       TEXT
);

-- ============================================================
-- Ideas and linkage
-- ============================================================

CREATE TABLE IF NOT EXISTS ideas (
    id          SERIAL PRIMARY KEY,
    number      INT UNIQUE,
    title       TEXT NOT NULL,
    category    TEXT,
    summary     TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idea_resources (
    idea_id     INT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    PRIMARY KEY (idea_id, resource_id)
);

-- ============================================================
-- Discovery queue (for the agent crawler)
-- ============================================================

CREATE TABLE IF NOT EXISTS discovery_queue (
    id          SERIAL PRIMARY KEY,
    url         TEXT NOT NULL,
    label       TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'pending',
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_discovery_queue_status ON discovery_queue(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_queue_url ON discovery_queue(url);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_resource_kinds_kind ON resource_kinds(kind);
CREATE INDEX IF NOT EXISTS idx_resource_topics_topic ON resource_topics(topic);
CREATE INDEX IF NOT EXISTS idx_resource_sources_source ON resource_sources(source);
CREATE INDEX IF NOT EXISTS idx_resources_name_trgm ON resources USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_user_notes_resource ON user_notes(resource_id);
CREATE INDEX IF NOT EXISTS idx_idea_resources_resource ON idea_resources(resource_id);

-- ============================================================
-- Full-text search (generated column + GIN index)
-- ============================================================

ALTER TABLE resources ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(name, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_resources_fts ON resources USING gin(fts);

-- ============================================================
-- Vector similarity index (created automatically by generate-embeddings.ts after data is loaded)
-- CREATE INDEX idx_resources_embedding ON resources
--     USING hnsw (embedding vector_cosine_ops);
-- ============================================================
