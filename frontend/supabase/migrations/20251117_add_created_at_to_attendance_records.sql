-- Migration: Add created_at to attendance_records (safe, idempotent)
-- Adds a timestamptz `created_at` column with default now() if it doesn't exist.

BEGIN;

ALTER TABLE IF EXISTS public.attendance_records
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

COMMIT;

-- EOF
