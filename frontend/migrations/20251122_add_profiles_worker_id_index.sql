-- Migration: make profiles.worker_id unique and indexed for one-to-one mapping with workers
-- Run this on a test/staging DB first.

BEGIN;

-- Create unique index if not exists (Postgres)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_profiles_worker_id_unique'
  ) THEN
    PERFORM pg_catalog.set_config('search_path', current_schema(), false);
    CREATE UNIQUE INDEX idx_profiles_worker_id_unique ON profiles(worker_id);
  END IF;
END$$;

-- Optionally, add a unique constraint instead of index
-- ALTER TABLE profiles ADD CONSTRAINT profiles_worker_id_unique UNIQUE (worker_id);

COMMIT;

-- Notes:
-- 1. If some profiles already have duplicate worker_id values, the index/constraint will fail. Clean duplicates first.
-- 2. Keep worker_id nullable if not all workers have profiles.
-- 3. Back up your DB before running migrations.
