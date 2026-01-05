-- Migration: Ensure attendance_records and worker_attendance_records tables exist with correct schema
-- This migration creates the tables if they don't exist, and ensures all required columns are present

BEGIN;

-- Create attendance_records table for student attendance tracking
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT NOT NULL,
  date DATE NOT NULL,
  sign_in_time TIMESTAMPTZ,
  sign_out_time TIMESTAMPTZ,
  hours NUMERIC(8,2),
  description TEXT,
  school_id BIGINT,
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_student FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE
);

-- Add columns if they don't exist (safe way to add missing columns)
ALTER TABLE IF EXISTS public.attendance_records
  ADD COLUMN IF NOT EXISTS sign_in_time TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.attendance_records
  ADD COLUMN IF NOT EXISTS sign_out_time TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.attendance_records
  ADD COLUMN IF NOT EXISTS hours NUMERIC(8,2);

ALTER TABLE IF EXISTS public.attendance_records
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE IF EXISTS public.attendance_records
  ADD COLUMN IF NOT EXISTS school_id BIGINT;

ALTER TABLE IF EXISTS public.attendance_records
  ADD COLUMN IF NOT EXISTS recorded_by UUID;

ALTER TABLE IF EXISTS public.attendance_records
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Create indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id ON public.attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON public.attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_school_id ON public.attendance_records(school_id);

-- Ensure worker_attendance_records table exists with all columns
CREATE TABLE IF NOT EXISTS public.worker_attendance_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  worker_id BIGINT NOT NULL,
  date DATE NOT NULL,
  sign_in_time TIMESTAMPTZ,
  sign_out_time TIMESTAMPTZ,
  hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  description TEXT,
  school_id BIGINT,
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_worker FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE
);

-- Add columns if they don't exist
ALTER TABLE IF EXISTS public.worker_attendance_records
  ADD COLUMN IF NOT EXISTS sign_in_time TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.worker_attendance_records
  ADD COLUMN IF NOT EXISTS sign_out_time TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.worker_attendance_records
  ADD COLUMN IF NOT EXISTS hours NUMERIC(8,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.worker_attendance_records
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE IF EXISTS public.worker_attendance_records
  ADD COLUMN IF NOT EXISTS school_id BIGINT;

ALTER TABLE IF EXISTS public.worker_attendance_records
  ADD COLUMN IF NOT EXISTS recorded_by UUID;

ALTER TABLE IF EXISTS public.worker_attendance_records
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Create indexes for worker attendance
CREATE INDEX IF NOT EXISTS idx_worker_attendance_worker_id ON public.worker_attendance_records(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_date ON public.worker_attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_school_id ON public.worker_attendance_records(school_id);

-- Create or replace worker_attendance_totals view
CREATE OR REPLACE VIEW public.worker_attendance_totals AS
SELECT
  worker_id,
  COALESCE(SUM(hours), 0) AS total_hours,
  COUNT(*) AS attendance_count,
  MAX(date) AS last_attendance_date
FROM public.worker_attendance_records
GROUP BY worker_id;

-- Grant permissions
-- GRANT SELECT ON public.attendance_records TO anon;
-- GRANT SELECT ON public.worker_attendance_records TO anon;
-- GRANT INSERT, UPDATE ON public.attendance_records TO anon;
-- GRANT INSERT, UPDATE ON public.worker_attendance_records TO anon;

COMMIT;

-- EOF
