import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useToast from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";
import Biometrics from "../components/biometrics/Biometrics";
import useOfflineTable from "../hooks/useOfflineTable";
import FiltersPanel from "../components/filters/FiltersPanel";
import { useFilters } from "../context/FiltersContext";
import { useAuth } from "../context/AuthProvider";
import { useSchools } from "../context/SchoolsContext";
import { useData } from "../context/DataContext";
import { useAttendance } from "../context/AttendanceContext";
import Photos from "../components/profiles/Photos";
import AttendanceRollbackReview from "./AttendanceRollbackReview";
const ENTITY = { WORKER: "worker", STUDENT: "student" };

/**
 * Industry-Standard Kiosk Component
 * - Enforces biometric verification before sign-in/out
 * - Prevents cross-entity selection (workers + students simultaneously)
 * - Offline-first with persistent state
 * - Real-time attendance tracking
 * - Backend calculates hours (frontend sends timestamps only)
 */
export default function Kiosk() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();
  const { workers: dataWorkers, students: dataStudents, fetchData } = useData();
  const { openWorkerIds, openStudentIds, workerDayRows, studentDayRows, refreshAttendance } = useAttendance();
  const { toasts, showToast, removeToast } = useToast();

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  /* ------------------ Offline Tables ------------------ */
  const {
    rows: workerRows = [],
    isOnline: workerOnline,
  } = useOfflineTable("worker_attendance_records", { date: today }, "*", 200, "id", "desc");

  const {
    rows: studentRows = [],
    isOnline: studentOnline,
  } = useOfflineTable("attendance_records", { date: today }, "*", 200, "id", "desc");

  const isOnline = workerOnline || studentOnline;

  /* ------------------ State ------------------ */
  const [allWorkers, setAllWorkers] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [activeEntity, setActiveEntity] = useState(null); // "worker" or "student"
  const [selectedIds, setSelectedIds] = useState([]);
  const [biometricModal, setBiometricModal] = useState(null); // { profile, entityType, action, existingRecordId, schoolId, recordedBy }
  const [flash, setFlash] = useState({ workers: new Set(), students: new Set() });

  const isAllSchoolRole = useMemo(() => {
    const roleName = user?.profile?.roles?.name;
    return ["superuser", "admin", "hr", "viewer"].includes(roleName);
  }, [user?.profile?.roles?.name]);

  const schoolIds = useMemo(() => {
    if (isAllSchoolRole) {
      if (Array.isArray(filters.school_id) && filters.school_id.length) {
        return filters.school_id.map((id) => Number(id)).filter(Number.isFinite);
      }
      return (schools || []).map((s) => s.id).filter(Number.isFinite);
    }
    return user?.profile?.school_id ? [user.profile.school_id] : [];
  }, [isAllSchoolRole, filters.school_id, schools, user?.profile?.school_id]);

  /* ------------------ Fetch & Set Data ------------------ */
  useEffect(() => {
    if (schoolIds.length) fetchData(schoolIds);
  }, [fetchData, schoolIds.join(",")]);

  useEffect(() => setAllWorkers(dataWorkers || []), [dataWorkers]);
  useEffect(() => setAllStudents(dataStudents || []), [dataStudents]);

  /* ------------------ Filtered lists ------------------ */
  const filteredWorkers = useMemo(() => {
    let filtered = [...allWorkers];
    if (schoolIds.length && !schoolIds.includes(-1)) filtered = filtered.filter((w) => schoolIds.includes(w.school_id));
    return filtered;
  }, [allWorkers, schoolIds]);

  const filteredStudents = useMemo(() => {
    let filtered = [...allStudents];
    if (schoolIds.length && !schoolIds.includes(-1)) filtered = filtered.filter((s) => schoolIds.includes(s.school_id));
    if (Array.isArray(filters.grade) && filters.grade.length) filtered = filtered.filter((s) => filters.grade.includes(s.grade));
    return filtered;
  }, [allStudents, schoolIds, filters.grade]);

  /* ------------------ Open/Closed Maps ------------------ */
  const workerOpenMap = useMemo(() => {
    const map = new Map();
    (workerDayRows || []).forEach(r => {
      if (!r.sign_out_time) map.set(r.worker_id, r);
    });
    return map;
  }, [workerDayRows]);

  const studentOpenMap = useMemo(() => {
    const map = new Map();
    (studentDayRows || []).forEach(r => {
      if (!r.sign_out_time) map.set(r.student_id, r);
    });
    return map;
  }, [studentDayRows]);

  /* ------------------ Flash Effect ------------------ */
  const flashIds = useCallback((ids, entityType) => {
    if (!ids.length) return;
    const key = entityType === ENTITY.WORKER ? "workers" : "students";
    
    setFlash((prev) => {
      const nextSet = new Set(prev[key]);
      ids.forEach((id) => nextSet.add(id));
      return { ...prev, [key]: nextSet };
    });

    setTimeout(() => {
      setFlash((prev) => {
        const nextSet = new Set(prev[key]);
        ids.forEach((id) => nextSet.delete(id));
        return { ...prev, [key]: nextSet };
      });
    }, 1500);
  }, []);

  /* ------------------ Selection Handlers ------------------ */
  const handleToggleSelection = useCallback((id, entityType) => {
    // Enforce single entity type selection
    if (activeEntity && activeEntity !== entityType) {
      showToast(`Clear ${activeEntity} selection before selecting ${entityType}s`, "warning");
      return;
    }

    setSelectedIds(prev => {
      const isSelected = prev.includes(id);
      const newSelection = isSelected ? prev.filter(i => i !== id) : [...prev, id];
      
      // Update active entity
      if (newSelection.length === 0) {
        setActiveEntity(null);
      } else if (!activeEntity) {
        setActiveEntity(entityType);
      }
      
      return newSelection;
    });
  }, [activeEntity, showToast]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setActiveEntity(null);
  }, []);

  /* ------------------ Biometric Flow ------------------ */
  const startBiometricVerification = useCallback((profile, entityType, action, existingRecordId = null) => {
    setBiometricModal({
      profile,
      entityType,
      action,
      existingRecordId,
      schoolId: profile.school_id,
      recordedBy: user?.profile?.id || null,
    });
  }, [user?.profile?.id]);

  const handleBiometricSuccess = useCallback(async (result) => {
    console.log("[Kiosk] Biometric success:", result);
    
    const { profileId, action, record } = result;
    const entityType = biometricModal.entityType;
    
    // Flash the updated entity
    flashIds([profileId], entityType);
    
    // Refresh attendance context
    await refreshAttendance();
    
    // Close modal
    setBiometricModal(null);
    
    // Clear selection if single entity
    if (selectedIds.length === 1) {
      clearSelection();
    } else {
      // Remove verified entity from selection for bulk operations
      setSelectedIds(prev => prev.filter(id => id !== profileId));
    }
    
    showToast(
      `${entityType === ENTITY.WORKER ? "Worker" : "Student"} ${action === "sign_in" ? "signed in" : "signed out"} successfully`,
      "success"
    );
  }, [biometricModal, selectedIds, flashIds, refreshAttendance, clearSelection, showToast]);

  const handleBiometricCancel = useCallback(() => {
    setBiometricModal(null);
  }, []);

  /* ------------------ Bulk Sign In/Out (with enforced biometric verification) ------------------ */
  const handleBulkSignIn = useCallback(() => {
    if (!activeEntity || selectedIds.length === 0) {
      showToast("Select at least one person first", "warning");
      return;
    }

    // Get first selected entity for biometric verification
    const firstId = selectedIds[0];
    const entity = activeEntity === ENTITY.WORKER
      ? filteredWorkers.find(w => w.id === firstId)
      : filteredStudents.find(s => s.id === firstId);

    if (!entity) {
      showToast("Selected entity not found", "error");
      return;
    }

    // Check if already signed in
    const openMap = activeEntity === ENTITY.WORKER ? workerOpenMap : studentOpenMap;
    if (openMap.has(firstId)) {
      showToast("This person is already signed in", "warning");
      return;
    }

    // Start biometric verification for first entity
    startBiometricVerification(entity, activeEntity, "sign_in");
  }, [activeEntity, selectedIds, filteredWorkers, filteredStudents, workerOpenMap, studentOpenMap, startBiometricVerification, showToast]);

  const handleBulkSignOut = useCallback(() => {
    if (!activeEntity || selectedIds.length === 0) {
      showToast("Select at least one person first", "warning");
      return;
    }

    // Get first selected entity for biometric verification
    const firstId = selectedIds[0];
    const entity = activeEntity === ENTITY.WORKER
      ? filteredWorkers.find(w => w.id === firstId)
      : filteredStudents.find(s => s.id === firstId);

    if (!entity) {
      showToast("Selected entity not found", "error");
      return;
    }

    // Check if signed in
    const openMap = activeEntity === ENTITY.WORKER ? workerOpenMap : studentOpenMap;
    const openRecord = openMap.get(firstId);
    
    if (!openRecord) {
      showToast("This person is not signed in", "warning");
      return;
    }

    // Start biometric verification for first entity with existing record ID
    startBiometricVerification(entity, activeEntity, "sign_out", openRecord.id);
  }, [activeEntity, selectedIds, filteredWorkers, filteredStudents, workerOpenMap, studentOpenMap, startBiometricVerification, showToast]);

  /* ------------------ Single Entity Quick Sign In/Out ------------------ */
  const handleQuickSignIn = useCallback((entity, entityType) => {
    const openMap = entityType === ENTITY.WORKER ? workerOpenMap : studentOpenMap;
    if (openMap.has(entity.id)) {
      showToast("Already signed in", "warning");
      return;
    }
    startBiometricVerification(entity, entityType, "sign_in");
  }, [workerOpenMap, studentOpenMap, startBiometricVerification, showToast]);

  const handleQuickSignOut = useCallback((entity, entityType) => {
    const openMap = entityType === ENTITY.WORKER ? workerOpenMap : studentOpenMap;
    const openRecord = openMap.get(entity.id);
    
    if (!openRecord) {
      showToast("Not signed in", "warning");
      return;
    }
    
    startBiometricVerification(entity, entityType, "sign_out", openRecord.id);
  }, [workerOpenMap, studentOpenMap, startBiometricVerification, showToast]);

  /* ------------------ Render Entity List ------------------ */
  const renderList = useCallback((items, entityType) => {
    const openMap = entityType === ENTITY.WORKER ? workerOpenMap : studentOpenMap;
    const flashSet = entityType === ENTITY.WORKER ? flash.workers : flash.students;
    const isOtherEntityActive = activeEntity && activeEntity !== entityType;

    return (
      <div style={{ maxHeight: 520, overflowY: "auto", opacity: isOtherEntityActive ? 0.4 : 1, pointerEvents: isOtherEntityActive ? "none" : "auto" }}>
        {items.length ? (
          items.map((item) => {
            const isSelected = selectedIds.includes(item.id) && activeEntity === entityType;
            const isOpen = openMap.has(item.id);
            const isFlashing = flashSet.has(item.id);

            return (
              <div
                key={`${entityType}-${item.id}`}
                style={{
                  padding: 12,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 8,
                  background: isFlashing ? "#ecfdf3" : isSelected ? "#eef2ff" : "#fff",
                  transition: "all 0.3s ease",
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleSelection(item.id, entityType)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                
                <div style={{ width: 48, height: 48, borderRadius: 6, overflow: "hidden", position: "relative" }}>
                  <Photos
                    bucketName={entityType === ENTITY.WORKER ? "worker-uploads" : "student-uploads"}
                    folderName={entityType === ENTITY.WORKER ? "workers" : "students"}
                    id={item.id}
                    photoCount={1}
                    restrictToProfileFolder={true}
                  />
                  <span
                    title={isOpen ? "Signed in" : "Signed out"}
                    style={{
                      position: "absolute",
                      right: -2,
                      bottom: -2,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: isOpen ? "#10b981" : "#ef4444",
                      border: "2px solid #fff",
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {entityType === ENTITY.WORKER
                      ? `${item.name} ${item.last_name || ""}`
                      : item.full_name}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 12,
                        color: isOpen ? "#10b981" : "#ef4444",
                        fontWeight: 500,
                      }}
                    >
                      • {isOpen ? "In" : "Out"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {entityType === ENTITY.WORKER
                      ? `School: ${item.school_name || "n/a"}`
                      : `Grade: ${item.grade || "n/a"}`}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  {!isOpen ? (
                    <button
                      onClick={() => handleQuickSignIn(item, entityType)}
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        borderRadius: 6,
                        border: "1px solid #10b981",
                        background: "#10b981",
                        color: "#fff",
                        cursor: "pointer",
                        fontWeight: 500,
                      }}
                    >
                      Sign In
                    </button>
                  ) : (
                    <button
                      onClick={() => handleQuickSignOut(item, entityType)}
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        borderRadius: 6,
                        border: "1px solid #ef4444",
                        background: "#ef4444",
                        color: "#fff",
                        cursor: "pointer",
                        fontWeight: 500,
                      }}
                    >
                      Sign Out
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
            No {entityType === ENTITY.WORKER ? "workers" : "students"} available
          </div>
        )}
      </div>
    );
  }, [selectedIds, activeEntity, workerOpenMap, studentOpenMap, flash, handleToggleSelection, handleQuickSignIn, handleQuickSignOut]);

  /* ------------------ MAIN RENDER ------------------ */
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 24 }}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        
        {/* Header with Title, Online Status, and Back Button */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "#111827" }}>Attendance Kiosk</h1>
            <p style={{ margin: "4px 0 0 0", fontSize: 14, color: "#6b7280" }}>Biometric-verified sign in/out system</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                background: isOnline ? "#d1fae5" : "#fee2e2",
                color: isOnline ? "#065f46" : "#991b1b",
              }}
            >
              {isOnline ? "🟢 Online" : "🔴 Offline"}
            </span>
            <button
              onClick={() => navigate("/dashboard")}
              style={{
                padding: "10px 16px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#111827",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>

        {/* Action Bar with Entity Type Toggle and Bulk Actions */}
        <div style={{ 
          display: "flex", 
          gap: 12, 
          flexWrap: "wrap", 
          alignItems: "center", 
          marginBottom: 20,
          padding: 12,
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
        }}>
          {/* Entity Type Toggle */}
          <div style={{ display: "flex", gap: 8, borderRight: "1px solid #e5e7eb", paddingRight: 12 }}>
            {[ENTITY.WORKER, ENTITY.STUDENT].map((type) => (
              <button 
                key={type} 
                onClick={() => {
                  setActiveEntity(type);
                  setSelectedIds([]);
                }}
                style={{
                  padding: "10px 16px",
                  borderRadius: 6,
                  border: "1px solid " + (activeEntity === type ? "transparent" : "#e5e7eb"),
                  background: activeEntity === type ? "#111827" : "#fff",
                  color: activeEntity === type ? "#fff" : "#6b7280",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 500,
                  transition: "all 0.2s ease",
                }}
              >
                {type === ENTITY.WORKER ? "Workers" : "Students"}
              </button>
            ))}
          </div>

          {/* Bulk Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={activeEntity !== ENTITY.WORKER && activeEntity !== ENTITY.STUDENT}
              onClick={handleBulkSignIn}
              style={{
                padding: "10px 16px",
                borderRadius: 6,
                border: "1px solid #3b82f6",
                background: "#3b82f6",
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
                opacity: (activeEntity !== ENTITY.WORKER && activeEntity !== ENTITY.STUDENT) ? 0.5 : 1,
                transition: "all 0.2s ease",
              }}
            >
              🔒 Bulk Sign In ({selectedIds.length})
            </button>
            <button
              disabled={activeEntity !== ENTITY.WORKER && activeEntity !== ENTITY.STUDENT}
              onClick={handleBulkSignOut}
              style={{
                padding: "10px 16px",
                borderRadius: 6,
                border: "1px solid #ef4444",
                background: "#ef4444",
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
                opacity: (activeEntity !== ENTITY.WORKER && activeEntity !== ENTITY.STUDENT) ? 0.5 : 1,
                transition: "all 0.2s ease",
              }}
            >
              🔒 Bulk Sign Out ({selectedIds.length})
            </button>
            {/* Add a new panel/tab for admin review */}
            <div style={{ marginTop: 24 }}>
              <h3 style={{ marginBottom: 12 }}>Attendance Rollback Review</h3>
              <AttendanceRollbackReview currentUser={user} />
            </div>
          </div>

          {/* Clear Selection Button */}
          {selectedIds.length > 0 && (
            <button
              onClick={clearSelection}
              style={{
                padding: "10px 16px",
                borderRadius: 6,
                border: "1px solid #9ca3af",
                background: "#fff",
                color: "#111827",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Clear Selection
            </button>
          )}
        </div>

        {/* Filters Panel */}
        <FiltersPanel 
          user={user} 
          schools={schools || []} 
          filters={filters} 
          setFilters={setFilters} 
          resource={activeEntity === ENTITY.STUDENT ? "students" : "workers"} 
        />

        {/* Two-Column Grid Layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
          
          {/* Workers Column */}
          <div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              paddingBottom: 12,
              borderBottom: "2px solid #e5e7eb",
            }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" }}>Workers</h3>
              <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>({filteredWorkers.length})</span>
            </div>
            {renderList(filteredWorkers, ENTITY.WORKER)}
          </div>

          {/* Students Column */}
          <div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              paddingBottom: 12,
              borderBottom: "2px solid #e5e7eb",
            }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" }}>Students</h3>
              <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>({filteredStudents.length})</span>
            </div>
            {renderList(filteredStudents, ENTITY.STUDENT)}
          </div>

        </div>

        {/* Biometric Modal */}
        {biometricModal && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}>
            <div style={{
              background: "#fff",
              borderRadius: 8,
              padding: 24,
              width: "90%",
              maxWidth: 600,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)",
            }}>
              <Biometrics
                profile={biometricModal.profile}
                entityType={biometricModal.entityType}
                action={biometricModal.action}
                existingRecordId={biometricModal.existingRecordId}
                schoolId={biometricModal.schoolId}
                recordedBy={biometricModal.recordedBy}
                onSuccess={handleBiometricSuccess}
                onCancel={handleBiometricCancel}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
