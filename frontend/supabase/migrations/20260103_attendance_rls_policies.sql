-- Migration: Enable RLS on attendance tables and create policies for kiosk access
-- Allows authenticated users to view and manage attendance records

BEGIN;

-- Enable RLS on both tables
ALTER TABLE IF EXISTS public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.worker_attendance_records ENABLE ROW LEVEL SECURITY;

-- Attendance records policies
-- Allow anyone authenticated to view all attendance records (needed for kiosk, reports, etc.)
DROP POLICY IF EXISTS "authenticated_can_select_attendance_records" ON public.attendance_records;
CREATE POLICY "authenticated_can_select_attendance_records" ON public.attendance_records
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow anyone authenticated to insert attendance records (kiosk sign-in)
DROP POLICY IF EXISTS "authenticated_can_insert_attendance_records" ON public.attendance_records;
CREATE POLICY "authenticated_can_insert_attendance_records" ON public.attendance_records
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow anyone authenticated to update attendance records (kiosk sign-out, duration)
DROP POLICY IF EXISTS "authenticated_can_update_attendance_records" ON public.attendance_records;
CREATE POLICY "authenticated_can_update_attendance_records" ON public.attendance_records
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Worker attendance records policies
-- Allow anyone authenticated to view all worker attendance records
DROP POLICY IF EXISTS "authenticated_can_select_worker_attendance" ON public.worker_attendance_records;
CREATE POLICY "authenticated_can_select_worker_attendance" ON public.worker_attendance_records
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow anyone authenticated to insert worker attendance records (kiosk sign-in)
DROP POLICY IF EXISTS "authenticated_can_insert_worker_attendance" ON public.worker_attendance_records;
CREATE POLICY "authenticated_can_insert_worker_attendance" ON public.worker_attendance_records
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow anyone authenticated to update worker attendance records (kiosk sign-out, hours)
DROP POLICY IF EXISTS "authenticated_can_update_worker_attendance" ON public.worker_attendance_records;
CREATE POLICY "authenticated_can_update_worker_attendance" ON public.worker_attendance_records
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Worker attendance totals view is read-only, allow select
DROP POLICY IF EXISTS "authenticated_can_view_worker_attendance_totals" ON public.worker_attendance_totals;
CREATE POLICY "authenticated_can_view_worker_attendance_totals" ON public.worker_attendance_totals
  FOR SELECT
  TO authenticated
  USING (true);

COMMIT;

-- EOF
