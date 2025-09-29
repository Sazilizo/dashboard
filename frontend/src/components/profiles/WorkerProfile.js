import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/client";
import SpecsRadarChart from "../charts/SpecsRadarGraph";
import AttendanceBarChart from "../charts/AttendanceBarChart";
import LearnerAttendance from "./LearnerAttendance";
import BiometricsSignIn from "../forms/BiometricsSignIn";
import Card from "../widgets/Card";
import ProfileInfoCard from "../widgets/ProfileInfoCard";
// import InfoCount from "../widgets/infoCount";
import StatsDashboard from "../StatsDashboard";
import { useAuth } from "../../context/AuthProvider";
import "../../styles/Profile.css"
const WorkerProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attendanceMode, setAttendanceMode] = useState(null); // calendar | biometrics
  const [toggleSessionList, setToggleSessionList] = useState(false)

  useEffect(() => {
    const fetchWorker = async () => {
      try {
        const { data, error } = await api
          .from("workers")
          .select(`
            *,
            school:school_id(*)
          `)
          .eq("id", id)
          .single();

        if (error) throw error;
        setWorker(data);
      } catch (err) {
        setError(err.message || err);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchWorker();
  }, [id]);

  // --- Build chart config dynamically ---
//   const statsCharts = useMemo(() => {
//     if (!student) return [];

//     // Specs chart
//     const specsDataChart = {
//       title: "Performance Overview",
//       Component: SpecsRadarChart,
//       props: { student, user },
//     };

//     // Attendance chart
//     const attendanceDataChart = {
//       title: "Attendance Overview",
//       Component: AttendanceBarChart,
//       props: { student },
//     };

//     return [specsDataChart, attendanceDataChart];
//   }, [student, user]);

  useEffect(() => {
    document.title = worker ? `${worker.name} - Profile` : "Worker Profile";
  }, [worker]);

  useEffect(()=>{
    console.log("worker: ", worker)
  })

  if (loading) return <p>Loading worker data...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!worker) return <p>No worker found</p>;

  return (
    <>
      <div className="profile-learner-print">
        <button className="btn btn-primary" onClick={() => window.history.back()}>
          Back to Workers
        </button>
        <button className="btn btn-secondary" onClick={() => window.print()}>
          Print Profile
        </button>
      </div>

      <div className="student-edit-section">
        <Link to={`/dashboard/students/update/${id}`} className="btn btn-secondary">
          Edit Profile
        </Link>
        {/* <button className="btn btn-success mb-2" onClick={() => setAttendanceMode("calendar")}>
          Calendar Attendance
        </button>
        <button className="btn btn-success mb-2" onClick={() => setAttendanceMode("biometrics")}>
          Biometric Attendance
        </button> */}
      </div>

      <div className="grid-layout">
        <div className="profile-wrapper">
          <Card className="profile-details-card-wrapper">
            <ProfileInfoCard data={worker} bucketName="worker-uploads" folderName="workers" />
          </Card>
          <Card className="profile-details-count-card">
            {/* <InfoCount label="Sessions Attended" count={student.academic_sessions?.length || 0} />
            <InfoCount label="PE Sessions" count={student.pe_sessions?.length || 0} />
            <InfoCount label="Assessments Taken" count={student.assessments?.length || 0} />
            <InfoCount label="Meals Received" count={student.meal_distributions?.length || 0} /> */}
          </Card>
        </div>

        {/* {attendanceMode && (
          <div className="overlay">
            <div className="overlay-content">
              <button className="overlay-close" onClick={() => setAttendanceMode(null)}>
                ✖
              </button>
              {attendanceMode === "calendar" ? (
                <LearnerAttendance id={id} school_id={worker.school_id} restrictToMonth={true} />
              ) : (
                <BiometricsSignIn
                  studentId={id}
                  schoolId={student.school_id}
                  bucketName="student-uploads"
                  folderName="students"
                />
              )}
            </div>
          </div>
        )} */}
       
        {/* Use reusable StatsDashboard */}
        {/* <div className="grid-item stats-container profile-stats mt-6">
          <StatsDashboard charts={statsCharts} loading={loading} layout="2col" />
        </div> */}
      </div>
    </>
  );
};

export default WorkerProfile;
