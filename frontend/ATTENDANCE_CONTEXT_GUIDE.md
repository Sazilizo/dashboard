/**
 * GLOBAL ATTENDANCE CONTEXT USAGE GUIDE
 * 
 * The AttendanceContext provides global access to today's attendance status
 * across all pages (Kiosk, Dashboard, Login after redirect, etc.)
 */

// ============ USAGE EXAMPLES ============

// Example 1: In any page or component that needs attendance status
import { useAttendance } from "../context/AttendanceContext";

export function MyComponent() {
  const { 
    today,              // ISO date string for today (e.g., "2025-12-28")
    openWorkerIds,      // Set of worker IDs signed in today
    openStudentIds,     // Set of student IDs signed in today
    isWorkerSignedIn,   // Function: (workerId) => boolean
    isStudentSignedIn,  // Function: (studentId) => boolean
  } = useAttendance();

  // Check if a specific worker is signed in
  if (isWorkerSignedIn(workerId)) {
    // Worker has unsigned-out record (currently signed in)
  }

  // Check if a specific student is signed in
  if (isStudentSignedIn(studentId)) {
    // Student has unsigned-out record (currently signed in)
  }

  // Iterate over all signed-in workers
  openWorkerIds.forEach(id => {
    console.log(`Worker ${id} is signed in`);
  });

  return <div>Attendance: {openWorkerIds.size} workers signed in</div>;
}

// ============ CONTEXT FEATURES ============

/**
 * AttendanceContext is wrapped around the entire app in src/app.js
 * It automatically:
 * - Queries today's worker_attendance_records
 * - Queries today's attendance_records (students)
 * - Computes sets of IDs with unsigned-out records (currently "open")
 * - Re-queries when the component re-renders or data changes
 * 
 * This means:
 * - Changes in Kiosk are immediately visible in other pages
 * - State persists across navigation
 * - Data is always fresh and reflects offline changes
 */

// ============ WHERE TO USE ============

/**
 * Use this context to:
 * 1. Display attendance status in Dashboard
 * 2. Show "currently signed in" badge in employee profiles
 * 3. Display attendance widgets on home pages
 * 4. Check sign-in status before allowing certain actions
 * 5. Render status indicators globally (e.g., "50 workers signed in")
 * 
 * The context automatically updates when:
 * - A user signs in via Kiosk
 * - A user signs out via Kiosk
 * - The offline database is synced with server
 */
