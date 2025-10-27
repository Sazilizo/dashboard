import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/client";
import Card from "../widgets/Card";
import ProfileInfoCard from "../widgets/ProfileInfoCard";
import SpecsRadarChart from "../charts/SpecsRadarGraph";
import StatsDashboard from "../StatsDashboard";
import { useAuth } from "../../context/AuthProvider";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import "../../styles/Profile.css";

const WorkerProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { isOnline } = useOnlineStatus();
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joinedSessions, setJoinedSessions] = useState([]);
  const [showDisciplinary, setShowDisciplinary] = useState(false);
  const [disciplinaryType, setDisciplinaryType] = useState("warning");
  const [disciplinarySubject, setDisciplinarySubject] = useState("");
  const [disciplinaryMessage, setDisciplinaryMessage] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [bccEmails, setBccEmails] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [includeMe, setIncludeMe] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  useEffect(() => {
    const fetchWorker = async () => {
      try {
        // 1️⃣ Fetch worker base
        const { data: workerData, error: workerError } = await api
          .from("workers")
          .select(`
            *,
            roles(name)
          `)
          .eq("id", id)
          .single();

        if (workerError) throw workerError;

        const roleName = workerData?.roles?.name?.toLowerCase();

        // 2️⃣ Role-based data fetch
        if (roleName === "learner") {
          // Mirror LearnerProfile behavior
          const { data: learner, error: learnerError } = await api
            .from("students")
            .select(`
              *,
              school:school_id(*),
              academic_sessions:academic_sessions(student_id, *),
              attendance_records:attendance_records(student_id, *),
              assessments:assessments(student_id, *),
              pe_sessions:pe_sessions(student_id, *),
              completed_academic_sessions: academic_session_participants(
                id,
                student_id,
                specs,
                session_id,
                academic_session:session_id (
                  session_name,
                  date
                )
              ),
              meal_distributions:meal_distributions(
                student_id,
                *,
                meal:meal_id(name, type, ingredients)
              )
            `)
            .eq("id", workerData.profile.user_id)
            .single();

          if (learnerError) throw learnerError;
          setWorker({ ...workerData, learner });
        }

        else if (roleName === "tutor" || roleName === "head_tutor") {
          // 3️⃣ Tutor logic: fetch both sessions and participants
          const [{ data: sessions }, { data: participants }] = await Promise.all([
            api.from("academic_sessions").select("*"),
            api.from("academic_session_participants").select("*")
          ]);

          const userId =workerData.id || workerData.profile.user_id ;
          const joined = sessions.filter((s) =>
            participants.some((p,w) => p.user_id || w.id === userId && p.session_id === s.id)
          );

          setWorker(workerData);
          setJoinedSessions(joined);
        }

        else {
          // 4️⃣ Regular worker: just load profile info
          setWorker(workerData);
        }

        // Pre-fill recipient email if available
        const inferredEmail = workerData?.email || workerData?.profile?.email || "";
        setToEmail(inferredEmail);
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to fetch worker profile");
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchWorker();
  }, [id]);
  useEffect(() => {
    if (worker) {
      document.title = `${worker.profile?.name || "Worker"} Profile`;
    };
  },[worker])

  useEffect(() => {
    console.log("Worker profile loaded:", worker); 
  }, [worker]);

  if (loading) return <p>Loading worker profile...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!worker) return <p>No worker found</p>;

  const roleName = worker?.profile?.role?.name?.toLowerCase();
  const currentUserRole = user?.profile?.roles?.name?.toLowerCase?.();
  const canDiscipline = ["superuser", "hr"].includes(currentUserRole || "");

  async function handleSendDisciplinary(e) {
    e?.preventDefault?.();
    setSendResult(null);

    if (!isOnline) {
      setSendResult({ ok: false, message: "You're offline. Connect to the internet to send emails." });
      return;
    }
    if (!toEmail || !disciplinarySubject || !disciplinaryMessage) {
      setSendResult({ ok: false, message: "Please fill To, Subject and Message." });
      return;
    }

    setSending(true);
    try {
      const payload = {
        to: toEmail,
        subject: disciplinarySubject,
        message: disciplinaryMessage,
        type: disciplinaryType,
        cc: ccEmails,
        bcc: bccEmails,
        includeMe,
        hrEmail: user?.email || user?.user_metadata?.email || null,
        workerName: worker?.profile?.name || worker?.username || worker?.full_name || null,
        workerId: Number(id) || worker?.id || null,
        removedBy: user?.profile?.id || null,
        reason: disciplinaryMessage,
      };

      const { data, error } = await api.functions.invoke("send-disciplinary", {
        body: payload,
      });

      console.log("[WorkerProfile] Edge Function response:", { data, error });

      if (error) throw error;
      
      const isSimulated = data?.status === "simulated";
      const message = isSimulated 
        ? "Simulated send (no API key configured)." 
        : "Email sent successfully.";
      
      console.log("[WorkerProfile] Email status:", { status: data?.status, isSimulated, dbSuccess: data?.dbSuccess, dbError: data?.dbError });
      
      setSendResult({ ok: true, message });
      setShowDisciplinary(false);
    } catch (err) {
      console.error("Disciplinary send failed", err);
      setSendResult({ ok: false, message: err?.message || "Failed to send email" });
    } finally {
      setSending(false);
    }
  }

    console.log("Disciplinary send result:", sendResult);

  return (
    <div className="worker-profile">
      <div className="profile-learner-print">
        <button className="btn btn-primary" onClick={() => window.history.back()}>
          Back
        </button>
        <button className="btn btn-secondary" onClick={() => window.print()}>
          Print Profile
        </button>
        <Link to={`/dashboard/workers/update/${id}`} className="btn btn-secondary">
            Edit Profile
        </Link>
      </div>

      <div className="profile-wrapper">
        <Card className="profile-details-card-wrapper">
          <ProfileInfoCard
            data={worker}
            bucketName="worker-uploads"
            folderName="workers"
          />
        </Card>

        <Card className="profile-details-count-card">
          <div className="info-count-card">
            <div className="info-count-details">
              <p className="info-count-label">Role</p>
              <p className="info-count-number">
                {worker?.roles?.name || "—"}
              </p>
            </div>
          </div>
        </Card>

        {canDiscipline && (
          <Card className="mt-4" style={{ padding: "12px" }}>
            <button
              className="btn btn-danger"
              onClick={() => setShowDisciplinary(true)}
              disabled={!isOnline}
              title={isOnline ? "Send disciplinary notice" : "You are offline"}
            >
              Disciplinary Notice
            </button>
            {sendResult && (
              <p style={{ marginTop: 8, color: sendResult.ok ? "green" : "red" }}>
                {sendResult.message}
              </p>
            )}
          </Card>
        )}
      </div>

      {/* 5️⃣ Tutor Session List */}
      {(roleName === "tutor" || roleName === "head_tutor") && joinedSessions.length > 0 && (
        <Card className="mt-4">
          <h3>Assigned Academic Sessions</h3>
          <ul className="app-list">
            {joinedSessions.map((s) => (
              <li key={s.id}>
                <Link to={`/dashboard/sessions/${s.id}`}>
                  <div className="app-list-item-details">
                    <strong>{s.session_name}</strong>
                    <span style={{ padding: "5px 12px" }}>{s.category}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 6️⃣ Learner-style charts (if worker is learner) */}
      {worker?.learner && (
        <div className="grid-item stats-container profile-stats mt-6">
          <StatsDashboard charts={statsCharts} loading={loading} layout="2col" />
        </div>
      )}

      {showDisciplinary && (
        <div className="modal-overlay" onClick={() => !sending && setShowDisciplinary(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => !sending && setShowDisciplinary(false)}>✖</button>
            <h3>Send Disciplinary Notice</h3>
            <form onSubmit={handleSendDisciplinary} className="form">
              <div className="form-row">
                <label>Type</label>
                <select value={disciplinaryType} onChange={(e) => setDisciplinaryType(e.target.value)}>
                  <option value="warning">Warning</option>
                  <option value="dismissal">Dismissal</option>
                </select>
              </div>
              <div className="form-row">
                <label>To (worker email)</label>
                <input type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} required />
              </div>
              <div className="form-row">
                <label>CC</label>
                <input type="text" placeholder="comma-separated emails" value={ccEmails} onChange={(e) => setCcEmails(e.target.value)} />
              </div>
              <div className="form-row">
                <label>BCC</label>
                <input type="text" placeholder="comma-separated emails" value={bccEmails} onChange={(e) => setBccEmails(e.target.value)} />
              </div>
              <div className="form-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input id="includeMe" type="checkbox" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} />
                <label htmlFor="includeMe">BCC me ({user?.email || user?.user_metadata?.email || "current user"})</label>
              </div>
              <div className="form-row">
                <label>Subject</label>
                <input type="text" value={disciplinarySubject} onChange={(e) => setDisciplinarySubject(e.target.value)} required />
              </div>
              <div className="form-row">
                <label>Message</label>
                <textarea value={disciplinaryMessage} onChange={(e) => setDisciplinaryMessage(e.target.value)} rows={6} required />
              </div>
              <div className="modal-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => !sending && setShowDisciplinary(false)} disabled={sending}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={sending || !isOnline}>{sending ? 'Sending…' : 'Send'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkerProfile;
