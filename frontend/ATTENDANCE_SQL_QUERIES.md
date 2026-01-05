# Attendance SQL Queries & Reporting

## For Daily Monitoring

### Check Today's Attendance - All Students
```sql
SELECT 
  ar.id,
  s.full_name,
  ar.date,
  ar.sign_in_time AT TIME ZONE 'UTC' as sign_in,
  ar.sign_out_time AT TIME ZONE 'UTC' as sign_out,
  ar.hours,
  ar.description,
  CASE 
    WHEN ar.sign_out_time IS NULL THEN 'Currently Signed In'
    ELSE 'Signed Out'
  END as status
FROM public.attendance_records ar
LEFT JOIN public.students s ON ar.student_id = s.id
WHERE ar.date = CURRENT_DATE
ORDER BY ar.created_at DESC;
```

### Check Today's Attendance - All Workers
```sql
SELECT 
  war.id,
  w.name || ' ' || COALESCE(w.last_name, '') as worker_name,
  war.date,
  war.sign_in_time AT TIME ZONE 'UTC' as sign_in,
  war.sign_out_time AT TIME ZONE 'UTC' as sign_out,
  war.hours,
  war.description,
  CASE 
    WHEN war.sign_out_time IS NULL THEN 'Currently Working'
    ELSE 'Signed Out'
  END as status
FROM public.worker_attendance_records war
LEFT JOIN public.workers w ON war.worker_id = w.id
WHERE war.date = CURRENT_DATE
ORDER BY war.created_at DESC;
```

### Check Specific Student Today
```sql
SELECT 
  ar.id,
  s.full_name,
  ar.date,
  ar.sign_in_time AT TIME ZONE 'UTC' as sign_in,
  ar.sign_out_time AT TIME ZONE 'UTC' as sign_out,
  ar.hours,
  ar.school_id
FROM public.attendance_records ar
LEFT JOIN public.students s ON ar.student_id = s.id
WHERE ar.student_id = 123  -- Replace 123 with student_id
AND ar.date = CURRENT_DATE
ORDER BY ar.created_at DESC;
```

### Check Specific Worker Today
```sql
SELECT 
  war.id,
  w.name || ' ' || COALESCE(w.last_name, '') as worker_name,
  war.sign_in_time AT TIME ZONE 'UTC' as sign_in,
  war.sign_out_time AT TIME ZONE 'UTC' as sign_out,
  war.hours
FROM public.worker_attendance_records war
LEFT JOIN public.workers w ON war.worker_id = w.id
WHERE war.worker_id = 456  -- Replace 456 with worker_id
AND war.date = CURRENT_DATE
ORDER BY war.created_at DESC;
```

## For Weekly/Monthly Reporting

### Student Session Hours by Grade (This Week)
```sql
SELECT 
  s.grade,
  COUNT(*) as sessions_attended,
  ROUND(COALESCE(SUM(ar.hours), 0)::numeric, 2) as total_hours,
  ROUND(COALESCE(AVG(ar.hours), 0)::numeric, 2) as avg_session_hours,
  MAX(ar.date) as last_attendance
FROM public.attendance_records ar
LEFT JOIN public.students s ON ar.student_id = s.id
WHERE ar.date >= CURRENT_DATE - INTERVAL '7 days'
AND ar.sign_out_time IS NOT NULL  -- Only completed sessions
GROUP BY s.grade
ORDER BY s.grade;
```

### Student Attendance Rate This Month
```sql
SELECT 
  s.id,
  s.full_name,
  s.grade,
  COUNT(DISTINCT ar.date) as days_attended,
  ROUND((COUNT(DISTINCT ar.date)::numeric / 
         NULLIF(COUNT(DISTINCT DATE_TRUNC('day', CURRENT_DATE - INTERVAL '30 days' + (days * INTERVAL '1 day'))::date), 0) * 100)::numeric, 1) as attendance_rate,
  ROUND(COALESCE(SUM(ar.hours), 0)::numeric, 2) as total_hours
FROM public.students s
LEFT JOIN public.attendance_records ar ON 
  ar.student_id = s.id 
  AND ar.date >= CURRENT_DATE - INTERVAL '30 days'
  AND ar.sign_out_time IS NOT NULL
CROSS JOIN GENERATE_SERIES(0, 30) AS t(days)
WHERE ar.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY s.id, s.full_name, s.grade
ORDER BY attendance_rate DESC;
```

### Worker Hours Summary (Monthly Payroll Calculation)
```sql
SELECT 
  w.id,
  w.name || ' ' || COALESCE(w.last_name, '') as worker_name,
  war.date,
  COUNT(*) as sign_ins,
  ROUND(COALESCE(SUM(war.hours), 0)::numeric, 2) as daily_hours
FROM public.worker_attendance_records war
LEFT JOIN public.workers w ON war.worker_id = w.id
WHERE EXTRACT(YEAR FROM war.date) = EXTRACT(YEAR FROM CURRENT_DATE)
  AND EXTRACT(MONTH FROM war.date) = EXTRACT(MONTH FROM CURRENT_DATE)
GROUP BY w.id, w.name, w.last_name, war.date
ORDER BY w.name, war.date;
```

### Worker Total Hours by Month
```sql
SELECT 
  w.id,
  w.name || ' ' || COALESCE(w.last_name, '') as worker_name,
  EXTRACT(YEAR FROM war.date) as year,
  EXTRACT(MONTH FROM war.date) as month,
  TO_CHAR(war.date, 'YYYY-MM') as period,
  COUNT(*) as working_days,
  ROUND(COALESCE(SUM(war.hours), 0)::numeric, 2) as total_hours,
  ROUND(COALESCE(AVG(war.hours), 0)::numeric, 2) as avg_daily_hours
FROM public.worker_attendance_records war
LEFT JOIN public.workers w ON war.worker_id = w.id
WHERE war.sign_out_time IS NOT NULL  -- Only completed shifts
GROUP BY w.id, w.name, w.last_name, EXTRACT(YEAR FROM war.date), EXTRACT(MONTH FROM war.date)
ORDER BY w.name, year DESC, month DESC;
```

## For Payroll Processing

### Worker Attendance Totals View (Direct Query)
```sql
SELECT 
  w.id,
  w.name || ' ' || COALESCE(w.last_name, '') as worker_name,
  w.hourly_rate,
  wat.total_hours,
  (wat.total_hours * COALESCE(w.hourly_rate, 0))::numeric(10,2) as gross_pay,
  wat.attendance_count,
  wat.last_attendance_date,
  CURRENT_DATE - wat.last_attendance_date as days_since_last_work
FROM public.worker_attendance_totals wat
LEFT JOIN public.workers w ON wat.worker_id = w.id
WHERE wat.total_hours > 0
ORDER BY wat.total_hours DESC;
```

### Generate Monthly Payroll
```sql
WITH monthly_hours AS (
  SELECT 
    war.worker_id,
    EXTRACT(MONTH FROM war.date) as month,
    EXTRACT(YEAR FROM war.date) as year,
    SUM(war.hours) as total_hours
  FROM public.worker_attendance_records war
  WHERE war.sign_out_time IS NOT NULL
    AND EXTRACT(YEAR FROM war.date) = 2025
    AND EXTRACT(MONTH FROM war.date) = 12  -- December
  GROUP BY war.worker_id, month, year
)
SELECT 
  w.id,
  w.name || ' ' || COALESCE(w.last_name, '') as worker_name,
  COALESCE(w.hourly_rate, 0) as hourly_rate,
  COALESCE(mh.total_hours, 0) as hours_worked,
  ROUND((COALESCE(mh.total_hours, 0) * COALESCE(w.hourly_rate, 0))::numeric, 2) as gross_pay,
  'December 2025' as pay_period
FROM public.workers w
LEFT JOIN monthly_hours mh ON w.id = mh.worker_id
WHERE w.is_active = true
ORDER BY w.name;
```

## For Data Validation & Audits

### Records Missing Sign-Out Times (Should Not Happen)
```sql
-- Students
SELECT 
  ar.id,
  s.full_name,
  ar.date,
  ar.sign_in_time AT TIME ZONE 'UTC' as sign_in,
  ar.created_at AT TIME ZONE 'UTC' as created,
  NOW() AT TIME ZONE 'UTC' - ar.sign_in_time as duration_since_signin
FROM public.attendance_records ar
LEFT JOIN public.students s ON ar.student_id = s.id
WHERE ar.sign_out_time IS NULL
  AND ar.date < CURRENT_DATE - INTERVAL '1 day'  -- Older than yesterday
ORDER BY ar.created_at DESC;

-- Workers
SELECT 
  war.id,
  w.name || ' ' || COALESCE(w.last_name, '') as worker_name,
  war.date,
  war.sign_in_time AT TIME ZONE 'UTC' as sign_in,
  war.created_at AT TIME ZONE 'UTC' as created,
  NOW() AT TIME ZONE 'UTC' - war.sign_in_time as duration_since_signin
FROM public.worker_attendance_records war
LEFT JOIN public.workers w ON war.worker_id = w.id
WHERE war.sign_out_time IS NULL
  AND war.date < CURRENT_DATE - INTERVAL '1 day'
ORDER BY war.created_at DESC;
```

### Detect Unusual Hours (Possible Data Entry Errors)
```sql
-- Students with extremely long sessions (>5 hours)
SELECT 
  s.id,
  s.full_name,
  ar.date,
  ar.sign_in_time AT TIME ZONE 'UTC' as sign_in,
  ar.sign_out_time AT TIME ZONE 'UTC' as sign_out,
  ar.hours,
  ar.recorded_by
FROM public.attendance_records ar
LEFT JOIN public.students s ON ar.student_id = s.id
WHERE ar.hours > 5
  OR ar.hours IS NULL AND ar.sign_out_time IS NOT NULL
ORDER BY ar.hours DESC;

-- Workers with unusual shifts
SELECT 
  w.id,
  w.name || ' ' || COALESCE(w.last_name, '') as worker_name,
  war.date,
  war.hours,
  war.sign_in_time AT TIME ZONE 'UTC' as sign_in,
  war.sign_out_time AT TIME ZONE 'UTC' as sign_out
FROM public.worker_attendance_records war
LEFT JOIN public.workers w ON war.worker_id = w.id
WHERE war.hours > 12 OR war.hours = 0
ORDER BY war.hours DESC;
```

### Audit Trail - Who Recorded What
```sql
SELECT 
  ar.id,
  ar.student_id,
  s.full_name,
  ar.date,
  ar.created_at AT TIME ZONE 'UTC' as recorded_when,
  ar.recorded_by as admin_uuid,
  p.email as admin_email,
  ar.description,
  ar.sign_in_time AT TIME ZONE 'UTC' as sign_in,
  ar.sign_out_time AT TIME ZONE 'UTC' as sign_out
FROM public.attendance_records ar
LEFT JOIN public.students s ON ar.student_id = s.id
LEFT JOIN public.profiles p ON ar.recorded_by = p.auth_uid
WHERE ar.date = CURRENT_DATE
ORDER BY ar.created_at DESC;
```

## For Troubleshooting

### Find Duplicate Records
```sql
-- Students
SELECT 
  ar.student_id,
  ar.date,
  COUNT(*) as duplicate_count,
  MAX(ar.id) as latest_id,
  STRING_AGG(ar.id::text, ', ') as all_ids
FROM public.attendance_records ar
GROUP BY ar.student_id, ar.date
HAVING COUNT(*) > 1
ORDER BY ar.date DESC;
```

### Check RLS Policies Are Active
```sql
SELECT 
  policyname,
  tablename,
  permissive,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('attendance_records', 'worker_attendance_records')
ORDER BY tablename;
```

### Check Table Permissions
```sql
SELECT 
  grantee,
  privilege_type,
  table_name
FROM information_schema.role_table_grants
WHERE table_name IN ('attendance_records', 'worker_attendance_records', 'worker_attendance_totals')
ORDER BY table_name, grantee;
```

## For Backups & Archiving

### Export Monthly Data (Before Archiving)
```sql
COPY (
  SELECT 
    w.id,
    w.name || ' ' || COALESCE(w.last_name, '') as worker_name,
    war.date,
    war.sign_in_time,
    war.sign_out_time,
    war.hours,
    war.school_id
  FROM public.worker_attendance_records war
  LEFT JOIN public.workers w ON war.worker_id = w.id
  WHERE EXTRACT(YEAR FROM war.date) = 2025
    AND EXTRACT(MONTH FROM war.date) = 12
  ORDER BY war.date, w.name
) TO STDOUT WITH CSV HEADER;
```

### Archive Old Records (30+ days old) - DANGEROUS! Backup first!
```sql
-- DO NOT RUN WITHOUT BACKUP!
-- This deletes records older than 30 days
-- Only run after exporting via the query above

BEGIN;

-- Student attendance archive
INSERT INTO attendance_records_archive
SELECT * FROM attendance_records
WHERE date < CURRENT_DATE - INTERVAL '30 days';

-- Delete archived records
DELETE FROM attendance_records
WHERE date < CURRENT_DATE - INTERVAL '30 days';

-- Worker attendance archive
INSERT INTO worker_attendance_records_archive
SELECT * FROM worker_attendance_records
WHERE date < CURRENT_DATE - INTERVAL '30 days';

-- Delete archived records
DELETE FROM worker_attendance_records
WHERE date < CURRENT_DATE - INTERVAL '30 days';

COMMIT;
```

## Quick Reference - Replace Values

In all queries above, replace:
- `123` with actual student_id
- `456` with actual worker_id
- `9` with actual school_id
- `CURRENT_DATE` to query specific date: `'2025-12-30'::date`
- `2025` with year for payroll
- `12` with month for payroll (1-12)

## Notes

- All times are stored as TIMESTAMPTZ (timezone-aware)
- Use `AT TIME ZONE 'UTC'` to convert for display
- Hours are NUMERIC(8,2): max 999,999.99 hours
- `worker_attendance_totals` is a VIEW that auto-updates
- Always backup before running DELETE queries
- Test queries on non-critical data first
