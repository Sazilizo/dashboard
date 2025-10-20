// SessionMarkingForm.js
import React, { useState, useEffect } from "react";
import DynamicBulkForm from "./DynamicBulkForm";
import { useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";
import useOfflineTable from "../../hooks/useOfflineTable";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import UploadFile from "../profiles/UploadHelper";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { getTable, cacheTable } from "../../utils/tableCache";

export default function SessionMarkingForm() {
  const { id } = useParams(); // single student
  const { user } = useAuth();
  const [sessionType, setSessionType] = useState(
    user?.profile?.roles.name === "head coach" ? "pe_session_participants" : "academic_session_participants"
  );
  const [sessions, setSessions] = useState([]);
  const [displayedSessions, setDisplayedSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { addRow } = useOfflineTable(sessionType === "pe_session_participants" ? "pe_session_participants" : "academic_session_participants");
  const { isOnline } = useOnlineStatus();

  // Fetch student record; prefer online fetch but fall back to cached students
  useEffect(() => {
    let mounted = true;
    async function fetchStudent() {
      try {
        if (isOnline) {
          const { data, error } = await api
            .from("students")
            .select(`
              full_name,
              grade,
              school_id,
              school:school_id(*)
            `)
            .eq("id", id)
            .single();
          if (error) throw error;
          if (mounted) setStudent(data);
        } else {
          const cached = await getTable("students");
          const found = (cached || []).find((s) => Number(s.id) === Number(id));
          if (mounted) setStudent(found);
        }
      } catch (err) {
        setError(err.message || err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (id) fetchStudent();
    return () => { mounted = false; };
  }, [id, isOnline]);
  // Fetch available sessions; cache them and fall back to cached values when offline
  useEffect(() => {
    let mounted = true;
    const table = sessionType === "academic_session_participants" ? "academic_sessions" : "pe_sessions";
    async function fetchSessions() {
      try {
        if (isOnline) {
          const { data, error } = await api.from(table).select("*").order("created_at", { ascending: false });
          if (error) console.error(error);
          else {
            if (mounted) setSessions(data);
            try { await cacheTable(table, data); } catch (err) { /* ignore cache errors */ }
          }
        } else {
          const cached = await getTable(table);
          if (mounted) setSessions(cached || []);
        }
      } catch (err) {
        console.error("fetchSessions error", err);
      }
    }
    fetchSessions();
    return () => { mounted = false; };
  }, [sessionType, isOnline]);

  const presetFields = {
    // logged_by: user?.id,
    student_id: [id],
    session_id: selectedSession,
  };

  const filteredSessions = sessions && sessions.filter(s => Number(s.student_id) === Number(id))
  return (
    <div className="p-6">
      <div className="student-edit-section">
        <button className="btn btn-primary" onClick={() => window.history.back()}>
            Back to Students
        </button>
        <Link to={`/dashboard/sessions/create/single/${id}`} className="btn btn-primary">
            Record Session
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-4">Mark Session for Student</h1>

      {/* Session dropdown */}
      <div className="mb-4">
        <label className="block font-medium mb-2">Select Session</label>
        <select
          value={selectedSession}
          onChange={(e) => setSelectedSession(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option value="">-- Select a session --</option>
          {filteredSessions && filteredSessions.map((s) => (
            <option key={s.id} value={s.id}>
              {`${s.session_name}, <-> ${s.date.slice(0,10)}` }
            </option>
          ))}
        </select>
      </div>

      {selectedSession && (
        <DynamicBulkForm
          schema_name={sessionType.charAt(0).toUpperCase() + sessionType.slice(1,)}
          presetFields={presetFields}
          user={user && user}
          onSubmit={async (formData) => {
            const record = { ...formData, student_id: id, session_id: selectedSession, "school_id":student?.school_id };
            if (record.photo && isOnline) {
              record.photo = await UploadFile(record.photo, "session-uploads", `${id}/${record.title || "session"}`);
            }
            delete record.logged_by;
            await addRow(record);
          }}
        />
      )}
    </div>
  );
}
