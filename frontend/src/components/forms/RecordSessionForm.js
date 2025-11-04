import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/client";
import EntityMultiSelect from "../../hooks/EntityMultiSelect";
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

  const sessionsTable = sessionType === "pe" ? "pe_sessions" : "academic_sessions";
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

  // Filter sessions using the same FiltersPanel filters so selecting a category/group limits sessions too
  // Precompute desired category tokens from filters for clearer debugging
  // StudentFilters sets `filters.category` to an array of strings like ['ww','pr']
  // Normalize that explicitly here to a canonical array of lowercase tokens.
  const desiredSessionCats = (Array.isArray(filters?.category) ? filters.category : [])
    .flatMap(c => {
      if (c === null || c === undefined) return [];
      if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
        return String(c).toLowerCase().trim().split(/[,;|\s]+/).filter(Boolean);
      }
      // support option objects { value } passed in some places
      if (typeof c === 'object') {
        const v = c.value ?? c.id ?? c.name ?? c.label ?? null;
        if (v === null || v === undefined) return [];
        return String(v).toLowerCase().trim().split(/[,;|\s]+/).filter(Boolean);
      }
      return [];
    });
  // (debug logs removed)

  // determine selected session and its category (if any)
  const currentSession = selectedSession ? sessionRows.find(sr => String(sr.id) === String(selectedSession)) : null;
  const sessionCategory = currentSession?.category;

  // No local session filters here — always show all sessions for selection
  const displayedSessions = useMemo(() => (effectiveSessionRows || []), [effectiveSessionRows]);

  // no per-session filter report (filters removed)

  const filteredStudents = allStudents.filter((s) => {
    if (!s) return false;
    // sessionType specific filter: PE sessions only students flagged for PE
    if (sessionType === "pe" && !s.physical_education) return false;

    // school filter
    if (filters?.school_id && filters.school_id.length) {
      const schoolFilter = filters.school_id;
      const val = Array.isArray(schoolFilter) ? schoolFilter.map(String) : [String(schoolFilter)];
      if (!val.includes(String(s.school_id))) return false;
    }

    // grade filter
    if (filters?.grade && filters.grade.length) {
      const g = filters.grade;
      const vals = Array.isArray(g) ? g : [g];
      if (!vals.includes(String(s.grade))) return false;
    }

    // category filter (generic) - compare against desiredSessionCats (derived from StudentFilters)
    if (desiredSessionCats.length) {
      const studentCats = normalizeCats(s.category || s.fields || s.meta || s);
      if (!studentCats.some(sc => desiredSessionCats.includes(sc))) return false;
    }

    // If the selected session has a category, only include students whose category intersects
    if (sessionCategory) {
      const sessionCats = normalizeCats(sessionCategory || currentSession?.fields || currentSession);
      const studentCats = normalizeCats(s.category || s.fields || s.meta || s);
      const matches = studentCats.some(sc => sessionCats.includes(sc));
      if (!matches) return false;
    }

    // Exclude already participating students for the selected session
    if (selectedSession) {
      const participantIds = new Set(participantsForSelected.map(p => String(p.student_id)));
      if (participantIds.has(String(s.id))) return false;
    }

    return true;
  });

  // (debug logs removed)


  // sessionDebugMap removed (debugging) 

  const filteredSessionRows = (Array.isArray(sessionRows) ? sessionRows : []).filter((sr) => {
    if (!sr) return false;

    // school filter
    if (filters?.school_id && filters.school_id.length) {
      const schoolFilter = filters.school_id;
      const val = Array.isArray(schoolFilter) ? schoolFilter.map(String) : [String(schoolFilter)];
      if (!val.includes(String(sr.school_id))) return false;
    }

    // session_type filter coming from FiltersPanel (e.g. ['academic_sessions','pe_sessions','academic'])
    if (filters?.session_type && filters.session_type.length) {
      const raw = Array.isArray(filters.session_type) ? filters.session_type : [filters.session_type];
      const types = raw.map(t => String(t).toLowerCase().trim());
      const mapped = types.map(t => {
        // normalize common variants coming from StudentFilters / Filter options
        if (t.includes('acad') || t === 'academic' || t === 'academic_sessions' || t === 'academics') return 'academic_sessions';
        if (t.includes('pe') || t.includes('physical') || t === 'pe_sessions' || t === 'pe') return 'pe_sessions';
        return t;
      });
      if (!mapped.includes(sessionsTable)) return false;
    }

    // category filter: use normalizeCats to compare
    if (desiredSessionCats.length) {
      const rawCat = sr.category;
      // Fast path: direct string match
      let intersects = false;
      if (typeof rawCat === 'string') {
        const v = rawCat.toLowerCase().trim();
        intersects = desiredSessionCats.includes(v);
      }
      const sessionCats = normalizeCats(sr.category || sr.fields || sr);
      if (!intersects) intersects = sessionCats.some(sc => desiredSessionCats.includes(sc));
      if (!intersects) {
        // fallback: check session name for tokens like '(ww)' or ' ww'
        const name = String(sr.session_name || sr.name || '').toLowerCase();
        intersects = desiredSessionCats.some(c => {
          if (!c) return false;
          if (name.includes(`(${c})`)) return true;
          if (name.includes(` ${c}`)) return true;
          if (name.endsWith(` ${c}`)) return true;
          return false;
        });
      }
      if (!intersects) return false;
    }

    // grade filter: if session has a grade or grades field, ensure intersection
    if (filters?.grade && filters.grade.length) {
      const g = Array.isArray(filters.grade) ? filters.grade.map(String) : [String(filters.grade)];
      const sessionGrades = sr.grade ? (Array.isArray(sr.grade) ? sr.grade.map(String) : [String(sr.grade)]) : [];
      if (sessionGrades.length && !sessionGrades.some(sg => g.includes(sg))) return false;
    }

    return true;
  });

  // (debug logs removed)

  // (debug logs removed)

  // helper: add selected students to session (bulk, offline-aware)
  const handleAddSelected = useCallback(async () => {
    if (!selectedSession) return setLastActionResult({ error: "Select a session first" });
    if (!selectedStudentIds || !selectedStudentIds.length) return setLastActionResult({ error: "No students selected" });

    setWorking(true);
    const now = new Date().toISOString();
    const added = [];
    const errors = [];

    for (const sId of selectedStudentIds) {
      try {
        const payload = {
          session_id: selectedSession,
          student_id: sId,
          school_id: studentById[String(sId)]?.school_id || null,
          added_at: now,
        };
        const res = await addParticipant(payload);
        added.push({ studentId: sId, res });
      } catch (err) {
        errors.push({ studentId: sId, error: err });
      }
    }

    setWorking(false);
    setLastActionResult({ added, errors });
    if (errors.length) {
      addToast(`Added ${added.length} but ${errors.length} failed`, "warning");
    } else {
      addToast(`Added ${added.length} students to session`, "success");
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
      const rows = Array.isArray(attendanceData) ? attendanceData : [attendanceData];
      const results = [];
  for (const r of rows) {
        const payload = {
          student_id: r.studentId,
          school_id: studentById[String(r.studentId)]?.school_id || null,
          date: r.timestamp?.slice(0,10) || new Date().toISOString().slice(0,10),
          status: r.type === 'signout' ? 'present' : 'present',
          note: r.note || `biometric ${r.type}`,
          created_at: r.timestamp || new Date().toISOString(),
        };
        const res = await addAttendanceRow(payload);
        results.push(res);
      }
      setLastActionResult({ attendanceRecorded: results });
      addToast(`Recorded ${results.length} attendance entries`, "success");
      return results;
    } catch (err) {
      console.error("Failed to record attendance from biometrics", err);
      setLastActionResult({ error: err });
      return null;
    }
  }, [addAttendanceRow, studentById]);

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
            <button onClick={() => window.history.back()} className="inline-flex items-center gap-2 rounded-md px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 transition">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span className="text-sm">Back</span>
            </button>
            <div>
              <h2 className="text-lg font-semibold">Record {sessionType === 'pe' ? 'PE' : 'Academic'} Session</h2>
              <div className="text-xs text-gray-500">Manage participants & attendance</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link to={`/dashboard/sessions/create`} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white border hover:shadow-sm transition">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              <span className="text-sm">Create Session</span>
            </Link>
          </div>
        </div>

        <div className="px-6 py-5 border-t bg-gray-50 dark:bg-gray-900">
          {!selectedSession && (
            <div className="page-filters mb-4">
              <FiltersPanel
                user={user}
                schools={schools}
                filters={{ ...filters, session_type: sessionType ? [sessionType] : [] }}
                setFilters={setFilters}
                resource="students"
                gradeOptions={gradeOptions}
                sessionTypeOptions={role === "superuser" || role === "admin" ? ["academic_sessions", "pe_sessions"] : []}
                showDeletedOption={["admin", "hr", "superviser"].includes(role)}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
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

            <div className="flex flex-col items-center justify-center">
              <label className="block text-sm font-medium text-gray-700">Select students to add/remove</label>
              <div className="mt-2 w-full max-w-md">
                <EntityMultiSelect
                  label="Students"
                  options={filteredStudents}
                  value={selectedStudentIds}
                  onChange={setSelectedStudentIds}
                />
              </div>
            </div>
          </div>



          <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <button className="btn primary-btn inline-flex items-center gap-2" onClick={handleAddSelected} disabled={working || !selectedSession || !selectedStudentIds.length}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <span>{working ? 'Working...' : 'Add Selected'}</span>
              </button>
              <button className="btn secondary-btn inline-flex items-center gap-2" onClick={handleRemoveSelected} disabled={working || !selectedSession || !selectedStudentIds.length}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7L5 21M5 7l14 14" /></svg>
                <span>{working ? 'Working...' : 'Remove Selected'}</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button className="btn inline-flex items-center gap-2" onClick={() => setShowBiometrics(v => !v)} disabled={!selectedSession}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3-4 5-4 5s4 2 8 2 8-2 8-2-4-2-4-5a4 4 0 10-8 0z" /></svg>
                <span className="text-sm">{showBiometrics ? 'Hide Biometrics' : 'Open Biometrics'}</span>
              </button>
            </div>
          </div>

          {showBiometrics && (
            <div className="mt-4 border rounded p-4 bg-white">
              <BiometricsSignIn
                entityType="student"
                schoolId={filteredStudents[0]?.school_id || null}
                sessionType={participantsTable}
                bucketName="student-uploads"
                folderName="faces"
                onCompleted={(data) => handleBiometricsCompleted(data)}
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
                      <div className="text-sm text-gray-500">Added: {p.added_at ? p.added_at.slice(0,19).replace('T',' ') : '—'}</div>
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

          {lastActionResult && (
            <pre className="mt-4 text-sm bg-gray-100 p-2 rounded">{JSON.stringify(lastActionResult, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
