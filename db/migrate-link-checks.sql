-- Migration: link_checks from boolean is_alive to text status with fail_count
-- Idempotent — safe to run multiple times.

ALTER TABLE link_checks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'alive';
ALTER TABLE link_checks ADD COLUMN IF NOT EXISTS fail_count INT NOT NULL DEFAULT 0;

-- Migrate existing data (only if old column still exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'link_checks' AND column_name = 'is_alive') THEN
    UPDATE link_checks SET status = 'alive', fail_count = 0 WHERE is_alive = true;
    UPDATE link_checks SET status = 'dead', fail_count = 2 WHERE is_alive = false;
    ALTER TABLE link_checks DROP COLUMN is_alive;
  END IF;
END $$;

-- Add check constraint
ALTER TABLE link_checks DROP CONSTRAINT IF EXISTS link_checks_status_check;
ALTER TABLE link_checks ADD CONSTRAINT link_checks_status_check CHECK (status IN ('alive', 'suspect', 'dead'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_link_checks_status ON link_checks (status);
CREATE INDEX IF NOT EXISTS idx_link_checks_checked_at ON link_checks (checked_at ASC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources (created_at DESC);
