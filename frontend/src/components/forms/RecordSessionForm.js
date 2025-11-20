import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/client";
import SelectableList from "../widgets/SelectableList";
import FiltersPanel from "../filters/FiltersPanel";
import { useFilters } from "../../context/FiltersContext";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import useOfflineTable from "../../hooks/useOfflineTable";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import { getTableFiltered, getTable } from "../../utils/tableCache";
import BiometricsSignIn from "../forms/BiometricsSignIn";
import LearnerAttendance from "../profiles/LearnerAttendance";
import ToastContainer from "../ToastContainer";

/**
 * RecordSessionForm
 * - Reusable form to distribute sessions and record attendance
 * - Uses offline-aware hooks and supports local session search, date and category filters
 *
 * Props:
 * - sessionType: 'academic' | 'pe' (default 'academic')
 * - initialSessionId: optional id to pre-select
 * - onCompleted: callback when distribution finished
 */
export default function RecordSessionForm({ sessionType = 'academic', initialSessionId = null, onCompleted = () => {} }) {
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();

  // Always source sessions from academic_sessions per requirements
  const sessionsTable = "academic_sessions";
  const participantsTable = sessionType === "pe" ? "pe_session_participants" : "academic_session_participants";

  // Offline-aware tables
  const { rows: students = [], loading: loadingStudents } = useOfflineTable("students");
  const {
    rows: participants = [],
    loading: loadingParticipants,
    addRow: addParticipant,
    deleteRow: deleteParticipant,
    updateRow: updateParticipant,
  } = useOfflineTable(participantsTable, {});

  const { rows: sessionRows = [], loading: loadingSessions } = useOfflineTable(sessionsTable);

  // Filters context (used to filter students for distribution)
  const { filters, setFilters } = useFilters();
  const [offlineStudents, setOfflineStudents] = useState([]);
  const { user } = useAuth();
  const { schools } = useSchools();
  const role = user?.profile?.roles.name;

  const gradeOptions = [
    "R1", "R2", "R3",
    ...Array.from({ length: 7 }, (_, i) => {
      const grade = i + 1;
      return ["A", "B", "C", "D"].map(section => `${grade}${section}`);
    }).flat()
  ];

  const [selectedSession, setSelectedSession] = useState(initialSessionId || "");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [working, setWorking] = useState(false);
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [stopRecordingRequest, setStopRecordingRequest] = useState(0);
  const [stopRecordingCancelRequest, setStopRecordingCancelRequest] = useState(0);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  // always show all sessions by default in this view
  const [lastActionResult, setLastActionResult] = useState(null);
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = "success", duration = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const t = { id, message, type, duration };
    setToasts((s) => [...s, t]);
    // schedule removal
    try {
      setTimeout(() => setToasts((s) => s.filter(x => x.id !== id)), duration);
    } catch (e) {
      // ignore environment where timers may not be available
    }
    return id;
  };

  const removeToast = (id) => setToasts((s) => s.filter((t) => t.id !== id));

  // simple map for quick lookups
  const studentById = useMemo(() => Object.fromEntries((students || []).map(s => [String(s.id), s])), [students]);

  // participants indexed by student id for the selected session
  const participantsForSelected = useMemo(() => {
    if (!selectedSession) return [];
    return (participants || []).filter(p => String(p.session_id) === String(selectedSession));
  }, [participants, selectedSession]);

  // Available students to select: optionally exclude already participating students
  // (availableStudents replaced by filteredStudents which also applies filters)

  // Preselect all available students when a session is chosen (useful for distribution flows)
  useEffect(() => {
    setSelectedStudentIds([]);
    if (selectedSession) {
      // default: none selected to avoid accidental mass operations; keep this configurable later
      setSelectedStudentIds([]);
    }
  }, [selectedSession]);

  // Load cached session participants quickly (best-effort extra fetch)
  useEffect(() => {
    let mounted = true;
    async function preload() {
      if (!selectedSession) return;
      try {
        // try tableCache fast lookup (falls back to in-memory)
        const cached = await getTableFiltered(participantsTable, { session_id: selectedSession }, { limit: 500 });
        if (!mounted) return;
        if (Array.isArray(cached) && cached.length) {
          // sync into local participants state via useOfflineTable's background updates — here we only use it for speed
          // no direct setRows available, so we keep it as an informative fast-path
        }
      } catch (err) {
        // ignore — background hook will fetch
        console.debug("RecordSessionForm: quick preload failed", err?.message || err);
      }
    }
    preload();
    return () => { mounted = false; };
  }, [selectedSession]);

  // Load cached students when offline (fallback)
  useEffect(() => {
    let mounted = true;
    async function loadCached() {
      if (!isOnline) {
        try {
          const cached = await getTable("students");
          if (mounted) setOfflineStudents(cached || []);
        } catch (err) {
          console.warn("RecordSessionForm: failed to load cached students", err);
        }
      }
    }
    loadCached();
    return () => { mounted = false; };
  }, [isOnline]);

  const allStudents = (Array.isArray(students) && students.length > 0) ? students : offlineStudents;

  // Helper: normalize category-like values from various shapes (string, array, json-string, nested fields)
  const normalizeCats = (raw) => {
    if (!raw && raw !== 0) return [];
    try {
      // If already array — support arrays of primitives or option objects
      if (Array.isArray(raw)) {
        return raw
          .flatMap(r => {
            if (r === null || r === undefined) return [];
            // primitive (string/number/boolean)
            if (typeof r === 'string' || typeof r === 'number' || typeof r === 'boolean') {
              return String(r).split(/[,;|\s]+/).map(s => s.toLowerCase().trim());
            }
            // object: try common keys used by filters/options
            if (typeof r === 'object') {
              const candidate = r.value ?? r.id ?? r.key ?? r.name ?? r.label ?? r.category ?? r;
              if (candidate === null || candidate === undefined) return [];
              if (typeof candidate === 'string' || typeof candidate === 'number' || typeof candidate === 'boolean') {
                return String(candidate).split(/[,;|\s]+/).map(s => s.toLowerCase().trim());
              }
              // nested structure (array/object) — recurse
              return normalizeCats(candidate);
            }
            return [];
          })
          .map(String)
          .map(s => s.toLowerCase().trim())
          .filter(Boolean);
      }
      // If object with fields (e.g., form schema data)
      if (typeof raw === 'object') {
        // look for common keys
        if (raw.category) return normalizeCats(raw.category);
        if (raw.fields && Array.isArray(raw.fields)) {
          // fields may be array of { name, value } or { name, type }
          const found = raw.fields.find(f => String(f.name).toLowerCase() === 'category');
          if (found) return normalizeCats(found.value || found.default || found.options || found);
        }
        return [];
      }
      // If string, try to parse JSON
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        // quick check for JSON
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            const obj = JSON.parse(trimmed);
            return normalizeCats(obj);
          } catch (e) {
            // not JSON, fallthrough
          }
        }
        // split common delimiters and strip punctuation
        const cleaned = trimmed.replace(/[()\[\]]/g, '');
        return cleaned.split(/[,;|\s]+/).map(s => s.toLowerCase().trim()).filter(Boolean);
      }
    } catch (err) {
      return [];
    }
    return [];
  };

  // optional date filter (ISO date string yyyy-mm-dd) and revision flag: stored in global filters
  // keep small local mirrors for controlled inputs, initialize from global filters
  const [filterDate, setFilterDate] = useState(filters?.session_date || null);
  const [revisionMode, setRevisionMode] = useState(!!filters?.revision);

  // update global filters when local date/revision change
  useEffect(() => {
    // sync session_date into global filters
    if (filterDate) {
      setFilters((f) => ({ ...(f || {}), session_date: filterDate }));
    } else {
      setFilters((f) => {
        const copy = { ...(f || {}) };
        delete copy.session_date;
        return copy;
      });
    }
  }, [filterDate]);

  useEffect(() => {
    if (revisionMode) setFilters((f) => ({ ...(f || {}), revision: true }));
    else setFilters((f) => { const copy = { ...(f || {}) }; delete copy.revision; return copy; });
  }, [revisionMode]);

  // Compute displayed sessions based on academic_sessions source and the shared `filters`
  const displayedSessions = useMemo(() => {
    const rows = Array.isArray(sessionRows) ? sessionRows.slice() : [];

    const sessionDateStr = (s) => {
      if (!s) return null;
      const d = s.date || s.session_date || s.start_date || s.created_at || null;
      if (!d) return null;
      try {
        if (/^\d{4}-\d{2}-\d{2}/.test(String(d))) return String(d).slice(0,10);
        const dt = new Date(d);
        if (isNaN(dt)) return null;
        return dt.toISOString().slice(0,10);
      } catch (e) { return null; }
    };

    const wantedCats = normalizeCats(filters?.category || []);

    let filtered = rows.filter(s => {
      if (wantedCats.length) {
        const sCats = normalizeCats(s.category || s.categories || s.tag || s.tags || []);
        if (!wantedCats.some(c => sCats.includes(c))) return false;
      }

      const sd = sessionDateStr(s);
      if (filters?.session_date) {
        if (!sd) return false;
        if (sd !== String(filters.session_date)) return false;
      }

      if (!filters?.revision && sd) {
        const today = new Date(); today.setHours(0,0,0,0);
        const sD = new Date(sd); sD.setHours(0,0,0,0);
        if (sD < today) return false;
      }

      return true;
    });

    filtered.sort((a,b) => {
      const da = sessionDateStr(a) || '';
      const db = sessionDateStr(b) || '';
      if (da < db) return -1;
      if (da > db) return 1;
      return 0;
    });

    return filtered;
  }, [sessionRows, filters]);

  // Filter students simultaneously using same category/grade filters (global filters)
  const filteredStudents = useMemo(() => {
    const list = Array.isArray(allStudents) ? allStudents.slice() : [];
    const wantedCats = normalizeCats(filters?.category || []);
    const wantedGrades = Array.isArray(filters?.grade) ? filters.grade.map(String) : (filters?.grade ? [String(filters.grade)] : []);

    return list.filter(st => {
      if (wantedCats.length) {
        const sCats = normalizeCats(st.category || st.categories || st.tags || st.group || []);
        if (!wantedCats.some(c => sCats.includes(c))) return false;
      }
      if (wantedGrades.length) {
        const g = st.grade || st.class || st.level || '';
        if (!wantedGrades.includes(String(g))) return false;
      }
      return true;
    });
  }, [allStudents, filters]);

  // helper: add selected students to session (bulk, offline-aware)
  const handleAddSelected = useCallback(async () => {
    if (!selectedSession) return setLastActionResult({ error: "Select a session first" });
    if (!selectedStudentIds || !selectedStudentIds.length) return setLastActionResult({ error: "No students selected" });

    setWorking(true);
    const now = new Date().toISOString();
    const added = [];
    const errors = [];

    // Measure per-student add duration and create an attendance record + participant entry
    for (const sId of selectedStudentIds) {
      try {
        const nowIso = new Date().toISOString();

        // 1) create attendance record (offline-aware)
        const attendancePayload = {
          student_id: Number(sId),
          school_id: studentById[String(sId)]?.school_id || null,
          date: nowIso.slice(0,10),
          status: 'present',
          note: 'manual session add',
          created_at: nowIso,
        };
        console.log('[RecordSessionForm] addAttendanceRow payload', attendancePayload);
        let attendanceRes = null;
        try {
          attendanceRes = await addAttendanceRow(attendancePayload);
          console.log('[RecordSessionForm] addAttendanceRow result', attendanceRes);
        } catch (aerr) {
          console.warn('[RecordSessionForm] addAttendanceRow failed', aerr);
          attendanceRes = { __error: aerr };
        }

        // 2) add participant row to session (offline-aware)
        const participantPayload = {
          session_id: selectedSession,
          student_id: Number(sId),
          school_id: studentById[String(sId)]?.school_id || null,
        };
        console.log('[RecordSessionForm] addParticipant payload', participantPayload);
        const startMs = Date.now();
        let partRes = null;
        try {
          partRes = await addParticipant(participantPayload);
        } catch (perr) {
          console.warn('[RecordSessionForm] addParticipant failed', perr);
          partRes = { __error: perr };
        }
        const elapsedMs = Date.now() - startMs;
        console.log('[RecordSessionForm] addParticipant result', partRes, 'elapsedMs', elapsedMs);

        // record timing and both results for reporting
        added.push({ studentId: sId, attendanceRes, participantRes: partRes, elapsedMs });

        // collect errors if any
        if ((attendanceRes && attendanceRes.__error) || (partRes && partRes.__error)) {
          errors.push({ studentId: sId, attendanceError: attendanceRes && attendanceRes.__error, participantError: partRes && partRes.__error });
        }
      } catch (err) {
        errors.push({ studentId: sId, error: err });
      }
    }

    setWorking(false);
    // compute timing summary (elapsedMs) if available
    const timings = (added || []).map(a => a && a.elapsedMs).filter(n => typeof n === 'number');
    const avgElapsedMs = timings.length ? Math.round(timings.reduce((s, n) => s + n, 0) / timings.length) : null;
    setLastActionResult({ added, errors, avgElapsedMs });
    if (errors.length) {
      addToast(`Added ${added.length} but ${errors.length} failed${avgElapsedMs ? ` (avg ${avgElapsedMs} ms)` : ''}`, "warning");
    } else {
      addToast(`Added ${added.length} students to session${avgElapsedMs ? ` (avg ${avgElapsedMs} ms)` : ''}`, "success");
    }
    onCompleted({ sessionId: selectedSession, added, removed: [] });
  }, [selectedStudentIds, selectedSession, addParticipant, onCompleted, studentById]);

  // helper: remove selected students from session
  const handleRemoveSelected = useCallback(async () => {
    if (!selectedSession) return setLastActionResult({ error: "Select a session first" });
    if (!selectedStudentIds || !selectedStudentIds.length) return setLastActionResult({ error: "No students selected" });

    setWorking(true);
    const removed = [];
    const errors = [];

    // find participant rows matching selection
    const mapByStudent = Object.fromEntries((participantsForSelected || []).map(p => [String(p.student_id), p]));

    for (const sId of selectedStudentIds) {
      const row = mapByStudent[String(sId)];
      try {
        if (row && row.id) {
          await deleteParticipant(row.id);
          removed.push({ studentId: sId, rowId: row.id });
        } else {
          // nothing to delete — skip
          removed.push({ studentId: sId, rowId: null });
        }
      } catch (err) {
        errors.push({ studentId: sId, error: err });
      }
    }

    setWorking(false);
    setLastActionResult({ removed, errors });
    if (errors.length) {
      addToast(`Removed ${removed.length - errors.length} but ${errors.length} failed`, "warning");
    } else {
      addToast(`Removed ${removed.length} students from session`, "success");
    }
    onCompleted({ sessionId: selectedSession, added: [], removed });
  }, [selectedStudentIds, selectedSession, participantsForSelected, deleteParticipant, onCompleted]);

  // Record attendance entries using attendance_records table (offline-aware)
  const { addRow: addAttendanceRow } = useOfflineTable("attendance_records");

  const handleBiometricsCompleted = useCallback(async (attendanceData) => {
    // attendanceData expected to contain { studentId, type: 'signin'|'signout', timestamp, note }
    try {
      if (!attendanceData) return;
      // If biometric component called onCompleted with a simple id (to signal it's done),
      // hide the biometric UI and return early.
      if (typeof attendanceData === 'string' || typeof attendanceData === 'number') {
        setShowBiometrics(false);
        return;
      }
      const rows = Array.isArray(attendanceData) ? attendanceData : [attendanceData];
      // Build a quick lookup of selected student ids (if any). If there are selected
      // students, we will only record attendance for recognized faces that match
      // one of the selected students. This prevents accidental recording when the
      // operator selected a student but the biometric capture identified someone else.
      const selectedSet = new Set((selectedStudentIds || []).map(String));
      const results = [];
      for (const r of rows) {
        // If the operator had selected specific student(s) to record, ensure the
        // recognized student matches one of those selections. If it does not,
        // skip recording and surface a warning.
        if (selectedSet.size > 0) {
          const detectedId = r.studentId ? String(r.studentId) : null;
          if (!detectedId || !selectedSet.has(detectedId)) {
            console.warn('[RecordSessionForm] biometric-recognition mismatch: detected', detectedId, 'but selected', Array.from(selectedSet));
            addToast(`Recognition mismatch: detected ${detectedId || 'unknown'} does not match selected student(s). Skipping.`, 'warning', 6000);
            results.push({ skipped: true, reason: 'mismatch', detected: detectedId, expected: Array.from(selectedSet) });
            continue; // skip this row
          }
        }
        // If the biometric component already includes an attendance result, don't write a duplicate row.
        if (r.attendance) {
          console.log('[RecordSessionForm] received attendance from biometric payload, skipping addAttendanceRow:', r.attendance);
          results.push(r.attendance);
        } else {
          const payload = {
            student_id: r.studentId,
            school_id: studentById[String(r.studentId)]?.school_id || null,
            date: r.timestamp?.slice(0,10) || new Date().toISOString().slice(0,10),
            status: r.type === 'signout' ? 'present' : 'present',
            note: r.note || `biometric ${r.type}`,
            created_at: r.timestamp || new Date().toISOString(),
          };
          console.log('[RecordSessionForm] handleBiometricsCompleted payload:', payload);
          const res = await addAttendanceRow(payload);
          console.log('[RecordSessionForm] addAttendanceRow result:', res);
          results.push(res);
        }
        // If a session is selected, also assign this student to the session participants table
        try {
          if (selectedSession) {
            const partPayload = {
              session_id: selectedSession,
              student_id: Number(r.studentId),
              school_id: studentById[String(r.studentId)]?.school_id || null,
            };
            console.log('[RecordSessionForm] adding participant to table:', participantsTable, 'payload:', partPayload);
            const partRes = await addParticipant(partPayload);
            console.log('[RecordSessionForm] addParticipant result:', partRes);
          }
        } catch (err) {
          console.warn('[RecordSessionForm] failed to add participant for biometrics completion', err);
        }
      }
      setLastActionResult({ attendanceRecorded: results });
      addToast(`Recorded ${results.length} attendance entries`, "success");
  // hide biometric UI after recording attendance
  setShowBiometrics(false);
      return results;
    } catch (err) {
      console.error("Failed to record attendance from biometrics", err);
      setLastActionResult({ error: err });
      return null;
    }
  }, [addAttendanceRow, studentById, selectedStudentIds, addToast, addParticipant, participantsTable, selectedSession]);

  // Called when the biometric component begins continuous recording
  const handleRecordingStart = useCallback(() => {
    setRecordingActive(true);
    addToast('Session recording started. You can now close the biometric modal and add more students.', 'info', 5000);
  }, [addToast]);

  // Called when biometric component reports recording stopped
  const handleRecordingStop = useCallback(async ({ start, end, participants, academicSessionId, canceled } = {}) => {
    console.log('[RecordSessionForm] handleRecordingStop called', { start, end, participants, academicSessionId, canceled });
    if (canceled) {
      addToast('Session canceled — recorded attendance was discarded.', 'info');
      // ensure local UI state is consistent
      setRecordingActive(false);
      setLastActionResult({ canceled: true });
      return;
    }
    setRecordingActive(false);
    const startDate = start ? start.split('T')[0] : null;
    const endDate = end ? end.split('T')[0] : null;
    const results = { updatedParticipants: [], updatedAttendance: [], errors: [] };

    for (const p of participants || []) {
      try {
        console.log('[RecordSessionForm] processing participant', p);
        // update academic_session_participants sign_out_time for this session/student
        if (selectedSession) {
          try {
                // ensure participant exists in participantsTable (insert if missing)
                const mapByStudent = Object.fromEntries((participantsForSelected || []).map(pp => [String(pp.student_id), pp]));
                if (!mapByStudent[String(p.student_id)]) {
                  const payload = { session_id: selectedSession, student_id: Number(p.student_id), school_id: studentById[String(p.student_id)]?.school_id || null };
                  console.log('[RecordSessionForm] addParticipant (auto from recordingStop) payload:', payload);
                  try {
                    const addRes = await addParticipant(payload);
                    console.log('[RecordSessionForm] addParticipant result:', addRes);
                  } catch (addErr) {
                    console.error('[RecordSessionForm] addParticipant failed', addErr);
                    results.errors.push({ type: 'participant_insert', student_id: p.student_id, error: addErr?.message || String(addErr) });
                  }
                }

                // Update sign_out_time for the participant row in the participants table (best-effort)
                console.log('[RecordSessionForm] updating participant sign_out_time via API', { session: selectedSession, student: p.student_id, end });
                await api.from(participantsTable)
                  .update({ sign_out_time: end })
                  .match({ session_id: selectedSession, student_id: Number(p.student_id) });
            results.updatedParticipants.push(p.student_id);
          } catch (e) {
            results.errors.push({ type: 'participant_update', student_id: p.student_id, error: e?.message || String(e) });
          }
        }

        // try to update attendance_records: find an open record for the same date and student
        try {
          const dateToMatch = startDate || (new Date()).toISOString().split('T')[0];
          const { data: openRows, error: openErr } = await api
            .from('attendance_records')
            .select('id, sign_out_time')
            .eq('student_id', Number(p.student_id))
            .eq('date', dateToMatch)
            .order('id', { ascending: false });

          if (!openErr && Array.isArray(openRows) && openRows.length) {
            const open = openRows.find(r => !r.sign_out_time) || openRows[0];
            if (open && !open.sign_out_time) {
              // compute hours
              try {
                const hours = start && end ? ((new Date(end) - new Date(start)) / (1000 * 60 * 60)).toFixed(2) : null;
                console.log('[RecordSessionForm] updating attendance_records sign_out_time for', { attendanceId: open.id, end, hours });
                await api.from('attendance_records').update({ sign_out_time: end, hours: hours ? Number(hours) : undefined }).eq('id', open.id);
                results.updatedAttendance.push({ student_id: p.student_id, attendance_id: open.id });
              } catch (uerr) {
                console.error('[RecordSessionForm] attendance update failed', uerr);
                results.errors.push({ type: 'attendance_update', student_id: p.student_id, error: uerr?.message || String(uerr) });
              }
            }
          }
        } catch (attErr) {
          console.error('[RecordSessionForm] attendance query failed', attErr);
          results.errors.push({ type: 'attendance_query', student_id: p.student_id, error: attErr?.message || String(attErr) });
        }
      } catch (err) {
        results.errors.push({ type: 'unknown', student_id: p.student_id, error: err?.message || String(err) });
      }
    }

    setLastActionResult(results);
    if ((results.errors || []).length) addToast(`Recording ended with ${results.errors.length} errors`, 'warning');
    else addToast(`Recording ended. Updated ${results.updatedParticipants.length} participants.`, 'success');
  }, [selectedSession]);

  const openLearnerCalendar = (studentId) => {
    // Navigate to learner attendance page (existing route used by LearnerAttendance uses /students/:id/attendance maybe)
    // Fallback: open profile page
    navigate(`/dashboard/students/${studentId}/attendance`);
  };

  // always show all sessions (no session filter toggle in this view)
  const effectiveSessionRows = (sessionRows || []);
 
 
  return (
    <div className="max-w-4xl mx-auto p-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => window.history.back()} className="btn secondary-btn btn-secondary">
              <span className="text-sm">Back</span>
            </button>
            <div>
              <h2 className="text-lg font-semibold">Record {sessionType === 'pe' ? 'PE' : 'Academic'} Session</h2>
              <div className="text-xs text-gray-500">Manage participants & attendance</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link to={`/dashboard/sessions/create`} className="btn primary-btn">
              <span className="text-sm primary-btn">Create Session</span>
            </Link>
          </div>
        </div>

        <div className="px-6 py-5 border-t bg-gray-50 dark:bg-gray-900">
          {!selectedSession && (
            <div className="page-filters mb-4">
              <FiltersPanel
                user={user}
                schools={schools}
                filters={filters}
                setFilters={setFilters}
                resource="students"
                gradeOptions={gradeOptions}
                sessionTypeOptions={role === "superuser" || role === "admin" ? ["academic_sessions", "pe_sessions"] : []}
                showDeletedOption={["admin", "hr", "superviser"].includes(role)}
              />

              {/* Optional date filter + revision toggle (kept local but synced to global filters) */}
              <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div>
                  <label className="text-sm font-medium">Filter by date</label>
                  <div>
                    <input type="date" value={filterDate || ''} onChange={(e) => setFilterDate(e.target.value || null)} className="p-2 border rounded" />
                    <button onClick={() => setFilterDate(null)} className="ml-2 px-2 py-1 border rounded secondary-btn">Clear</button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={revisionMode} onChange={(e) => setRevisionMode(e.target.checked)} />
                    <span className="text-sm">Revision (include past sessions)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-6 record-session-flex">
            <div className="w-full md:w-1/2 record-session-col">
              <label className="block text-sm font-medium text-gray-700">Select session</label>
              <div className="text-xs text-gray-500 mb-2">Showing {displayedSessions.length} of {(sessionRows || []).length} sessions</div>

              

              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="block w-full p-3 border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              >
                <option value="">-- choose session --</option>
                {displayedSessions.map(s => (
                  <option key={s.id} value={s.id}>{s.session_name || s.name} {s.category ? `(${Array.isArray(s.category) ? s.category.join(',') : s.category})` : ''} {s.date ? `(${s.date.slice(0,10)})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col items-center justify-center w-full md:w-1/2 record-session-col">
              <label className="block text-sm font-medium text-gray-700">Select students to add/remove</label>
              <div className="mt-2 w-full">
                <SelectableList
                  students={filteredStudents}
                  resource="students"
                  checkbox={true}
                  value={selectedStudentIds}
                  onChange={setSelectedStudentIds}
                />
              </div>
            </div>
          </div>



          <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <button className="btn primary-btn inline-flex items-center gap-2" onClick={handleAddSelected} disabled={working || !selectedSession || !selectedStudentIds.length}>
                <span>{working ? 'Working...' : 'Add Selected'}</span>
              </button>
              <button className="btn secondary-btn inline-flex items-center gap-2" onClick={handleRemoveSelected} disabled={working || !selectedSession || !selectedStudentIds.length}>
                <span>{working ? 'Working...' : 'Remove Selected'}</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button className="btn inline-flex items-center gap-2" disabled={true} title="Biometrics suspended for now">
                <span className="text-sm">Biometrics (suspended)</span>
              </button>
              {/* debug buttons removed */}
              {recordingActive && (
                <>
                  <button
                    className="btn danger inline-flex items-center gap-2"
                    onClick={() => setShowEndSessionConfirm(true)}
                  >
                    End Session
                  </button>

                  {/* End Session confirmation modal */}
                  {showEndSessionConfirm && (
                    <>
                      <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                        style={{ zIndex: 1600 }}
                        onClick={() => setShowEndSessionConfirm(false)}
                        aria-hidden
                      />
                      <div className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-lg px-4" style={{ zIndex: 1601 }}>
                        <div className="bg-white dark:bg-gray-800 rounded-md shadow-2xl p-4 border-2 border-red-500">
                          <div className="flex justify-between items-start">
                            <h3 className="text-lg font-medium">End Session</h3>
                            <button aria-label="Close" className="text-gray-500" onClick={() => setShowEndSessionConfirm(false)}>✕</button>
                          </div>
                          <p className="mt-2 text-sm text-gray-600">Do you want to cancel this session (discard recorded attendance) or complete it (finalize attendance and participants)?</p>

                          <div className="mt-4 flex gap-2 justify-end">
                            <button
                              className="btn inline-flex items-center gap-2"
                              onClick={() => {
                                // Cancel session: stop recording without committing attendance/participants
                                setShowEndSessionConfirm(false);
                                // signal cancel stop to BiometicsSignIn via separate counter
                                setStopRecordingCancelRequest((c) => c + 1);
                                // also mark recordingInactive locally
                                setRecordingActive(false);
                              }}
                            >
                              Cancel Session
                            </button>

                            <button
                              className="btn danger inline-flex items-center gap-2"
                              onClick={() => {
                                // Complete session: proceed with normal stop which commits attendance
                                setShowEndSessionConfirm(false);
                                setStopRecordingRequest((c) => c + 1);
                                setRecordingActive(false);
                              }}
                            >
                              Complete Session
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {showBiometrics && (
            <div className="mt-4 border rounded p-4 bg-white">
              <BiometricsSignIn
                entityType="student"
                // If user selected students, pass those IDs; otherwise fall back to the first filtered student
                studentId={selectedStudentIds && selectedStudentIds.length ? selectedStudentIds : (filteredStudents[0]?.id ? [filteredStudents[0].id] : null)}
                schoolId={filteredStudents[0]?.school_id || null}
                sessionType={participantsTable}
                academicSessionId={selectedSession}
                bucketName="student-uploads"
                folderName="faces"
                onCompleted={(data) => handleBiometricsCompleted(data)}
                // Customize labels for recording flows
                primaryRecordStartLabel={recordingActive ? 'Recording…' : 'Record Session'}
                primaryRecordEndLabel={'End Session'}
                // Keep biometric UI mounted while recording so continuous processing continues
                closeOnStart={false}
                onRecordingStart={handleRecordingStart}
                onRecordingStop={handleRecordingStop}
                stopRecordingRequest={stopRecordingRequest}
                stopRecordingCancelRequest={stopRecordingCancelRequest}
              />
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-lg font-medium">Existing participants <span className="text-sm text-gray-500">({participantsForSelected.length})</span></h3>
            <div className="grid gap-3 mt-3">
              {participantsForSelected.slice(0, 200).map(p => (
                <div key={p.id || `${p.session_id}-${p.student_id}`} className="p-3 bg-white border rounded-md flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-semibold">{(studentById[String(p.student_id)]?.full_name || '#').split(' ').map(n=>n[0]).slice(0,2).join('')}</div>
                    <div>
                      <div className="font-medium">{studentById[String(p.student_id)]?.full_name || `#${p.student_id}`}</div>
                      <div className="text-sm text-gray-500">Added: {(() => {
                        const addedAt = p.added_at || p.created_at || p.createdAt || p.inserted_at || p.addedAt;
                        return addedAt ? String(addedAt).slice(0,19).replace('T',' ') : '—';
                      })()}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-2 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200" onClick={() => openLearnerCalendar(p.student_id)}>Attendance</button>
                    <button className="px-2 py-1 text-sm rounded bg-red-50 text-red-600 hover:bg-red-100" onClick={async () => {
                      try {
                        if (p.id) await deleteParticipant(p.id);
                      } catch (err) { console.error(err); }
                    }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

            {/* queued mutations panel removed */}

            {lastActionResult && (
              <pre className="mt-4 text-sm bg-gray-100 p-2 rounded">{JSON.stringify(lastActionResult, null, 2)}</pre>
            )}
        </div>
      </div>
    </div>
  );
}
