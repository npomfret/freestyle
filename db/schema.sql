CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- Core catalog tables
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
    kind        TEXT NOT NULL CHECK (kind IN ('api', 'dataset', 'service', 'code')),
    PRIMARY KEY (resource_id, kind)
);

CREATE TABLE IF NOT EXISTS resource_topics (
    resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    topic       TEXT NOT NULL CHECK (topic IN (
        'banking', 'capital-markets', 'forex', 'commodities', 'economics',
        'insurance', 'crypto', 'alternative-data',
        'oil-gas', 'electricity', 'renewables', 'utilities',
        'crops', 'livestock', 'food',
        'climate', 'pollution', 'biodiversity', 'oceans',
        'public-health', 'clinical', 'pharma', 'mental-health',
        'chemistry', 'physics', 'biology', 'earth-science', 'materials',
        'neuroscience', 'drug-discovery', 'open-science',
        'space', 'astronomy', 'remote-sensing',
        'roads-traffic', 'public-transit', 'maritime', 'aviation', 'logistics',
        'ai-ml', 'nlp', 'iot', 'cybersecurity', 'developer', 'cloud',
        'government', 'law', 'crime', 'military',
        'demographics', 'education', 'employment', 'housing',
        'journalism', 'social-media', 'audio', 'images-video',
        'retail', 'manufacturing', 'construction',
        'sports', 'entertainment', 'gaming',
        'geospatial', 'urban',
        'humanitarian', 'trade',
        'bioinformatics', 'semantic-web', 'humanities', 'robotics'
    )),
    PRIMARY KEY (resource_id, topic)
);

CREATE TABLE IF NOT EXISTS resource_regions (
    resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    region      TEXT NOT NULL,
    PRIMARY KEY (resource_id, region)
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
-- Catalog source metadata captured for provenance
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
    status      TEXT NOT NULL DEFAULT 'alive' CHECK (status IN ('alive', 'suspect', 'dead')),
    fail_count  INT NOT NULL DEFAULT 0,
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
-- Resource analyses (longer-form writeups from agents)
-- ============================================================

CREATE TABLE IF NOT EXISTS resource_analyses (
    resource_id INT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
    analysis    TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_started_at TIMESTAMPTZ,
    processed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_discovery_queue_status ON discovery_queue(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_queue_url ON discovery_queue(url);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_resource_kinds_kind ON resource_kinds(kind);
CREATE INDEX IF NOT EXISTS idx_resource_topics_topic ON resource_topics(topic);
CREATE INDEX IF NOT EXISTS idx_resource_regions_region ON resource_regions(region);
CREATE INDEX IF NOT EXISTS idx_resource_sources_source ON resource_sources(source);
CREATE INDEX IF NOT EXISTS idx_resources_name_trgm ON resources USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_checks_status ON link_checks(status);
CREATE INDEX IF NOT EXISTS idx_link_checks_checked_at ON link_checks(checked_at ASC NULLS FIRST);
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
