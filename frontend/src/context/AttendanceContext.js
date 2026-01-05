import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import useOfflineTable from "../hooks/useOfflineTable";

const AttendanceContext = createContext();

export function AttendanceProvider({ children }) {
  const today = new Date().toISOString().split("T")[0];
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Fetch today's worker and student attendance records
  // Include refreshTrigger in filter to force re-fetch via useEffect dependency change
  const { rows: workerDayRows = [] } = useOfflineTable(
    "worker_attendance_records",
    { date: today, _refresh: refreshTrigger },
    "*",
    200,
    "id",
    "desc"
  );
  
  const { rows: studentDayRows = [] } = useOfflineTable(
    "attendance_records",
    { date: today, _refresh: refreshTrigger },
    "*",
    200,
    "id",
    "desc"
  );

  // Force a refresh of attendance data
  const refreshAttendance = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Compute sign-in/out status
  const openWorkerIds = React.useMemo(
    () => new Set((workerDayRows || []).filter(r => !r.sign_out_time).map(r => r.worker_id)),
    [workerDayRows]
  );

  const openStudentIds = React.useMemo(
    () => new Set((studentDayRows || []).filter(r => !r.sign_out_time).map(r => r.student_id)),
    [studentDayRows]
  );

  const isWorkerSignedIn = (workerId) => openWorkerIds.has(workerId);
  const isStudentSignedIn = (studentId) => openStudentIds.has(studentId);

  return (
    <AttendanceContext.Provider value={{
      today,
      workerDayRows,
      studentDayRows,
      openWorkerIds,
      openStudentIds,
      isWorkerSignedIn,
      isStudentSignedIn,
      refreshAttendance,
      refreshTrigger,
    }}>
      {children}
    </AttendanceContext.Provider>
  );
}

export const useAttendance = () => {
  const context = useContext(AttendanceContext);
  if (!context) {
    throw new Error('useAttendance must be used within AttendanceProvider');
  }
  return context;
};
