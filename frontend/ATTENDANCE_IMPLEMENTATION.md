# Attendance Tracking Implementation Summary

## Overview
The Kiosk component has been enhanced to properly track attendance for both students and workers through biometric face recognition, with data persisting to Supabase tables for payroll and session reporting.

## Database Tables Setup

### 1. attendance_records (Students)
**Table**: `public.attendance_records`
**Columns**:
- `id` (BIGINT) - Auto-incrementing primary key
- `student_id` (BIGINT) - Foreign key to students table
- `date` (DATE) - Date of attendance
- `sign_in_time` (TIMESTAMPTZ) - When student signed in
- `sign_out_time` (TIMESTAMPTZ) - When student signed out
- `hours` (NUMERIC 8,2) - Duration in hours (calculated on sign-out)
- `description` (TEXT) - How they signed in (e.g., "kiosk sign-in")
- `school_id` (BIGINT) - School they attended
- `recorded_by` (UUID) - User who recorded the attendance
- `created_at` (TIMESTAMPTZ) - Record creation timestamp

**Indexes**:
- student_id (for quick student lookups)
- date (for daily reports)
- school_id (for school-based filtering)

### 2. worker_attendance_records (Workers)
**Table**: `public.worker_attendance_records`
**Columns**:
- `id` (BIGINT) - Auto-incrementing primary key
- `worker_id` (BIGINT) - Foreign key to workers table
- `date` (DATE) - Date of work
- `sign_in_time` (TIMESTAMPTZ) - When worker clocked in
- `sign_out_time` (TIMESTAMPTZ) - When worker clocked out
- `hours` (NUMERIC 8,2) - Total hours worked (calculated on sign-out)
- `description` (TEXT) - How they signed in (e.g., "kiosk sign-in")
- `school_id` (BIGINT) - School/location of work
- `recorded_by` (UUID) - Admin who recorded the attendance
- `created_at` (TIMESTAMPTZ) - Record creation timestamp

**Indexes**:
- worker_id (for quick worker lookups)
- date (for payroll period reporting)
- school_id (for location-based queries)

### 3. worker_attendance_totals (View)
**View**: `public.worker_attendance_totals`
**Purpose**: Pre-calculated aggregation for payroll reports
**Columns**:
- `worker_id` (BIGINT) - Which worker
- `total_hours` (NUMERIC) - Sum of all hours worked
- `attendance_count` (INTEGER) - Number of attendance records
- `last_attendance_date` (DATE) - Most recent attendance date

## RLS Policies
All attendance tables have been configured with Row Level Security (RLS):
- **SELECT**: Authenticated users can view all attendance records (needed for kiosk, reports, HR)
- **INSERT**: Authenticated users can create attendance records (kiosk sign-in)
- **UPDATE**: Authenticated users can update attendance records (kiosk sign-out, duration)

This allows the kiosk (which runs under an authenticated Supabase session) to create and update records.

## Sign-In Flow (with Biometrics)

1. **Biometric Verification**
   - User selects person from list (student/worker)
   - Clicks "Verify" button
   - Biometrics component loads cached face descriptors
   - User looks at camera until face matches
   - `onSuccess` callback fires with verified profile ID

2. **Auto-Select After Verify**
   - Verified person is automatically selected
   - Ready for sign-in/out action

3. **Sign-In Action**
   - Click "Sign In" button
   - Payload created:
     ```javascript
     {
       student_id: 123,
       school_id: 9,
       date: "2025-12-30",
       sign_in_time: "2025-12-30T14:30:45.123Z",
       description: "kiosk sign-in",
       recorded_by: "user-uuid"
     }
     ```
   - Record inserted to `attendance_records` (or queued if offline)
   - Optimistic UI update shows "In 1"
   - Flash highlight (green blink) confirms action
   - Toast notification with status

## Sign-Out Flow

1. **Sign-Out Action**
   - Click "Sign Out" button on signed-in person
   - Hours calculated: `hours = (sign_out_time - sign_in_time) / 3600000`
   - Payload created with hours and description
   - Record updated with `sign_out_time` and `hours`
   - Toast shows duration: "Alice: 3.25h"
   - Counter updates

## Auto 17:15 Sign-Out
Every day at 17:15 (5:15 PM), any person still signed in is automatically signed out:
- Signs them out with timestamp 17:15:00
- Sets description to "auto-close 17:15"
- Calculates total hours worked/studied

## Data Flow for Workers (Payroll Tracking)

```
Worker biometric verify
    ↓
Sign In → worker_attendance_records.sign_in_time
    ↓
Work period...
    ↓
Sign Out → worker_attendance_records.sign_out_time + hours
    ↓
Database trigger (future) → worker_attendance_totals view updates
    ↓
HR/Admin view in reports: Total hours per worker
```

## Data Flow for Students (Session Tracking)

```
Student biometric verify
    ↓
Sign In → attendance_records.sign_in_time
    ↓
Session period...
    ↓
Sign Out → attendance_records.sign_out_time + hours
    ↓
Data used for:
  - Session duration reporting
  - After-school program hour tracking
  - Parent communication
  - Program effectiveness metrics
```

## Console Logging

All sign-in/out actions now log detailed information for debugging:

### Sign-In Logs
```
[Kiosk] signInStudents - payload for student 123: {"student_id":123,"school_id":9,"date":"2025-12-30","sign_in_time":"2025-12-30T14:30:45Z","description":"kiosk sign-in","recorded_by":"uuid"}
[Kiosk] signInStudents - student details: {id: 123, name: "Alice Johnson", school_id: 9}
[Kiosk] signInStudents - response for student 123: {data: Array(1), error: null}
[Kiosk] Student 123 saved to attendance_records online
```

### Sign-Out Logs
```
[Kiosk] signOutStudents - updating student 123: hours=3.25, sign_out_time=2025-12-30T17:45:30Z
[Kiosk] Student 123 sign-out saved
```

### Offline Behavior
If offline:
```
[Kiosk] Student 123 queued (mutation key: 42)
```
Data syncs automatically when internet returns.

## Migration Files to Run

Before using this feature, run these migrations in your Supabase SQL editor:

1. **20260103_ensure_attendance_tables.sql**
   - Creates tables if they don't exist
   - Adds any missing columns
   - Creates indexes
   - Creates worker_attendance_totals view

2. **20260103_attendance_rls_policies.sql**
   - Enables RLS on both tables
   - Creates policies for authenticated access
   - Grants permissions

## Testing the Implementation

### 1. Verify Tables Exist
```sql
SELECT * FROM attendance_records LIMIT 1;
SELECT * FROM worker_attendance_records LIMIT 1;
SELECT * FROM worker_attendance_totals LIMIT 1;
```

### 2. Test Kiosk Sign-In
1. Go to `/kiosk`
2. Select a student
3. Click "Verify" → Face recognition
4. Auto-select happens
5. Click "Sign In"
6. Check browser console for logs
7. Look for green flash (1.2s)
8. Counter should show "In 1"

### 3. Verify Data in Supabase
```sql
SELECT * FROM attendance_records 
WHERE student_id = 123 
AND date = CURRENT_DATE
ORDER BY created_at DESC;
```

### 4. Test Sign-Out
1. Click "Sign Out" on signed-in student
2. Toast shows duration: "Student Name: X.XXh"
3. Counter shows "In 0"
4. Check database:
```sql
SELECT student_id, sign_in_time, sign_out_time, hours 
FROM attendance_records 
WHERE student_id = 123 
ORDER BY created_at DESC LIMIT 1;
```

### 5. Offline Testing
1. Open DevTools → Network tab
2. Enable "Offline" mode
3. Sign-in a student
4. Console shows "queued (mutation key: X)"
5. Go online (disable offline mode)
6. Mutation syncs automatically
7. Check Supabase to verify record exists

## Troubleshooting

### No Data Appearing in Supabase
**Issue**: Sign-in succeeds (green flash) but no record in database

**Debugging**:
1. Check browser console for logs
2. Look for `[Kiosk] signInStudents - response` line
3. Check if response has `__error` flag
4. If offline, check `window.dumpOfflineMutations()` in console
5. Verify RLS policies are enabled: `SELECT * FROM pg_policies WHERE tablename = 'attendance_records';`

### Face Descriptor Issues
**Issue**: Biometric takes too long or fails to load

**Debugging**:
1. Check face descriptor cache: `window.dumpFaceDescriptors()`
2. Clear cache if corrupted: `window.clearFaceDescriptors()`
3. Verify user has profile photo uploaded

### Offline Sync Not Working
**Issue**: Queued mutations not syncing when online

**Debugging**:
1. Check mutations queue: `window.dumpOfflineMutations()`
2. Retry mutation: `window.retryOfflineMutation(mutationId)`
3. Check network tab for sync requests

## Production Checklist

- [ ] Run both migration files in Supabase
- [ ] Verify RLS policies are active
- [ ] Test sign-in/out with biometrics
- [ ] Verify data in Supabase tables
- [ ] Test offline sign-in and sync
- [ ] Verify worker_attendance_totals view returns data
- [ ] Configure HR dashboard to display total_hours from view
- [ ] Set up end-of-month payroll report query
- [ ] Document sign-in procedures for staff
- [ ] Train staff on biometric kiosk usage
