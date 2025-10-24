import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthProvider";
import { useParams, Link } from "react-router-dom";
import api from "../../api/client";
import DynamicBulkForm from "./DynamicBulkForm";
import useOfflineTable from "../../hooks/useOfflineTable";
import { getTable } from "../../utils/tableCache";

export default function SessionMarkingForm() {
  const { user } = useAuth();
  const { id } = useParams(); // student id
  const { addRow } = useOfflineTable("academic_session_participants"); // can extend to PE later

  const [student, setStudent] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    const fetchStudentAndSessions = async () => {
      try {
        setLoading(true);

        // --- Load student offline first ---
        let cachedStudents = await getTable("students");
        let fetchedStudent = (cachedStudents || []).find((s) => Number(s.id) === Number(id));

        if (!fetchedStudent) {
          // Fetch online if not cached
          const { data, error } = await api
            .from("students")
            .select(`*, academic_sessions:academic_session_participants(session_id, academic_sessions(*))`)
            .eq("id", id)
            .single();

          if (error) throw error;
          fetchedStudent = data;
        }

        if (!mounted || !fetchedStudent) return;
        setStudent(fetchedStudent);

        // --- Load session participants offline first ---
        let cachedParticipants = await getTable("academic_session_participants");
        cachedParticipants = cachedParticipants || [];

        const studentParticipants = cachedParticipants.filter(
          (p) =>
            Number(p.student_id) === Number(fetchedStudent.id) &&
            p.academic_sessions?.category === fetchedStudent.category
        );

        let sessionsList = studentParticipants.map((p) => p.academic_sessions);

        // If none offline, fetch online
        if (sessionsList.length === 0) {
          const { data, error } = await api
            .from("academic_session_participants")
            .select("*, academic_sessions(*)")
            .eq("student_id", fetchedStudent.id)
            .order("created_at", { ascending: false });

          if (error) throw error;
          sessionsList = data.filter((p) => p.academic_sessions?.category === fetchedStudent.category)
                             .map((p) => p.academic_sessions);
        }

        // Remove duplicates by session ID
        const uniqueSessions = Array.from(new Map(sessionsList.map((s) => [s.id, s])).values());

        setSessions(uniqueSessions);
      } catch (err) {
        console.error(err);
        setError(err.message || err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (id) fetchStudentAndSessions();

    return () => (mounted = false);
  }, [id]);

  const handleMarking = async (formData) => {
    if (!student || !selectedSession) return;
    try {
      await addRow({
        ...formData,
        student_id: student.id,
        session_id: selectedSession,
        school_id: student.school_id,
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!student) return <p>No student found</p>;

  return (
    <div className="p-6 space-y-4">
      <Link to="/dashboard/students" className="btn btn-primary">Back</Link>
      <h2 className="text-xl font-bold">Mark Session for {student.full_name || student.name}</h2>

      <select
        value={selectedSession}
        onChange={(e) => setSelectedSession(e.target.value)}
        className="w-full p-2 border rounded"
      >
        <option value="">-- Select Session --</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.session_name} ({s.date?.slice(0, 10)})
          </option>
        ))}
      </select>

      {selectedSession && (
        <DynamicBulkForm
          schema_name="Academic_session_participants"
          presetFields={{ session_id: selectedSession }}
          user={user}
          onSubmit={handleMarking}
        />
      )}
    </div>
  );
}
