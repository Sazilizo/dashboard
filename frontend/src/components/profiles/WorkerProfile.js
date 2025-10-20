import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/client";
import Card from "../widgets/Card";
import ProfileInfoCard from "../widgets/ProfileInfoCard";
import SpecsRadarChart from "../charts/SpecsRadarGraph";
import StatsDashboard from "../StatsDashboard";
import { useAuth } from "../../context/AuthProvider";
import "../../styles/Profile.css";

const WorkerProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joinedSessions, setJoinedSessions] = useState([]);

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
  // Memoized charts (for learner-type workers)
  const statsCharts = useMemo(() => {
    if (!worker?.learner) return [];
    return [
      {
        title: "Performance Overview",
        Component: SpecsRadarChart,
        props: { student: worker.learner, user },
      },
    ];
  }, [worker, user]);

  if (loading) return <p>Loading worker profile...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!worker) return <p>No worker found</p>;

  const roleName = worker?.profile?.role?.name?.toLowerCase();

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
            bucketName="profile-avatars"
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
    </div>
  );
};

export default WorkerProfile;
