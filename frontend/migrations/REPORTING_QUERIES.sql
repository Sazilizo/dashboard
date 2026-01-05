-- =====================================================================
-- REPORTING QUERIES for Worker Attendance Hours
-- =====================================================================
-- These queries are optimized for dashboard/reporting use cases
-- All calculations rely on the backend trigger to ensure accuracy

-- =====================================================================
-- 1. WORKER HOURS REPORT (Month View)
-- =====================================================================
-- Shows hours worked per day, with daily and monthly totals

SELECT
  war.date,
  w.id as worker_id,
  CONCAT(w.name, ' ', COALESCE(w.last_name, '')) as worker_name,
  TO_CHAR(war.sign_in_time, 'HH24:MI') as sign_in,
  TO_CHAR(war.sign_out_time, 'HH24:MI') as sign_out,
  COALESCE(war.hours, 0) as daily_hours,
  s.name as school_name,
  war.recorded_by
FROM worker_attendance_records war
JOIN workers w ON war.worker_id = w.id
JOIN schools s ON war.school_id = s.id
WHERE w.id = 123  -- Replace with actual worker_id
  AND DATE_TRUNC('month', war.sign_in_time) = '2026-01-01'::date
ORDER BY war.date DESC, war.sign_in_time;

-- Add monthly summary
UNION ALL

SELECT
  NULL::date,
  123::integer,
  'MONTHLY TOTAL' as worker_name,
  '' as sign_in,
  '' as sign_out,
  COALESCE(SUM(war.hours), 0) as daily_hours,
  '' as school_name,
  NULL::integer
FROM worker_attendance_records war
WHERE war.worker_id = 123
  AND DATE_TRUNC('month', war.sign_in_time) = '2026-01-01'::date;

-- =====================================================================
-- 2. WORKER YEARLY SUMMARY
-- =====================================================================
-- Shows total hours, days worked, average per day for each worker

SELECT
  w.id,
  CONCAT(w.name, ' ', COALESCE(w.last_name, '')) as worker_name,
  ROUND((wat.total_seconds::NUMERIC / 3600), 2) as total_hours,
  ROUND((wat.total_seconds::NUMERIC / 3600 / 24), 2) as total_days_equivalent,
  COUNT(DISTINCT war.date) as days_worked,
  COUNT(CASE WHEN war.sign_out_time IS NOT NULL THEN 1 END) as completed_shifts,
  COUNT(CASE WHEN war.sign_out_time IS NULL THEN 1 END) as incomplete_shifts,
  ROUND(
    (SUM(CASE WHEN war.sign_out_time IS NOT NULL THEN war.hours ELSE 0 END)::NUMERIC /
    COUNT(DISTINCT CASE WHEN war.sign_out_time IS NOT NULL THEN war.date END))::NUMERIC,
    2
  ) as avg_hours_per_day,
  wat.year,
  wat.updated_at as last_updated
FROM workers w
LEFT JOIN worker_attendance_records war ON w.id = war.worker_id AND EXTRACT(YEAR FROM war.sign_in_time) = 2026
LEFT JOIN worker_attendance_totals wat ON w.id = wat.worker_id AND wat.year = 2026
GROUP BY w.id, w.name, w.last_name, wat.total_seconds, wat.year, wat.updated_at
ORDER BY COALESCE(total_hours, 0) DESC;

-- =====================================================================
-- 3. SCHOOL-WIDE HOURS SUMMARY
-- =====================================================================
-- Aggregate hours by school

SELECT
  s.id,
  s.name as school_name,
  ROUND((SUM(war.hours)::NUMERIC), 2) as total_hours,
  COUNT(DISTINCT war.worker_id) as workers,
  COUNT(DISTINCT war.date) as days_with_records,
  COUNT(DISTINCT CASE WHEN war.sign_out_time IS NULL THEN war.id END) as incomplete_shifts,
  MIN(war.sign_in_time)::date as first_record,
  MAX(war.sign_out_time)::date as last_record
FROM worker_attendance_records war
JOIN schools s ON war.school_id = s.id
WHERE EXTRACT(YEAR FROM war.sign_in_time) = 2026
  AND EXTRACT(MONTH FROM war.sign_in_time) = 1
GROUP BY s.id, s.name
ORDER BY total_hours DESC;

-- =====================================================================
-- 4. HOURS BY DATE RANGE (for payroll)
-- =====================================================================
-- Perfect for payroll system integration

SELECT
  war.worker_id,
  CONCAT(w.name, ' ', COALESCE(w.last_name, '')) as worker_name,
  war.school_id,
  s.name as school_name,
  COUNT(*) as shifts,
  COUNT(CASE WHEN war.sign_out_time IS NOT NULL THEN 1 END) as completed_shifts,
  ROUND(COALESCE(SUM(war.hours), 0)::NUMERIC, 2) as total_hours,
  ROUND((SUM(war.hours) * 3600)::NUMERIC, 0) as total_seconds,
  MIN(war.date) as period_start,
  MAX(war.date) as period_end
FROM worker_attendance_records war
JOIN workers w ON war.worker_id = w.id
JOIN schools s ON war.school_id = s.id
WHERE war.date BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY war.worker_id, w.name, w.last_name, war.school_id, s.name
ORDER BY total_hours DESC;

-- =====================================================================
-- 5. WORKERS WITH INCOMPLETE SHIFTS
-- =====================================================================
-- Find workers still signed in (for manual intervention)

SELECT
  w.id,
  CONCAT(w.name, ' ', COALESCE(w.last_name, '')) as worker_name,
  war.date,
  war.sign_in_time,
  EXTRACT(HOUR FROM (NOW() - war.sign_in_time))::integer as hours_signed_in,
  s.name as school_name,
  CASE
    WHEN EXTRACT(HOUR FROM (NOW() - war.sign_in_time)) > 12 THEN 'ALERT: >12 hours'
    WHEN EXTRACT(HOUR FROM (NOW() - war.sign_in_time)) > 10 THEN 'WARNING: >10 hours'
    ELSE 'OK'
  END as status
FROM worker_attendance_records war
JOIN workers w ON war.worker_id = w.id
JOIN schools s ON war.school_id = s.id
WHERE war.sign_out_time IS NULL
  AND war.date <= CURRENT_DATE
ORDER BY war.sign_in_time;

-- =====================================================================
-- 6. DAILY HOURS SUMMARY BY WORKER
-- =====================================================================
-- Quick view of hours per day

SELECT
  war.date,
  COUNT(DISTINCT war.worker_id) as workers_signed_in,
  COUNT(DISTINCT CASE WHEN war.sign_out_time IS NOT NULL THEN war.worker_id END) as completed,
  ROUND(SUM(CASE WHEN war.sign_out_time IS NOT NULL THEN war.hours ELSE 0 END)::NUMERIC, 2) as total_hours,
  ROUND(AVG(CASE WHEN war.sign_out_time IS NOT NULL THEN war.hours ELSE NULL END)::NUMERIC, 2) as avg_hours
FROM worker_attendance_records war
WHERE EXTRACT(YEAR FROM war.sign_in_time) = 2026
GROUP BY war.date
ORDER BY war.date DESC;

-- =====================================================================
-- 7. COMPARE HOURS YEAR-OVER-YEAR
-- =====================================================================

WITH yearly_totals AS (
  SELECT
    w.id,
    CONCAT(w.name, ' ', COALESCE(w.last_name, '')) as worker_name,
    wat.year,
    ROUND((wat.total_seconds::NUMERIC / 3600), 2) as total_hours
  FROM workers w
  JOIN worker_attendance_totals wat ON w.id = wat.worker_id
  WHERE wat.year IN (2024, 2025, 2026)
)
SELECT
  worker_id,
  worker_name,
  MAX(CASE WHEN year = 2024 THEN total_hours END) as hours_2024,
  MAX(CASE WHEN year = 2025 THEN total_hours END) as hours_2025,
  MAX(CASE WHEN year = 2026 THEN total_hours END) as hours_2026,
  ROUND(
    MAX(CASE WHEN year = 2026 THEN total_hours END) -
    MAX(CASE WHEN year = 2025 THEN total_hours END),
    2
  ) as yoy_change
FROM yearly_totals
GROUP BY worker_id, worker_name
ORDER BY hours_2026 DESC;

-- =====================================================================
-- 8. VERIFY DATA CONSISTENCY
-- =====================================================================
-- Compare trigger-calculated totals with raw record sums

WITH calculated_totals AS (
  SELECT
    worker_id,
    EXTRACT(YEAR FROM sign_in_time)::integer as year,
    COALESCE(SUM(hours), 0) as sum_of_hours,
    COALESCE(SUM(EXTRACT(EPOCH FROM (sign_out_time - sign_in_time))), 0) as sum_of_seconds
  FROM worker_attendance_records
  WHERE sign_out_time IS NOT NULL
  GROUP BY worker_id, EXTRACT(YEAR FROM sign_in_time)
)
SELECT
  c.worker_id,
  c.year,
  ROUND((c.sum_of_seconds::NUMERIC / 3600), 2) as calculated_hours,
  ROUND((t.total_seconds::NUMERIC / 3600), 2) as stored_hours,
  ROUND((c.sum_of_seconds::NUMERIC / 3600) - (t.total_seconds::NUMERIC / 3600), 2) as difference,
  CASE
    WHEN ABS(c.sum_of_seconds - t.total_seconds) > 36 THEN 'ERROR: >1 hour discrepancy'
    WHEN ABS(c.sum_of_seconds - t.total_seconds) > 0 THEN 'WARNING: Minor discrepancy'
    ELSE 'OK'
  END as status
FROM calculated_totals c
LEFT JOIN worker_attendance_totals t ON c.worker_id = t.worker_id AND c.year = t.year
WHERE t.worker_id IS NOT NULL
ORDER BY difference DESC;

-- =====================================================================
-- 9. EXPORT FOR PAYROLL SYSTEM
-- =====================================================================
-- Format for integration with payroll software

SELECT
  w.id as employee_id,
  CONCAT(w.name, ' ', COALESCE(w.last_name, '')) as employee_name,
  s.name as department,
  DATE_TRUNC('month', war.sign_in_time)::date as pay_period,
  ROUND(SUM(war.hours)::NUMERIC, 2) as hours_worked,
  ROUND((SUM(war.hours) * 3600)::NUMERIC, 0) as seconds_worked,
  COUNT(*) as number_of_shifts,
  w.hourly_rate,  -- Add if this column exists
  ROUND((SUM(war.hours) * COALESCE(w.hourly_rate, 0))::NUMERIC, 2) as gross_pay
FROM worker_attendance_records war
JOIN workers w ON war.worker_id = w.id
JOIN schools s ON war.school_id = s.id
WHERE war.sign_out_time IS NOT NULL
  AND war.date BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY w.id, w.name, w.last_name, s.name, DATE_TRUNC('month', war.sign_in_time), w.hourly_rate
ORDER BY w.id, pay_period;

-- =====================================================================
-- 10. ANOMALY DETECTION
-- =====================================================================
-- Find unusual patterns (very long shifts, night work, etc.)

SELECT
  war.id,
  w.id as worker_id,
  CONCAT(w.name, ' ', COALESCE(w.last_name, '')) as worker_name,
  war.date,
  TO_CHAR(war.sign_in_time, 'HH24:MI') as sign_in,
  TO_CHAR(war.sign_out_time, 'HH24:MI') as sign_out,
  war.hours,
  CASE
    WHEN war.hours > 12 THEN 'ALERT: Excessive hours'
    WHEN war.hours > 10 THEN 'WARNING: Long shift'
    WHEN EXTRACT(HOUR FROM war.sign_in_time) > 18 OR EXTRACT(HOUR FROM war.sign_in_time) < 6 THEN 'NOTE: Late night'
    WHEN war.hours < 1 THEN 'NOTE: Very short shift'
  END as anomaly
FROM worker_attendance_records war
JOIN workers w ON war.worker_id = w.id
WHERE war.sign_out_time IS NOT NULL
  AND (
    war.hours > 12
    OR (EXTRACT(HOUR FROM war.sign_in_time) > 18 OR EXTRACT(HOUR FROM war.sign_in_time) < 6)
    OR war.hours < 0.5
  )
ORDER BY war.date DESC, war.hours DESC;

-- =====================================================================
-- FRONTEND INTEGRATION EXAMPLE
-- =====================================================================
-- Sample query for React dashboard components

-- For Worker Details Page:
SELECT
  war.date,
  war.sign_in_time,
  war.sign_out_time,
  war.hours,
  s.name as school_name,
  u.email as recorded_by
FROM worker_attendance_records war
JOIN schools s ON war.school_id = s.id
LEFT JOIN auth.users u ON war.recorded_by = u.id
WHERE war.worker_id = $1  -- Parameterized query
  AND EXTRACT(MONTH FROM war.sign_in_time) = $2
  AND EXTRACT(YEAR FROM war.sign_in_time) = $3
ORDER BY war.date DESC;

-- For Worker Summary Card:
SELECT
  COALESCE(SUM(war.hours), 0) as monthly_hours,
  COUNT(*) as days_worked,
  MAX(war.sign_out_time)::date as last_worked
FROM worker_attendance_records war
WHERE war.worker_id = $1
  AND DATE_TRUNC('month', war.sign_in_time) = DATE_TRUNC('month', NOW());

-- For Dashboard Stats:
SELECT
  (SELECT COUNT(DISTINCT worker_id) FROM worker_attendance_records WHERE date = CURRENT_DATE) as workers_today,
  (SELECT COUNT(*) FROM worker_attendance_records WHERE date = CURRENT_DATE AND sign_out_time IS NOT NULL) as completed_shifts,
  (SELECT COUNT(*) FROM worker_attendance_records WHERE date = CURRENT_DATE AND sign_out_time IS NULL) as incomplete_shifts,
  (SELECT ROUND(SUM(hours)::NUMERIC, 2) FROM worker_attendance_records WHERE date = CURRENT_DATE AND sign_out_time IS NOT NULL) as hours_today;
