import React, { useEffect, useMemo, useRef, useState } from "react";
import useToast from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";
import Biometrics from "../components/biometrics/Biometrics";
import useOfflineTable from "../hooks/useOfflineTable";
import { getCachedImagesByEntity } from "../utils/imageCache";
import FiltersPanel from "../components/filters/FiltersPanel";
import { useFilters } from "../context/FiltersContext";
import { useAuth } from "../context/AuthProvider";
import { useSchools } from "../context/SchoolsContext";
import { useData } from "../context/DataContext";
import { useAttendance } from "../context/AttendanceContext";
import Photos from "../components/profiles/Photos";

const ENTITY = { worker: "worker", student: "student" };
const CUTOFF_HOUR = 17;
const CUTOFF_MINUTE = 15;

const computeHours = (startIso, endIso) => {
  if (!startIso) return null;
  const diff = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (isNaN(diff) || diff < 0) return null;
  return Number((diff / (1000 * 60 * 60)).toFixed(2));
};

export default function Kiosk() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();
  const { workers: dataWorkers, students: dataStudents, fetchData } = useData();
  const { openWorkerIds, openStudentIds, workerDayRows, studentDayRows, refreshAttendance } = useAttendance();
  const { toasts, showToast, removeToast } = useToast();

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  /* ------------------ Offline tables ------------------ */
  const {
    rows: workerRows = [],
    addRow: addWorkerAttendance,
    updateRow: updateWorkerAttendance,
    isOnline: workerOnline,
  } = useOfflineTable("worker_attendance_records", { date: today }, "*", 200, "id", "desc");

  const {
    rows: studentRows = [],
    addRow: addStudentAttendance,
    updateRow: updateStudentAttendance,
    isOnline: studentOnline,
  } = useOfflineTable("attendance_records", { date: today }, "*", 200, "id", "desc");

  const isOnline = workerOnline || studentOnline;

  /* ------------------ State ------------------ */
  const [allWorkers, setAllWorkers] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [entityType, setEntityType] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [biometricTarget, setBiometricTarget] = useState(null);
  const [biometricEntityType, setBiometricEntityType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [biometricVerifiedId, setBiometricVerifiedId] = useState(null);
  const [optimisticWorkerOpen, setOptimisticWorkerOpen] = useState(new Set());
  const [optimisticStudentOpen, setOptimisticStudentOpen] = useState(new Set());
  const [flash, setFlash] = useState({ workers: new Set(), students: new Set() });
  const autoCloseRef = useRef(null);

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

  /* ------------------ Open maps ------------------ */
  const workerOpenMap = useMemo(() => new Map((workerDayRows || []).filter(r => !r.sign_out_time).map(r => [r.worker_id, r])), [workerDayRows]);
  const studentOpenMap = useMemo(() => new Map((studentDayRows || []).filter(r => !r.sign_out_time).map(r => [r.student_id, r])), [studentDayRows]);

  useEffect(() => setOptimisticWorkerOpen(new Set(openWorkerIds)), [openWorkerIds]);
  useEffect(() => setOptimisticStudentOpen(new Set(openStudentIds)), [openStudentIds]);

  /* ------------------ Flash effect ------------------ */
  const flashIds = (ids, type) => {
    if (!ids.length) return;
    const key = type === ENTITY.worker ? "workers" : "students";
    setFlash((prev) => {
      const nextSet = new Set(prev[key]);
      ids.forEach((id) => nextSet.add(id));
      return { ...prev, [key]: nextSet };
    });
    setTimeout(() => setFlash((prev) => {
      const nextSet = new Set(prev[key]);
      ids.forEach((id) => nextSet.delete(id));
      return { ...prev, [key]: nextSet };
    }), 1200);
  };

  /* ------------------ Biometric handlers ------------------ */
  const handleBiometricStart = (entity, type) => {
    setBiometricEntityType(type);
    setBiometricTarget(entity);
    setBiometricVerifiedId(null);
  };

  const handleBiometricSuccess = ({ profileId, workerId, biometricProof }) => {
    setBiometricVerifiedId(profileId);
    showToast("Face match confirmed", "success");
    setSelectedIds([profileId]);
    setEntityType(biometricEntityType);
    setBiometricTarget(null);
  };

  const resetSelection = (keepType = false) => {
    setSelectedIds([]);
    if (!keepType) setEntityType(null);
    setBiometricVerifiedId(null);
  };

  /* ------------------ Sign in/out logic ------------------ */
  const signInWorkers = async (ids) => {
    const now = new Date().toISOString();
    const results = { done: 0, queued: 0, skipped: 0, errors: 0, errorDetails: [] };
    for (const id of ids) {
      if (workerOpenMap.has(id)) { results.skipped++; continue; }
      const worker = filteredWorkers.find(w => w.id === id);
      const res = await addWorkerAttendance({
        worker_id: id,
        school_id: worker?.school_id || null,
        date: today,
        sign_in_time: now,
        recorded_by: user?.profile?.id || null,
      });
      if (res?.__error) { results.errors++; results.errorDetails.push(`Worker ${id} failed`); }
      else results.done++;
    }
    setOptimisticWorkerOpen(prev => { const next = new Set(prev); ids.forEach(i => next.add(i)); return next; });
    flashIds(ids, ENTITY.worker);
    await refreshAttendance();
    return results;
  };

  const signOutWorkers = async (ids, forcedTimeIso) => {
    const endIso = forcedTimeIso || new Date().toISOString();
    const results = { done: 0, queued: 0, skipped: 0, errors: 0, durations: [] };
    for (const id of ids) {
      const open = workerOpenMap.get(id);
      if (open) {
        const hours = computeHours(open.sign_in_time, endIso);
        const res = await updateWorkerAttendance(open.id, { sign_out_time: endIso, hours });
        if (res?.__error) results.errors++;
        else results.done++;
        const w = filteredWorkers.find(w => w.id === id);
        results.durations.push({ id, name: w ? `${w.name} ${w.last_name || ""}` : `Worker ${id}`, hours });
      }
    }
    setOptimisticWorkerOpen(prev => { const next = new Set(prev); ids.forEach(i => next.delete(i)); return next; });
    flashIds(ids, ENTITY.worker);
    await refreshAttendance();
    return results;
  };

  const signInStudents = async (ids) => {
    const now = new Date().toISOString();
    const results = { done: 0, queued: 0, skipped: 0, errors: 0 };
    for (const id of ids) {
      if (studentOpenMap.has(id)) { results.skipped++; continue; }
      const student = filteredStudents.find(s => s.id === id);
      const res = await addStudentAttendance({
        student_id: id,
        school_id: student?.school_id || null,
        date: today,
        sign_in_time: now,
        status: "present",
        method: "kiosk",
        recorded_by: user?.profile?.id || null,
      });
      if (res?.__error) results.errors++;
      else results.done++;
    }
    setOptimisticStudentOpen(prev => { const next = new Set(prev); ids.forEach(i => next.add(i)); return next; });
    flashIds(ids, ENTITY.student);
    await refreshAttendance();
    return results;
  };

  const signOutStudents = async (ids, forcedTimeIso) => {
    const endIso = forcedTimeIso || new Date().toISOString();
    const results = { done: 0, queued: 0, skipped: 0, errors: 0, durations: [] };
    for (const id of ids) {
      const open = studentOpenMap.get(id);
      if (open) {
        const hours = computeHours(open.sign_in_time, endIso);
        const res = await updateStudentAttendance(open.id, { sign_out_time: endIso, hours, status: "completed" });
        if (res?.__error) results.errors++;
        else results.done++;
        const s = filteredStudents.find(s => s.id === id);
        results.durations.push({ id, name: s?.full_name || `Student ${id}`, hours });
      }
    }
    setOptimisticStudentOpen(prev => { const next = new Set(prev); ids.forEach(i => next.delete(i)); return next; });
    flashIds(ids, ENTITY.student);
    await refreshAttendance();
    return results;
  };

  const handleBulk = async (action) => {
    if (!entityType || !selectedIds.length) { showToast("Select at least one person", "warning"); return; }
    setLoading(true);
    try {
      let result;
      if (entityType === ENTITY.worker) result = action === "in" ? await signInWorkers(selectedIds) : await signOutWorkers(selectedIds);
      else result = action === "in" ? await signInStudents(selectedIds) : await signOutStudents(selectedIds);
      
      const summary = `${result.done} saved, ${result.skipped} skipped, ${result.errors} errors`;
      showToast(summary, result.errors ? "error" : "success");
      resetSelection();
    } finally { setLoading(false); }
  };

  /* ------------------ Auto-cutoff ------------------ */
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const dayKey = now.toISOString().split("T")[0];
      if (autoCloseRef.current === dayKey) return;
      const pastCutoff = now.getHours() > CUTOFF_HOUR || (now.getHours() === CUTOFF_HOUR && now.getMinutes() >= CUTOFF_MINUTE);
      if (pastCutoff) {
        const forcedIso = new Date(now.setHours(CUTOFF_HOUR, CUTOFF_MINUTE, 0, 0)).toISOString();
        (async () => {
          await signOutWorkers([...openWorkerIds], forcedIso);
          await signOutStudents([...openStudentIds], forcedIso);
        })();
        autoCloseRef.current = dayKey;
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [openWorkerIds, openStudentIds]);

  /* ------------------ UI LIST RENDER ------------------ */
  const renderList = (items, type) => {
    const openSet = type === ENTITY.worker ? optimisticWorkerOpen : optimisticStudentOpen;
    const flashSet = type === ENTITY.worker ? flash.workers : flash.students;
    return (
      <div style={{ maxHeight: 520, overflowY: "auto" }}>
        {items.length ? items.map((item) => {
          const selected = selectedIds.includes(item.id) && entityType === type;
          const open = openSet.has(item.id);
          const flashItem = flashSet.has(item.id);
          return (
            <div key={`${type}-${item.id}`} style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8, display: "flex", alignItems: "center", gap: 12, background: flashItem ? "#ecfdf3" : selected ? "#eef2ff" : "#fff" }}>
              <input type="checkbox" checked={selected} onChange={() => {
                setSelectedIds(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id]);
                setEntityType(type);
              }} />
              <div style={{ width: 48, height: 48, borderRadius: 6, overflow: "hidden", position: "relative" }}>
                <Photos bucketName={type === ENTITY.worker ? "worker-uploads" : "student-uploads"} folderName={type === ENTITY.worker ? "workers" : "students"} id={item.id} photoCount={1} restrictToProfileFolder={true} />
                <span title={open ? "Signed in" : "Signed out"} style={{ position: "absolute", right: -2, bottom: -2, width: 10, height: 10, borderRadius: "50%", background: open ? "#10b981" : "#ef4444", border: "2px solid #fff" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{type === ENTITY.worker ? `${item.name} ${item.last_name || ""}` : item.full_name}<span style={{ marginLeft: 8, fontSize: 12, color: open ? "#10b981" : "#ef4444" }}>{open ? "• In" : "• Out"}</span></div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{type === ENTITY.worker ? `School: ${item.school_name || "n/a"}` : `Grade: ${item.grade || "n/a"}`}</div>
              </div>
              <button onClick={() => handleBiometricStart(item, type)}>Face verify</button>
            </div>
          );
        }) : <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No {type === ENTITY.worker ? "workers" : "students"} available</div>}
      </div>
    );
  };

  /* ------------------ ACTION BAR ------------------ */
  const actionBar = (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
      {[ENTITY.worker, ENTITY.student].map((type) => (
        <button key={type} onClick={() => { setEntityType(type); resetSelection(true); }} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: entityType === type ? "#111827" : "#fff", color: entityType === type ? "#fff" : "#111827", cursor: "pointer" }}>{type === ENTITY.worker ? "Workers" : "Students"}</button>
      ))}
      <button disabled={!selectedIds.length || loading} onClick={() => handleBulk("in")}>Sign in selected ({selectedIds.length})</button>
      <button disabled={!selectedIds.length || loading} onClick={() => handleBulk("out")}>Sign out selected ({selectedIds.length})</button>
      <button disabled={!selectedIds.length || loading} onClick={() => resetSelection(true)}>Clear</button>
      {biometricVerifiedId && <span style={{ color: "#16a34a" }}>Biometric verified for ID {biometricVerifiedId}</span>}
    </div>
  );

  /* ------------------ MAIN RENDER ------------------ */
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 24 }}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div style={{ maxWidth: 1300, margin: "0 auto" }}>
        <h2>Clock In / Clock Out</h2>
        <p>Select one mode at a time. Bulk sign in/out all selected entries.</p>
        {actionBar}
        <FiltersPanel user={user} schools={schools || []} filters={filters} setFilters={setFilters} resource={entityType === ENTITY.student ? "students" : "workers"} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <div>
            <h3>Workers</h3>
            {renderList(filteredWorkers, ENTITY.worker)}
          </div>
          <div>
            <h3>Students</h3>
            {renderList(filteredStudents, ENTITY.student)}
          </div>
        </div>
        {biometricTarget && (
          <Biometrics
            profile={biometricTarget}
            entityType={biometricEntityType}
            onSuccess={handleBiometricSuccess}
      tBiometricTarg