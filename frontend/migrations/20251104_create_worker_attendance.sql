-- Migration: Create worker_attendance_records table and totals view
-- Run this in your Supabase SQL editor or psql against the DB used by the frontend

-- Create table for per-worker attendance entries
CREATE TABLE IF NOT EXISTS public.worker_attendance_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  worker_id bigint NOT NULL,
  date date NOT NULL,
  hours numeric(8,2) NOT NULL DEFAULT 0,
  sign_in_time timestamptz,
  sign_out_time timestamptz,
  description text,
  school_id bigint,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- optional: store reference to original attendance_record id if migrating
  original_record_id bigint
);

-- Add a foreign key constraint to workers.id (if you have a workers table)
ALTER TABLE IF EXISTS public.worker_attendance_records
  ADD CONSTRAINT fk_worker_attendance_worker
  FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;

-- Index for common lookups
CREATE INDEX IF NOT EXISTS idx_worker_attendance_worker_id ON public.worker_attendance_records(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_date ON public.worker_attendance_records(date);

-- Use CREATE OR REPLACE so migration is idempotent across Postgres versions
CREATE OR REPLACE VIEW public.worker_attendance_totals AS
SELECT
  worker_id,
  COALESCE(SUM(hours), 0) AS total_hours
FROM public.worker_attendance_records
GROUP BY worker_id;

-- Optional: grant select on view to anon/public role used by your frontend
-- Replace "anon" with your Supabase anon role if different
-- GRANT SELECT ON public.worker_attendance_totals TO anon;

-- End of migration
