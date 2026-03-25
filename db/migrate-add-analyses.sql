-- Migration: add resource_analyses table
-- Run with: psql $DATABASE_URL -f db/migrate-add-analyses.sql

CREATE TABLE IF NOT EXISTS resource_analyses (
    resource_id INT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
    analysis    TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
