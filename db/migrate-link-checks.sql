-- Migration: link_checks from boolean is_alive to text status with fail_count
-- Run with: psql $DATABASE_URL -f db/migrate-link-checks.sql

ALTER TABLE link_checks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'alive';
ALTER TABLE link_checks ADD COLUMN IF NOT EXISTS fail_count INT NOT NULL DEFAULT 0;

-- Migrate existing data
UPDATE link_checks SET status = 'alive', fail_count = 0 WHERE is_alive = true;
UPDATE link_checks SET status = 'dead', fail_count = 2 WHERE is_alive = false;

-- Drop old column
ALTER TABLE link_checks DROP COLUMN IF EXISTS is_alive;

-- Add check constraint
ALTER TABLE link_checks DROP CONSTRAINT IF EXISTS link_checks_status_check;
ALTER TABLE link_checks ADD CONSTRAINT link_checks_status_check CHECK (status IN ('alive', 'suspect', 'dead'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_link_checks_status ON link_checks (status);
CREATE INDEX IF NOT EXISTS idx_link_checks_checked_at ON link_checks (checked_at ASC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources (created_at DESC);
