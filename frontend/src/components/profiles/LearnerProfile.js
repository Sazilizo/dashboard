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

const LearnerProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attendanceMode, setAttendanceMode] = useState(null); // calendar | biometrics
  const [toggleSessionList, setToggleSessionList] = useState(false)

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
            meal_distributions:meal_distributions(
              student_id,
              *,
              meal:meal_id(name, type, ingredients)
            )
          `)
          .eq("id", id)
          .single();

        if (error) throw error;
        setStudent(data);
      } catch (err) {
        setError(err.message || err);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchStudent();
  }, [id]);

  // --- Build chart config dynamically ---
  const statsCharts = useMemo(() => {
    if (!student) return [];

    // Specs chart
    const specsDataChart = {
      title: "Performance Overview",
      Component: SpecsRadarChart,
      props: { student, user },
    };

    // Attendance chart
    const attendanceDataChart = {
      title: "Attendance Overview",
      Component: AttendanceBarChart,
      props: { student },
    };

    return [specsDataChart, attendanceDataChart];
  }, [student, user]);

  useEffect(() => {
    document.title = student ? `${student.full_name} - Profile` : "Learner Profile";
  }, [student]);

  useEffect(() => { console.log(student)}, [student]);

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
        <Link to={`/dashboard/sessions/record/${id}`} className="btn btn-primary">
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

      <div className="profile-container">
        <div className="profile-wrapper">
          <Card className="profile-details-card-wrapper">
            <ProfileInfoCard data={student} bucketName="student-uploads" folderName="students" />
          </Card>
          <Card className="profile-details-count-card">
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
        {student.academic_sessions.length > 0 || student.pe_sessions.length > 0 && <button className="btn primary-btn" onClick={()=>setToggleSessionList(!toggleSessionList)}>{!toggleSessionList ? "show sessions": "close sessions"}</button>}
        {
          toggleSessionList && (

          <div className="student-sessions-list">
            <ul className="app-list">
              {student.academic_sessions.map((s) => (
                <li key={s.id}>
                  <Link to={`/dashboard/students/${s.id}`}>
                    <div className="app-profile-photo">
                      {/* <Photos bucketName="student-uploads" folderName="students" id={s.id} photoCount={1} /> */}
                    </div>
                    <div className="app-list-item-details">
                      <p><strong>{s.session_name}</strong><span style={{padding:" 5px 12px"}}>{s.category}</span></p>
                      {/* <p>Grade: {s.grade}</p> */}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          )
        }
        {/* Use reusable StatsDashboard */}
        <div className="profile-stats mt-6">
          <StatsDashboard charts={statsCharts} loading={loading} layout="2col" />
        </div>
      </div>
    </>
  );
};

export default LearnerProfile;
