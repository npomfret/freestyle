ALTER TABLE discovery_queue ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
