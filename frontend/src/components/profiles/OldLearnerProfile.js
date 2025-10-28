import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/client";
import SpecsRadarChart from "../charts/SpecsRadarGraph";
import AttendanceBarChart from "../charts/AttendanceBarChart";
import LearnerAttendance from "./LearnerAttendance";
import BiometricsSignIn from "../forms/BiometricsSignIn";
import Card from "../widgets/Card";
import ProfileInfoCard from "../widgets/ProfileInfoCard";
import StatsDashboard from "../StatsDashboard";
import { useAuth } from "../../context/AuthProvider";
import "../../styles/Profile.css"
// import InfoCount from "../widgets/infoCount";

const LearnerProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  // const { isOnline } = useOnlineStatus();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attendanceMode, setAttendanceMode] = useState(null);
  const [toggleSessionList, setToggleSessionList] = useState(false)
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    const fetchStudent = async () => {
      try {
        const { data, error } = await api
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
          .eq("id", id)
          .single();

        if (error) throw error;

        //Flatten academic_session fields
        const flattened = {
          ...data,
          completed_academic_sessions: data.completed_academic_sessions?.map((p) => ({
            ...p,
            session_name: p.academic_session?.session_name,
            date: p.academic_session?.date,
          })) || [],
        };

        setStudent(flattened);
      } catch (err) {
        setError(err.message || err);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchStudent();
  }, [id]);

  // useEffect(() => {
  //   let start = 0;
  //   const end = count;
  //   const increment = end / (duration / 16); // approx 60fps
  //   const timer = setInterval(() => {
  //     start += increment;
  //     if (start >= end) {
  //       start = end;
  //       clearInterval(timer);
  //     }
  //     setDisplayCount(Math.floor(start));
  //   }, 16);
  
  //   return () => clearInterval(timer);
  // }, [count, duration]);



  // --- Build chart config dynamically ---
  const statsCharts = useMemo(() => {
    if (!student) return [];

    // Specs chart
    const specsDataChart = {
      title: "Performance Overview",
      Component: SpecsRadarChart,
      props: { student, user, className:"specs-radar-grid" },
    };

    // Attendance chart
    const attendanceDataChart = {
      title: "Attendance Overview",
      Component: AttendanceBarChart,
      props: { student, className:"Attendance-overview-graph" },
    };

    return [specsDataChart, attendanceDataChart];
  }, [student, user]);

  useEffect(() => {
    document.title = student ? `${student.full_name} - Profile` : "Learner Profile";
  }, [student]);

  useEffect(()=>{
    console.log("Student: ", student)
  })

  if (loading) return <p>Loading student data...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!student) return <p>No student found</p>;

  return (
    <>
      <div className="profile-learner-print">
        <button className="btn btn-primary" onClick={() => window.history.back()}>
          Back to Students
        </button>
        <button className="btn btn-secondary" onClick={() => window.print()}>
          Print Profile
        </button>
      </div>

      <div className="student-edit-section">
        <Link to={`/dashboard/sessions/create/single/${id}`} className="btn btn-primary">
          Record Session
        </Link>
        <Link to={`/dashboard/sessions/mark/${id}`} className="btn btn-primary">
          Mark Session
        </Link>
        <Link to={`/dashboard/meals/distribute/${id}`} className="btn btn-secondary">
          Distribute Meal
        </Link>
        <Link to={`/dashboard/students/update/${id}`} className="btn btn-secondary">
          Edit Profile
        </Link>
        <button className="btn btn-success mb-2" onClick={() => setAttendanceMode("calendar")}>
          Calendar Attendance
        </button>
        <button className="btn btn-success mb-2" onClick={() => setAttendanceMode("biometrics")}>
          Biometric Attendance
        </button>
      </div>

      <div className="grid-layout">
        <div className="profile-wrapper">
          <Card className="profile-details-card-wrapper">
            <ProfileInfoCard data={student} bucketName="student-uploads" folderName="students" />
          </Card>
          <Card className="profile-details-count-card">
            <div className="info-count-card">
              {/* {icon && <div className="info-count-icon">{icon}</div>} */}
              <div className="info-count-details">
                <p className="info-count-label">Sessions Attended</p>
                <p className="info-count-number">{student.academic_sessions?.length || 0}</p>
              </div>
            </div>
            {/* <InfoCount label="Sessions Attended" count={student.academic_sessions?.length || 0} />
            <InfoCount label="PE Sessions" count={student.pe_sessions?.length || 0} />
            <InfoCount label="Assessments Taken" count={student.assessments?.length || 0} />
            <InfoCount label="Meals Received" count={student.meal_distributions?.length || 0} /> */}
          </Card>
        </div>

        {attendanceMode && (
          <div className="overlay">
            <div className="overlay-content">
              <button className="overlay-close" onClick={() => setAttendanceMode(null)}>
                ✖
              </button>
              {attendanceMode === "calendar" ? (
                <LearnerAttendance id={id} school_id={student.school_id} restrictToMonth={true} />
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
        )}

        <div className="grid-item list-items student-sessions-list">
          {(student?.academic_sessions.length > 0 || student?.pe_sessions.length > 0) && (
            <button className="btn primary-btn" onClick={()=>setToggleSessionList(!toggleSessionList)}>
              {!toggleSessionList ? "show sessions": "close sessions"}
            </button>
          )}
          {toggleSessionList && (
              <ul className="app-list">
                {student.academic_sessions?.map((s) => (
                  <li key={s.id}>
                    <Link to={`/dashboard/students/${s.id}`}>
                      <div className="app-profile-photo"></div>
                      <div className="app-list-item-details">
                        <p>
                          <strong>{s.session_name}</strong>
                          <span style={{ padding: "5px 12px" }}>{s.category}</span>
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
                {student.pe_sessions?.map((s) => (
                  <li key={`pe-${s.id}`}>
                    <Link to={`/dashboard/students/${s.id}`}>
                      <div className="app-profile-photo"></div>
                      <div className="app-list-item-details">
                        <p>
                          <strong>{s.session_name}</strong>
                          <span style={{ padding: "5px 12px" }}>{s.category}</span>
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
          )}
        </div>

        {/* Use reusable StatsDashboard */}
        <div className="grid-item stats-container profile-stats mt-6">
          <StatsDashboard charts={statsCharts} loading={loading} layout="2col" />
        </div>
      </div>
    </>
  );
};

export default LearnerProfile;