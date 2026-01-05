# Attendance System Architecture

## Database Schema

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SUPABASE DATABASE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │             attendance_records (Students)                     │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ id (PK)                                                       │   │
│  │ student_id (FK) ──────→ students.id                           │   │
│  │ date           | Index for daily reports                      │   │
│  │ sign_in_time   | When they arrived                            │   │
│  │ sign_out_time  | When they left                               │   │
│  │ hours          | Calculated: (sign_out - sign_in) / 3600000  │   │
│  │ description    | "kiosk sign-in", "auto-close", etc.         │   │
│  │ school_id      | Index for school filtering                  │   │
│  │ recorded_by    | Admin user UUID (audit trail)               │   │
│  │ created_at     | Timestamp when recorded                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│           ▲                                                           │
│           │ INSERT on sign-in                                        │
│           │ UPDATE on sign-out                                       │
│           │                                                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │        worker_attendance_records (Workers for Payroll)        │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ id (PK)                                                       │   │
│  │ worker_id (FK) ──────→ workers.id                             │   │
│  │ date           | Index for payroll periods                    │   │
│  │ sign_in_time   | Clock in time                                │   │
│  │ sign_out_time  | Clock out time                               │   │
│  │ hours          | Total hours worked (used for payroll)        │   │
│  │ description    | "kiosk sign-in", "auto-close", etc.         │   │
│  │ school_id      | Work location                                │   │
│  │ recorded_by    | Admin user UUID                              │   │
│  │ created_at     | Record creation time                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│           ▲                                                           │
│           │ INSERT on sign-in                                        │
│           │ UPDATE on sign-out + hours                               │
│           │                                                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │   worker_attendance_totals (View - Payroll Aggregation)      │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ worker_id                                                     │   │
│  │ total_hours  ← SUM(hours) from worker_attendance_records    │   │
│  │ attendance_count ← COUNT(*) for this worker                 │   │
│  │ last_attendance_date ← MAX(date)                            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│           ▲                                                           │
│           │ Auto-updated via PostgreSQL trigger                      │
│           │ (or materialized view refresh)                           │
│           │                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Student Session Tracking

```
┌──────────────────────────────────────────────────────────────────────┐
│                    USER INTERACTION (Kiosk.js)                       │
└──────────────────────────────────────────────────────────────────────┘

                           ┌─────────────────┐
                           │ Select Student  │
                           └────────┬────────┘
                                    │
                           ┌────────▼──────────┐
                           │ Click "Verify"    │
                           └────────┬──────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │   Biometrics.js               │
                    │  • Load face descriptors      │
                    │  • Start camera               │
                    │  • Match face vs. profile     │
                    │  • onSuccess() callback       │
                    └───────────────┬───────────────┘
                                    │
                     ┌──────────────▼─────────────┐
                     │ handleBiometricSuccess()   │
                     │ Auto-select student        │
                     └──────────────┬─────────────┘
                                    │
                           ┌────────▼──────────┐
                           │ Click "Sign In"   │
                           └────────┬──────────┘
                                    │
                     ┌──────────────▼─────────────────────┐
                     │ signInStudents(id)                 │
                     │                                    │
                     │ Payload created:                   │
                     │ {                                  │
                     │   student_id: 123,                 │
                     │   school_id: 9,                    │
                     │   date: "2025-12-30",              │
                     │   sign_in_time: "ISO_STRING",      │
                     │   description: "kiosk sign-in",    │
                     │   recorded_by: "USER_UUID"         │
                     │ }                                  │
                     └──────────────┬─────────────────────┘
                                    │
                     ┌──────────────▼──────────────────────────┐
                     │ addStudentAttendance(payload)          │
                     │  (via useOfflineTable hook)            │
                     │                                        │
                     │  if online:                            │
                     │    INSERT into attendance_records      │
                     │  else:                                 │
                     │    queueMutation (sync later)          │
                     └──────────────┬──────────────────────────┘
                                    │
                     ┌──────────────▼──────────────────────────┐
                     │ setOptimisticStudentOpen(id)           │
                     │ flashIds(id)                           │
                     │ await refreshAttendance()              │
                     │                                        │
                     │ UI Changes:                            │
                     │ • Counter: "In 0" → "In 1"            │
                     │ • Green flash (1.2s)                   │
                     │ • Toast: "Face match confirmed"        │
                     └──────────────┬──────────────────────────┘
                                    │
                    ┌───────────────▼──────────────┐
                    │ Data stored in Supabase      │
                    │ attendance_records table     │
                    └──────────────────────────────┘

                   ... student attends session ...

                           ┌─────────────────┐
                           │ Click "Sign Out"│
                           └────────┬────────┘
                                    │
                     ┌──────────────▼─────────────────────┐
                     │ signOutStudents(id)                │
                     │                                    │
                     │ Calculate hours:                   │
                     │ hours = (sign_out - sign_in)       │
                     │         / 3600000                  │
                     │                                    │
                     │ Payload:                           │
                     │ {                                  │
                     │   sign_out_time: "ISO_STRING",     │
                     │   hours: 2.5,                      │
                     │   description: "kiosk sign-out"    │
                     │ }                                  │
                     └──────────────┬─────────────────────┘
                                    │
                     ┌──────────────▼──────────────────────────┐
                     │ updateStudentAttendance(id, payload)   │
                     │                                        │
                     │  UPDATE attendance_records             │
                     │  SET sign_out_time = ...,              │
                     │      hours = ...                       │
                     │  WHERE id = ...                        │
                     └──────────────┬──────────────────────────┘
                                    │
                     ┌──────────────▼──────────────────────────┐
                     │ setOptimisticStudentOpen(remove)        │
                     │ flashIds(id)                            │
                     │ await refreshAttendance()               │
                     │                                        │
                     │ UI Changes:                             │
                     │ • Counter: "In 1" → "In 0"             │
                     │ • Green flash                           │
                     │ • Toast: "Student Name: 2.50h"         │
                     └──────────────┬──────────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────┐
                    │ Data updated in Supabase             │
                    │ attendance_records table             │
                    │ (sign_out_time and hours now set)    │
                    └──────────────────────────────────────┘
```

## Data Flow: Worker Payroll Tracking

```
┌──────────────────────────────────────────────────────────────────────┐
│                   WORKER SIGNS IN (Morning)                          │
└──────────────────────────────────────────────────────────────────────┘

    Kiosk → Biometrics → Face Match → signInWorkers()
        │
        ├─→ INSERT into worker_attendance_records:
        │   • worker_id: 456
        │   • date: 2025-12-30
        │   • sign_in_time: 08:30:00
        │   • school_id: 9
        │   • description: "kiosk sign-in"
        │
        └─→ UI Updates:
            • Counter shows "In: 1"
            • Toast shows face match confirmed
            • Green flash highlight

┌──────────────────────────────────────────────────────────────────────┐
│                   WORKER SIGNS OUT (End of Day)                      │
└──────────────────────────────────────────────────────────────────────┘

    Kiosk → Click "Sign Out" → signOutWorkers()
        │
        ├─→ Calculate hours: (sign_out_time - sign_in_time) / 3600000
        │
        ├─→ UPDATE worker_attendance_records:
        │   • sign_out_time: 17:00:00 (9.5 hours later)
        │   • hours: 9.5
        │   • description: "kiosk sign-out"
        │
        └─→ UI Updates:
            • Counter shows "In: 0"
            • Toast shows "Worker Name: 9.50h"
            • Data saved to Supabase

┌──────────────────────────────────────────────────────────────────────┐
│              PAYROLL AGGREGATION (End of Month Report)               │
└──────────────────────────────────────────────────────────────────────┘

    HR/Payroll Admin
        │
        ├─→ Query worker_attendance_totals view:
        │   SELECT * FROM worker_attendance_totals
        │   WHERE worker_id = 456
        │
        └─→ See summary:
            • total_hours: 182.5 (all hours this month)
            • attendance_count: 22 (worked 22 days)
            • last_attendance_date: 2025-12-30
            
            Use total_hours for salary calculation:
            Pay = total_hours × hourly_rate
```

## State Management in Kiosk.js

```
┌─────────────────────────────────────────────────────┐
│         Kiosk Component State Variables              │
├─────────────────────────────────────────────────────┤
│                                                     │
│ entityType                                          │
│ ├─ "worker"  ← Selected workers only               │
│ └─ "student" ← Selected students only              │
│   (Never mixed in one action)                       │
│                                                     │
│ selectedIds                                         │
│ ├─ [1, 2, 3]  ← IDs of selected people            │
│   (Can select multiple for bulk sign-in/out)       │
│                                                     │
│ optimisticWorkerOpen (Set)                          │
│ └─ {1, 3, 5}  ← Worker IDs currently signed in     │
│   (UI shows "In: 3" when set has 3 items)          │
│                                                     │
│ optimisticStudentOpen (Set)                         │
│ └─ {10, 20}  ← Student IDs currently signed in     │
│   (UI shows "In: 2" when set has 2 items)          │
│                                                     │
│ flash (Map)                                         │
│ ├─ workers: {1, 3}  ← Briefly highlight on action │
│ └─ students: {10}   ← Green glow for 1.2s         │
│                                                     │
│ biometricVerifiedId                                 │
│ └─ 456  ← ID of person who just verified           │
│   (Auto-selects them for sign-in/out)              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Offline Behavior

```
┌─────────────────────────────────────────┐
│  ONLINE MODE                            │
├─────────────────────────────────────────┤
│ addStudentAttendance()                  │
│   └─→ INSERT directly to Supabase       │
│       └─→ Returns data immediately      │
│                                         │
│ updateStudentAttendance()               │
│   └─→ UPDATE directly to Supabase       │
│       └─→ Returns immediately           │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  OFFLINE MODE (navigator.onLine = false)│
├─────────────────────────────────────────┤
│ addStudentAttendance()                  │
│   └─→ queueMutation() to IndexedDB      │
│       ├─→ Stores mutation record        │
│       ├─→ Broadcasts to other tabs      │
│       ├─→ Registers background sync     │
│       └─→ Returns tempId/mutationKey    │
│                                         │
│ updateStudentAttendance()               │
│   └─→ queueMutation() to IndexedDB      │
│       └─→ Syncs when online (later)     │
│                                         │
│ When online again:                      │
│ → syncMutations() processes queue       │
│ → Each INSERT/UPDATE sent to Supabase   │
│ → Mutation removed from queue           │
│ → Kiosk refreshes to show real data     │
└─────────────────────────────────────────┘
```

## Integration Points

```
┌────────────────────────────────────────────────────────┐
│                    Biometrics.js                        │
├────────────────────────────────────────────────────────┤
│ • Handles face detection & matching                    │
│ • Caches face descriptors (4 hour sessions)            │
│ • Calls onSuccess() callback with verified profile ID  │
└────────────────────┬─────────────────────────────────┘
                     │
                     │ onSuccess=(handleBiometricSuccess)
                     │
┌────────────────────▼──────────────────────────────────┐
│                    Kiosk.js                           │
├───────────────────────────────────────────────────────┤
│ • Manages selection & sign-in/out UI                  │
│ • Calls signInStudents() / signInWorkers()            │
│ • Calls signOutStudents() / signOutWorkers()          │
│ • Updates optimistic state immediately                │
│ • Calls refreshAttendance() to sync with backend      │
└────────────────────┬─────────────────────────────────┘
                     │
                     │ addStudentAttendance() hook call
                     │ updateStudentAttendance() hook call
                     │
┌────────────────────▼──────────────────────────────────┐
│                useOfflineTable.js                     │
├───────────────────────────────────────────────────────┤
│ • addRow(payload)                                     │
│   ├─ Online: INSERT to Supabase directly              │
│   └─ Offline: queueMutation() to IndexedDB            │
│                                                       │
│ • updateRow(id, data)                                 │
│   ├─ Online: UPDATE to Supabase directly              │
│   └─ Offline: queueMutation() to IndexedDB            │
│                                                       │
│ • refreshAttendance()                                 │
│   └─ Fetches latest from Supabase/cache               │
└────────────────────┬──────────────────────────────────┘
                     │
                     │ INSERT/UPDATE/SELECT
                     │
        ┌────────────▼────────────┐
        │   Supabase Database     │
        │  attendance_records     │
        │  worker_attendance_     │
        │  records                │
        │  worker_attendance_     │
        │  totals (view)          │
        └─────────────────────────┘
```

## Time-Based Events

```
┌─────────────────────────────────────────┐
│     Daily Auto Sign-Out at 17:15        │
├─────────────────────────────────────────┤
│                                         │
│ Kiosk.js useEffect():                  │
│ ├─ Check current time every minute     │
│ ├─ When time >= 17:15:00:              │
│ │  └─ For each signed-in person:       │
│ │     ├─ signOutWorkers(ids)           │
│ │     │  └─ forcedTimeIso = "17:15Z"   │
│ │     └─ signOutStudents(ids)          │
│ │        └─ description: "auto-close"  │
│ │                                       │
│ └─ Sets autoCloseRef flag               │
│    (prevents running twice)             │
│                                         │
└─────────────────────────────────────────┘
```

This architecture ensures:
✅ Data integrity for payroll
✅ Accurate session duration tracking
✅ Works offline with sync capability
✅ Auditable with recorded_by tracking
✅ Scalable with proper indexing
✅ RLS-protected with policies
