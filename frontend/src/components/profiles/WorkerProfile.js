import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/client";
import Card from "../widgets/Card";
import ProfileInfoCard from "../widgets/ProfileInfoCard";
import SpecsRadarChart from "../charts/SpecsRadarGraph";
import StatsDashboard from "../StatsDashboard";
import { useAuth } from "../../context/AuthProvider";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import BirthdayConfetti from "../widgets/BirthdayConfetti";
import { isBirthdayFromId } from "../../utils/birthdayUtils";
import Loader from "../widgets/Loader";
import WorkerSessionImpactChart from "../charts/WorkerSessionImpactChart";
import WorkerAttendanceTrendChart from "../charts/WorkerAttendanceTrendChart";
import StudentReachChart from "../charts/StudentReachChart";
import WorkerPerformanceRadar from "../charts/WorkerPerformanceRadar";
import WorkerImpactSummary from "../charts/WorkerImpactSummary";
import WorkerAttendanceTrend from "../charts/WorkerAttendanceTrend";
import { getUserContext } from "../../utils/rlsCache";
import "../../styles/Profile.css";
import SeoHelmet from '../../components/SeoHelmet';

/**
 * Check if current user has permission to view this worker's profile
 * Implements same RLS rules as rlsCache.js for workers table
 */
function checkWorkerAccess(workerData, userContext) {
  if (!userContext) return false;
  
  const { roleName, schoolId, userId } = userContext;
  const role = roleName?.toLowerCase();
  
  // Superuser, admin, and HR can view all workers
  if (['superuser', 'admin', 'hr'].includes(role)) {
    return true;
  }
  
  const workerRole = workerData?.roles?.name?.toLowerCase() || workerData?.role?.toLowerCase();
  const workerSchoolId = workerData?.school_id;
  
  // Head tutors can view all tutors in their school
  if (role === 'head_tutor') {
    return workerSchoolId === schoolId && workerRole === 'tutor';
  }
  
  // Head coaches can view all coaches in their school
  if (role === 'head_coach') {
    return workerSchoolId === schoolId && workerRole === 'coach';
  }
  
  // Regular tutors/coaches can only view themselves
  if (['tutor', 'coach'].includes(role)) {
    return workerData.id === userId || workerData.profile?.id === userId;
  }
  
  // Others can view workers in their school
  if (schoolId && workerSchoolId === schoolId) {
    return true;
  }
  
  return false;
}

const WorkerProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { isOnline } = useOnlineStatus();
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joinedSessions, setJoinedSessions] = useState([]);
  const [sessionParticipants, setSessionParticipants] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [totalHours, setTotalHours] = useState(null);
  const [loadingTotal, setLoadingTotal] = useState(false);
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
        // Get current user's context for RLS checks
        const userContext = getUserContext(user);
        const currentUserRole = userContext?.roleName?.toLowerCase();
        
        // 1️⃣ Fetch worker base
        let workerData = null;
        let workerError = null;
        
        // Try API first
        const response = await api
          .from("workers")
          .select(`
            *,
            roles(name)
          `)
          .eq("id", id)
          .single();
        
        workerData = response.data;
        workerError = response.error;

        // If API failed, try cache
        if (workerError || !workerData) {
          console.warn('WorkerProfile: API fetch failed, trying cache', workerError?.message);
          try {
            const { getTable } = await import('../../utils/tableCache');
            const cachedWorkers = await getTable('workers');
            workerData = cachedWorkers?.find(w => w.id === parseInt(id));
            
            if (workerData) {
              console.log('WorkerProfile: Found worker in cache');
              workerError = null; // Clear error since we found it in cache
            }
          } catch (cacheErr) {
            console.warn('WorkerProfile: Cache lookup failed', cacheErr);
          }
        }

        if (workerError || !workerData) throw workerError || new Error('Worker not found');

        // 2️⃣ RLS Access Check: Can current user view this worker?
        const canView = checkWorkerAccess(workerData, userContext);
        if (!canView) {
          throw new Error('Access denied: You do not have permission to view this worker profile');
        }

        const roleName = workerData?.roles?.name?.toLowerCase();

        // 3️⃣ Role-based data fetch (same as before)
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

        else if (roleName === "tutor" || roleName === "head_tutor" || roleName === "coach" || roleName === "head_coach") {
          // 4️⃣ Tutor/Coach logic aligned to schema: students -> participants -> sessions, plus attendance
          let sessions = [];
          let participants = [];
          let attendance = [];
          
          try {
            const isTutor = roleName.includes('tutor');
            const studentRoleColumn = isTutor ? 'tutor_id' : 'coach_id';

            // 1) Get students linked to this worker
            const { data: taughtStudents = [] } = await api
              .from('students')
              .select('id, full_name, grade, category')
              .eq(studentRoleColumn, workerData.id);

            const studentIds = taughtStudents.map(s => s.id);

            // 2) Get participants for those students
            if (studentIds.length > 0) {
              const { data: parts = [] } = await api
                .from('academic_session_participants')
                .select('*, student:student_id(id, full_name, grade, category)')
                .in('student_id', studentIds);
              participants = parts;

              // 3) Get sessions referenced by participants
              const sessionIds = [...new Set(parts.map(p => p.session_id).filter(Boolean))];
              if (sessionIds.length > 0) {
                const { data: sess = [] } = await api
                  .from('academic_sessions')
                  .select('*')
                  .in('id', sessionIds);
                sessions = sess;
              }
            }

            // 4) Attendance: attribute via tutor_id/coach_id on attendance_records
            const attendanceColumn = isTutor ? 'tutor_id' : 'coach_id';
            const { data: att = [] } = await api
              .from('attendance_records')
              .select('*')
              .eq(attendanceColumn, workerData.id);
            attendance = att;
          } catch (err) {
            console.warn('WorkerProfile: Failed to fetch data from API, trying cache', err);
            // Try cache as fallback
            try {
              const { getTable } = await import('../../utils/tableCache');
              const isTutor = roleName.includes('tutor');
              const studentRoleColumn = isTutor ? 'tutor_id' : 'coach_id';

              const [cachedStudents, cachedParticipants, cachedSessions, cachedAttendance] = await Promise.all([
                getTable('students'),
                getTable('academic_session_participants'),
                getTable('academic_sessions'),
                getTable('attendance_records')
              ]);

              const taughtStudents = (cachedStudents || []).filter(s => s?.[studentRoleColumn] === workerData.id);
              const studentIds = taughtStudents.map(s => s.id);
              const parts = (cachedParticipants || []).filter(p => studentIds.includes(p.student_id));
              participants = parts.map(p => ({
                ...p,
                student: taughtStudents.find(s => s.id === p.student_id) || null,
              }));
              const sessionIds = [...new Set(parts.map(p => p.session_id).filter(Boolean))];
              sessions = (cachedSessions || []).filter(s => sessionIds.includes(s.id));

              const attendanceColumn = isTutor ? 'tutor_id' : 'coach_id';
              attendance = (cachedAttendance || []).filter(a => a?.[attendanceColumn] === workerData.id);
              console.log('WorkerProfile: Loaded data from cache');
            } catch (cacheErr) {
              console.warn('WorkerProfile: Cache lookup failed', cacheErr);
            }
          }

          // Joined sessions are those fetched by sessionIds above
          const joined = sessions;

          setWorker(workerData);
          setJoinedSessions(joined);
          setSessionParticipants(participants);
          setAttendanceRecords(attendance);
        }

        else {
          // 5️⃣ Regular worker: load profile info and attendance
          let attendance = [];
          
          try {
            // Attribute attendance via tutor_id/coach_id if present, else fallback to recorded_by or user_id
            const attTutor = await api.from('attendance_records').select('*').eq('tutor_id', workerData.id);
            const attCoach = await api.from('attendance_records').select('*').eq('coach_id', workerData.id);
            attendance = [
              ...(attTutor.data || []),
              ...(attCoach.data || []),
            ];
          } catch (err) {
            console.warn('WorkerProfile: Failed to fetch attendance from API, trying cache', err);
            
            try {
              const { getTable } = await import('../../utils/tableCache');
              const cachedAttendance = await getTable('attendance_records');
              attendance = (cachedAttendance || []).filter(a => a?.tutor_id === workerData.id || a?.coach_id === workerData.id);
            } catch (cacheErr) {
              console.warn('WorkerProfile: Cache lookup for attendance failed', cacheErr);
            }
          }
          
          setWorker(workerData);
          setAttendanceRecords(attendance);
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
  }, [id, user]);
  // Title/meta handled by SeoHelmet in render

  useEffect(() => {
    console.log("Worker profile loaded:", worker); 
  }, [worker]);

  if (loading) return <Loader variant="dots" size="xlarge" text="Loading worker profile..." fullScreen />;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!worker) return <p>No worker found</p>;

  const pageTitle = worker?.profile?.name || worker?.full_name || 'Worker Profile';
  const pageDesc = worker?.profile?.name ? `${worker.profile.name}'s profile and activity` : 'Worker profile details';

  const roleName = worker?.profile?.role?.name?.toLowerCase() || worker?.roles?.name?.toLowerCase();
  const currentUserRole = user?.profile?.roles?.name?.toLowerCase?.();
  const canDiscipline = ["superuser", "hr"].includes(currentUserRole || "");

  // Stats charts for learner workers (same as LearnerProfile)
  const statsCharts = worker?.learner ? [
    {
      type: "radar",
      component: SpecsRadarChart,
      props: { student: worker.learner, className: "specs-radar-grid" }
    }
  ] : [];

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
      <SeoHelmet title={`${pageTitle} - Profile`} description={pageDesc} />
      {/* Birthday Celebration - 5 second animation */}
      {isBirthdayFromId(worker?.id_number) && (
        <BirthdayConfetti duration={5000} persistent={false} />
      )}

      <div className="profile-learner-print">
        <button className="btn btn-primary" onClick={() => window.history.back()}>
          Back
        </button>
        {/* Total hours button - visible to certain roles only (head coach/tutor/admin/hr/superuser) */}
        {(() => {
          const currentRole = (user?.profile?.roles?.name || "").toLowerCase();
          const workerRole = (worker?.roles?.name || worker?.role || "").toLowerCase();
          const allowed = ["admin", "hr", "superuser"].includes(currentRole)
            || (currentRole === "head_coach" && workerRole === "coach")
            || (currentRole === "head_tutor" && workerRole === "tutor");

          if (!allowed) return null;

          return (
            <>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    setLoadingTotal(true);
                    setTotalHours(null);
                    const { data, error } = await api.from('worker_attendance_totals').select('total_hours').eq('worker_id', worker.id).single();
                    if (error) throw error;
                    setTotalHours(data?.total_hours ?? 0);
                  } catch (err) {
                    console.error('Failed to load worker total hours', err);
                    setTotalHours(null);
                    setError && setError(err?.message || String(err));
                  } finally {
                    setLoadingTotal(false);
                  }
                }}
                disabled={loadingTotal}
                title="Load total hours worked for this worker"
              >
                {loadingTotal ? 'Loading hours…' : 'Load Total Hours'}
              </button>

              {totalHours !== null && (
                <span style={{ marginLeft: 12, fontWeight: 600 }}>
                  Total hours: {Number(totalHours).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              )}
            </>
          );
        })()}
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

      {/* 5️⃣ Impact Visualizations for Tutors/Coaches */}
      {(roleName === "tutor" || roleName === "head_tutor" || roleName === "coach" || roleName === "head_coach") && (
        <div style={{ marginTop: 24 }}>
          {/* Impact Summary Cards */}
          <WorkerImpactSummary
            worker={worker}
            sessions={joinedSessions}
            participants={sessionParticipants}
          />

          {/* Attendance Trend Line Chart */}
          <WorkerAttendanceTrend worker={{ ...worker, attendance_records: attendanceRecords }} />

          {/* Impact Charts Grid */}
          <div className="page-stats">
            {/* Performance Overview Radar */}
            <div className="grid-item page-stats-grid-items">
              <WorkerPerformanceRadar
                attendanceRecords={attendanceRecords}
                joinedSessions={joinedSessions}
                sessionParticipants={sessionParticipants}
              />
            </div>

            {/* Session Impact */}
            <div className="grid-item page-stats-grid-items">
              <WorkerSessionImpactChart
                joinedSessions={joinedSessions}
                roleName={roleName}
              />
            </div>

            {/* Student Reach */}
            <div className="grid-item page-stats-grid-items">
              <StudentReachChart
                joinedSessions={joinedSessions}
                sessionParticipants={sessionParticipants}
                displayType="grade"
              />
            </div>

            {/* Attendance Trend */}
            {attendanceRecords.length > 0 && (
              <div className="grid-item page-stats-grid-items">
                <WorkerAttendanceTrendChart
                  attendanceRecords={attendanceRecords}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6️⃣ Attendance for Non-Teaching Staff */}
      {!["tutor", "head_tutor", "coach", "head_coach", "learner"].includes(roleName) && (
        <div style={{ marginTop: 24 }}>
          {/* Attendance Trend Line Chart */}
          <WorkerAttendanceTrend worker={{ ...worker, attendance_records: attendanceRecords }} />
          
          {/* Additional metrics grid */}
          {attendanceRecords.length > 0 && (
            <div className="page-stats">
              <div className="grid-item page-stats-grid-items">
                <WorkerAttendanceTrendChart
                  attendanceRecords={attendanceRecords}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7️⃣ Session List */}
      {(roleName === "tutor" || roleName === "head_tutor" || roleName === "coach" || roleName === "head_coach") && joinedSessions.length > 0 && (
        <Card className="mt-4">
          <h3>Assigned {roleName.includes('tutor') ? 'Academic' : 'PE'} Sessions ({joinedSessions.length})</h3>
          <ul className="app-list">
            {joinedSessions.slice(0, 10).map((s) => (
              <li key={s.id}>
                <Link to={`/dashboard/sessions/${s.id}`}>
                  <div className="app-list-item-details">
                    <strong>{s.session_name}</strong>
                    <span style={{ padding: "5px 12px" }}>{s.category}</span>
                    {s.date && (
                      <span style={{ fontSize: 12, color: '#666' }}>
                        {new Date(s.date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {joinedSessions.length > 10 && (
            <p style={{ textAlign: 'center', color: '#666', marginTop: 12, fontSize: 13 }}>
              Showing 10 of {joinedSessions.length} sessions
            </p>
          )}
        </Card>
      )}

      {/* 8️⃣ Learner-style charts (if worker is learner) */}
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
