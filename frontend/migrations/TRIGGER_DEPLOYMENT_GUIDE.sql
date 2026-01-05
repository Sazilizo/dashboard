-- =====================================================================
-- DEPLOYMENT & TESTING GUIDE for Worker Hours Trigger
-- =====================================================================

-- =====================================================================
-- STEP 1: VERIFY SCHEMA (Run this first to check your tables)
-- =====================================================================
-- Run in Supabase SQL Editor to confirm table structure

SELECT 
  tablename,
  column_name,
  data_type
FROM information_schema.columns
WHERE tablename IN ('worker_attendance_records', 'worker_attendance_totals')
ORDER BY tablename, ordinal_position;

-- Expected output:
-- worker_attendance_records columns:
--   id (bigint)
--   worker_id (integer)
--   date (date)
--   sign_in_time (timestamp with time zone)
--   sign_out_time (timestamp with time zone, nullable)
--   hours (numeric, nullable)
--   school_id (integer)
--   recorded_by (uuid/integer)
--   created_at (timestamp with time zone)
--   
-- worker_attendance_totals columns:
--   id (bigint)
--   worker_id (integer)
--   year (integer)
--   total_seconds (bigint)
--   monthly_seconds (bigint)
--   updated_at (timestamp with time zone)

-- =====================================================================
-- STEP 2: DEPLOY THE TRIGGER
-- =====================================================================
-- Copy all SQL from calculate_worker_hours_trigger.sql and run it in:
-- Supabase Dashboard → SQL Editor → Paste entire migration file → Run

-- Expected success: All CREATE TRIGGER, CREATE FUNCTION statements complete with no errors

-- =====================================================================
-- STEP 3: VERIFY TRIGGER INSTALLATION
-- =====================================================================
-- Run these queries to confirm triggers exist

-- List all triggers on worker_attendance_records
SELECT
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'worker_attendance_records'
ORDER BY trigger_name;

-- Expected output: 3 triggers
--   - worker_attendance_insert_trigger (BEFORE INSERT)
--   - worker_attendance_update_trigger (BEFORE UPDATE)
--   - worker_attendance_delete_trigger (AFTER DELETE)

-- =====================================================================
-- STEP 4: MANUAL TESTING
-- =====================================================================

-- TEST CASE 1: Insert record with both timestamps
INSERT INTO worker_attendance_records (
  worker_id,
  school_id,
  date,
  sign_in_time,
  sign_out_time,
  recorded_by
) VALUES (
  1,
  1,
  '2026-01-05'::date,
  '2026-01-05 08:00:00+00'::timestamp with time zone,
  '2026-01-05 16:30:00+00'::timestamp with time zone,
  1
);

-- Verify: Check that hours was calculated (should be 8.5)
SELECT id, worker_id, hours, sign_in_time, sign_out_time
FROM worker_attendance_records
WHERE worker_id = 1
ORDER BY created_at DESC
LIMIT 1;

-- Check worker_attendance_totals was created
SELECT *
FROM worker_attendance_totals
WHERE worker_id = 1 AND year = 2026;

-- =====================================================================
-- TEST CASE 2: Insert record with NULL sign_out_time (person still signed in)
-- =====================================================================

INSERT INTO worker_attendance_records (
  worker_id,
  school_id,
  date,
  sign_in_time,
  sign_out_time,
  recorded_by
) VALUES (
  2,
  1,
  '2026-01-05'::date,
  '2026-01-05 09:00:00+00'::timestamp with time zone,
  NULL,  -- No sign-out yet
  1
);

-- Verify: hours should be NULL (no calculation)
SELECT id, worker_id, hours, sign_out_time
FROM worker_attendance_records
WHERE worker_id = 2
ORDER BY created_at DESC
LIMIT 1;

-- =====================================================================
-- TEST CASE 3: Update record to add sign_out_time
-- =====================================================================

UPDATE worker_attendance_records
SET sign_out_time = '2026-01-05 17:00:00+00'::timestamp with time zone
WHERE worker_id = 2 AND sign_out_time IS NULL;

-- Verify: hours should now be calculated (8.0 hours)
SELECT id, worker_id, hours, sign_in_time, sign_out_time
FROM worker_attendance_records
WHERE worker_id = 2
ORDER BY created_at DESC
LIMIT 1;

-- Verify: worker_attendance_totals updated
SELECT *
FROM worker_attendance_totals
WHERE worker_id = 2 AND year = 2026;

-- =====================================================================
-- TEST CASE 4: Insert multiple records and verify totals
-- =====================================================================

-- Insert 5 working days (40 hours total)
INSERT INTO worker_attendance_records (worker_id, school_id, date, sign_in_time, sign_out_time, recorded_by)
VALUES
  (3, 1, '2026-01-06'::date, '2026-01-06 08:00:00+00', '2026-01-06 16:00:00+00', 1),
  (3, 1, '2026-01-07'::date, '2026-01-07 08:00:00+00', '2026-01-07 16:00:00+00', 1),
  (3, 1, '2026-01-08'::date, '2026-01-08 08:00:00+00', '2026-01-08 16:00:00+00', 1),
  (3, 1, '2026-01-09'::date, '2026-01-09 08:00:00+00', '2026-01-09 16:00:00+00', 1),
  (3, 1, '2026-01-10'::date, '2026-01-10 08:00:00+00', '2026-01-10 16:00:00+00', 1);

-- Verify: All 5 records show 8.0 hours each
SELECT worker_id, hours, date
FROM worker_attendance_records
WHERE worker_id = 3
ORDER BY date;

-- Verify: Totals show 40 hours (144000 seconds)
SELECT *
FROM worker_attendance_totals
WHERE worker_id = 3 AND year = 2026;
-- Expected: total_seconds = 144000 (40 hours × 3600 seconds/hour)

-- =====================================================================
-- TEST CASE 5: Delete record and verify totals recalculate
-- =====================================================================

DELETE FROM worker_attendance_records
WHERE worker_id = 3 AND date = '2026-01-10'::date;

-- Verify: Totals should now be 32 hours (115200 seconds)
SELECT *
FROM worker_attendance_totals
WHERE worker_id = 3 AND year = 2026;
-- Expected: total_seconds = 115200 (32 hours × 3600 seconds/hour)

-- =====================================================================
-- VALIDATION TESTS (Run after manual testing)
-- =====================================================================

-- Check for any data integrity issues
SELECT *
FROM validate_worker_hours(1, 2026);

SELECT *
FROM validate_worker_hours(2, 2026);

SELECT *
FROM validate_worker_hours(3, 2026);

-- All checks should return PASS status

-- =====================================================================
-- MANUAL RECALCULATION (if needed for data cleanup)
-- =====================================================================

-- Recalculate totals for a specific worker/year
SELECT *
FROM recalculate_worker_totals_for_range(1, 2026);

-- Recalculate for multiple workers
SELECT worker_id, year, total_hours, status
FROM (
  SELECT * FROM recalculate_worker_totals_for_range(1, 2026)
  UNION ALL
  SELECT * FROM recalculate_worker_totals_for_range(2, 2026)
  UNION ALL
  SELECT * FROM recalculate_worker_totals_for_range(3, 2026)
) t;

-- =====================================================================
-- PERFORMANCE MONITORING (after going to production)
-- =====================================================================

-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE tablename = 'worker_attendance_records'
ORDER BY indexname;

-- Monitor trigger execution time (if logging enabled)
SELECT
  trigger_name,
  count(*) as execution_count
FROM pg_stat_user_functions
WHERE funcname = 'calculate_worker_hours_and_totals'
GROUP BY trigger_name;

-- =====================================================================
-- ROLLBACK (if issues found - use with caution!)
-- =====================================================================

-- Drop all triggers and functions (DESTRUCTIVE)
DROP TRIGGER IF EXISTS worker_attendance_delete_trigger ON worker_attendance_records;
DROP TRIGGER IF EXISTS worker_attendance_update_trigger ON worker_attendance_records;
DROP TRIGGER IF EXISTS worker_attendance_insert_trigger ON worker_attendance_records;
DROP FUNCTION IF EXISTS calculate_worker_hours_and_totals();
DROP FUNCTION IF EXISTS recalculate_worker_totals_for_range(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS validate_worker_hours(INTEGER, INTEGER);

-- =====================================================================
-- COMMON ISSUES & SOLUTIONS
-- =====================================================================

/*
ISSUE 1: "Permission denied for schema public"
SOLUTION: Ensure you have superuser role or grant proper privileges:
  - Go to Supabase Dashboard → Database → Users → Select your role
  - Add "usage" and "create" privileges on "public" schema

ISSUE 2: "Function already exists" error
SOLUTION: The migration includes DROP IF EXISTS to prevent this.
          If you still get errors, run the drop statements first.

ISSUE 3: Trigger not firing (hours column not updating)
SOLUTION: 
  1. Verify table structure with STEP 1 queries above
  2. Check trigger exists: SELECT * FROM information_schema.triggers WHERE event_object_table = 'worker_attendance_records';
  3. Manually re-deploy trigger using the migration file
  4. Test with simple INSERT statement

ISSUE 4: Totals not matching sum of hours
SOLUTION:
  1. Run validate_worker_hours() function to identify issues
  2. Use recalculate_worker_totals_for_range() to fix discrepancies
  3. Check for records with sign_out_time IS NULL (these don't count toward totals)

ISSUE 5: "Column 'date' does not exist"
SOLUTION: If your table doesn't have a 'date' column:
  - Add it: ALTER TABLE worker_attendance_records ADD COLUMN date DATE;
  - Or update trigger to use DATE(sign_in_time) instead
  - Update the trigger function accordingly

ISSUE 6: Timezone issues (hours don't match expected)
SOLUTION: All timestamps should be stored in UTC (+00:00)
  - Check: SELECT sign_in_time, sign_out_time FROM worker_attendance_records LIMIT 1;
  - If not UTC, convert: 
    UPDATE worker_attendance_records SET sign_in_time = sign_in_time AT TIME ZONE 'UTC';
*/

-- =====================================================================
-- QUERIES FOR FRONTEND/REPORTING
-- =====================================================================

-- Get worker hours for a date range
SELECT
  w.id,
  w.name,
  w.last_name,
  COUNT(*) as shifts,
  SUM(CASE WHEN war.hours IS NOT NULL THEN 1 ELSE 0 END) as completed_shifts,
  COALESCE(SUM(war.hours), 0) as total_hours,
  ROUND(AVG(war.hours) FILTER (WHERE war.hours IS NOT NULL)::NUMERIC, 2) as avg_hours_per_shift
FROM workers w
LEFT JOIN worker_attendance_records war ON w.id = war.worker_id
WHERE war.date BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY w.id, w.name, w.last_name
ORDER BY total_hours DESC;

-- Get yearly totals for all workers
SELECT
  w.id,
  w.name,
  w.last_name,
  ROUND((wat.total_seconds::NUMERIC / 3600), 2) as total_hours,
  wat.year,
  wat.updated_at
FROM workers w
JOIN worker_attendance_totals wat ON w.id = wat.worker_id
WHERE wat.year = 2026
ORDER BY wat.total_seconds DESC;

-- Get workers with incomplete shifts (still signed in)
SELECT
  w.id,
  w.name,
  w.last_name,
  war.sign_in_time,
  EXTRACT(HOUR FROM (NOW() - war.sign_in_time)) as hours_signed_in
FROM workers w
JOIN worker_attendance_records war ON w.id = war.worker_id
WHERE war.sign_out_time IS NULL
ORDER BY war.sign_in_time;
