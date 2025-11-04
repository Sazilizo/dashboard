import React, { useState, useEffect } from "react";
import DynamicBulkForm from "./DynamicBulkForm";
import useOfflineTable from "../../hooks/useOfflineTable";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import { useParams } from "react-router-dom";
// EntityMultiSelect removed from SessionForm; selection lives in RecordSessionForm
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import UploadFile from "../profiles/UploadHelper";
import BiometricsSignIn from "./BiometricsSignIn";
import { useSupabaseStudents } from "../../hooks/useSupabaseStudents";
// filters handled in RecordSessionForm
import useToast from "../../hooks/useToast";
import ToastContainer from "../ToastContainer";

const gradeOptions = [
  "R1", "R2", "R3",
  ...Array.from({ length: 7 }, (_, i) => {
    const grade = i + 1;
    return ["A", "B", "C", "D"].map(section => `${grade}${section}`);
  }).flat()
];

const groupByOptions = ["ww", "pr", "un"];

export default function SessionForm() {
  // Quick module-level log (executes on import)
  try { console.log('[SessionForm] module import'); } catch (e) {}

  const { id } = useParams();
  const { user } = useAuth();
  const { schools } = useSchools();
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [sessionType, setSessionType] = useState("");
  const { toasts, showToast, removeToast } = useToast();
  const [serverError, setServerError] = useState(null);

  // Diagnostic debug: expose key runtime state to help trace loading problems
  useEffect(() => {
    console.debug('[SessionForm] mount', { id, sessionType, toastsLength: toasts.length, user: user?.profile?.id });
  }, []);

  useEffect(() => {
    console.debug('[SessionForm] state update', { sessionType, toastsLength: toasts.length });
  }, [sessionType, toasts]);

  // const { students } = useSupabaseStudents({
  //   school_id: ["superuser", "admin", "hr", "viewer"].includes(user?.profile?.roles.name)
  //     ? schools.map(s => s.id)
  //     : [user?.profile?.school_id],
  //   filters,
  // });

  // Role-based session type default
  useEffect(() => {
    const role = user?.profile?.roles.name;
    if (role === "head tutor") setSessionType("academic_sessions");
    else if (role === "head coach") setSessionType("pe_sessions");
  }, [user]);

  const role = user?.profile?.roles.name;
  const sessionOptions = [
    { value: "academic_sessions", label: "Academics" },
    { value: "pe_sessions", label: "PE" },
  ];

  const { addRow } = useOfflineTable(sessionType || "academic_sessions");
  const { isOnline } = useOnlineStatus();
  // SessionForm no longer manages student selection or filters

  // // Filter students based on sessionType
  // const [displayedStudents, setDisplayedStudents] = useState([]);

  // Keep a cached copy when online, and fall back to cached students when offline
  // useEffect(() => {
  //   let mounted = true;
  //   async function ensureStudents() {
  //     try {
  //       if (isOnline) {
  //         if (Array.isArray(students) && students.length) {
  //           if (mounted) setDisplayedStudents(students);
  //           try {
  //             await cacheTable("students", students);
  //           } catch (err) {
  //             console.warn("Failed to cache students", err);
  //           }
  //         }
  //       } else {
  //         const cached = await getTable("students");
  //         if (mounted) setDisplayedStudents(cached || []);
  //       }
  //     } catch (err) {
  //       console.warn("ensureStudents error", err);
  //     }
  //   }
  //   ensureStudents();
  //   return () => { mounted = false; };
  // }, [students, isOnline]);

  // const filteredStudents = displayedStudents.filter(s => {
  //   if (sessionType === "pe_sessions") return s.physical_education; // only PE students
  //   return true; // all students for academics or no session type
  // });

  // Load cached students when offline (fallback)
  // SessionForm does not perform student filtering; that belongs in RecordSessionForm

  const presetFields = {
    school_id: Number(user?.profile?.school_id),
    logged_by: user && user?.profile?.id,
    // ...(id ? { student_id: [id] } : { student_id: selectedStudents }),
  };
  // console.log(filteredStudents)
  // const student = students.find(s => s.id === Number(id));

  return (
    <div className="p-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {serverError && (
        <div className="mb-4 p-3 border rounded bg-red-50 text-sm">
          <div className="flex items-start justify-between">
            <div>
              <strong className="text-red-700">Server error: </strong>
              <span>{serverError.message}</span>
            </div>
            <button className="text-sm text-red-600" onClick={() => setServerError(null)}>Dismiss</button>
          </div>
          <details className="mt-2 text-xs">
            <summary>Show payload & details</summary>
            <pre style={{maxHeight: 180, overflow: 'auto'}}>{JSON.stringify({ payload: serverError.payload, details: serverError.details }, null, 2)}</pre>
          </details>
        </div>
      )}
      <div className="mb-4 p-2 bg-yellow-50 border rounded text-sm">
        <strong>Debug:</strong>
        <div>sessionType: <code>{String(sessionType)}</code></div>
        <div>isOnline: <code>{String(isOnline)}</code></div>
        <div>toasts: <code>{toasts.length}</code></div>
      </div>
      {/* SessionForm is for creating sessions only; student selection and filters live in RecordSessionForm */}
      {/* <h1 className="text-2xl font-bold mb-6">
        {id
          ? `Log session for ${student?.full_name || "student"}`
          : "Create Students Sessions (Bulk)"}
      </h1> */}
    <div className="form-container">
      {(role === "superuser" || role === "admin") && (
        <div className="form-session-select">
          <label className="block font-medium mb-2">Select Session Type</label>
          <select
            value={sessionType}
            onChange={(e) => setSessionType(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">-- Select Session Type --</option>
            {sessionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {sessionType && (
        <DynamicBulkForm
          schema_name={sessionType === "academic_sessions" ? "Academic_sessions" : "PE_sessions"}
          presetFields={presetFields}
          user={user}
          // filteredData={filteredStudents}
          // selectedData={selectedStudents}
          // valueChange={setSelectedStudents}
          // id={id && id}
          onSubmit={async (formData, singleId) => {
            // const studentsId = singleId ? [singleId] : formData.student_id;
            // if (!studentsId || studentsId.length === 0) {
            //   throw new Error("Please select at least one student.");
            // }
 
            console.log("formData: ", formData);
            const tableName = sessionType;
            const record = { ...formData, user_id: user && user.profile?.id};
                // if (record.photo && isOnline) {
                //   record.photo = await UploadFile(
                //     record.photo,
                //     "session-uploads",
                //     `${studentId}/${record.title || "session"}`
                //   );
                // }

                    // queue or insert via offline helper
                try {
                  // sanitize record for session tables: remove fields that don't exist in schema
                  const sanitized = { ...record };
                  if (tableName === 'academic_sessions' || tableName === 'pe_sessions') {
                    // coach_id and tutor_id belong to students table in this schema; drop them if present
                    if ('coach_id' in sanitized) delete sanitized.coach_id;
                    if ('tutor_id' in sanitized) delete sanitized.tutor_id;
                    // logged_by is not a column on sessions in this schema; remove it
                    if ('logged_by' in sanitized) delete sanitized.logged_by;
                    // drop any empty-string fields to avoid type/schema mismatches
                    Object.keys(sanitized).forEach(k => { if (sanitized[k] === '') delete sanitized[k]; });
                  }

                  const res = await addRow(sanitized);
                  if (res && res.__error) {
                    console.error('[SessionForm] addRow returned error', res.error, record);
                    // show in-UI error banner with server details
                    setServerError({ message: res.error?.message || String(res.error), payload: record, details: res.error });
                    // also show a toast for immediate feedback
                    showToast && showToast('Failed to save session — see details', 'error');
                    return;
                  }
                  // success toast
                  showToast && showToast('Session saved', 'success');
                } catch (err) {
                  console.error('[SessionForm] addRow threw', err, record);
                  setServerError({ message: err?.message || String(err), payload: record, details: err });
                  showToast && showToast('Failed to save session — network error', 'error');
                  return;
        }
      }}
        />
      )}
      {/* Session creation UI only. Use RecordSessionForm to distribute sessions and manage attendance. */}
    </div>
    </div>
  );
}
