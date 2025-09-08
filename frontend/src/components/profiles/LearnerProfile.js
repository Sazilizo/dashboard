import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/client";
import Photos from "./Photos";
import FilesDownloader from "./FilesDownloader";
import SpecsRadarChart from "../charts/SpecsRadarGraph";
import LearnerAttendance from "./LearnerAttendance";
import AttendanceBarChart from "../charts/AttendanceBarChart";
import { useAuth } from "../../context/AuthProvider";
import BiometricsSignIn from "../forms/BiometricsSignIn";
import "../../styles/LearnerAttendance.css";
import "../../styles/Profile.css";
import RenderIcons from "../../icons/RenderIcons";
import { useOfflineSupabase } from "../../hooks/useOfflineSupabase";

const LearnerProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Overlay state: null | "calendar" | "biometrics"
  const [attendanceMode, setAttendanceMode] = useState(null);

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
          console.error("Failed to fetch student:", err.message);
        } finally {
          setLoading(false);
        }
    };

    if (id) fetchStudent();
  }, [id]);

  useEffect(() => { console.log("student data:", student); }, [student]);


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
        <Link to={`/dashboard/meals/distribute/${id}`} className="btn btn-secondary">
          Distribute Meal
        </Link>
        <Link to={`/dashboard/students/update/${id}`} className="btn btn-secondary">
          Edit Profile
        </Link>
        <Link to={`/dashboard/students/attandance/${id}`} className="btn btn-secondary">
          View Attendance
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
          <div className="profile-details-card">
            <div className="profile-image">
              <Photos bucketName="student-uploads" folderName="students" id={id} photoCount={1} />
            </div>
            <div className="profile-details">
              <div className="school-info">
                <h4>{student.full_name}</h4>
                <h5>{student?.school?.name}</h5>
              </div>
              <p>Grade: {student.grade} ({student.category})</p>
              <p>Age: {student?.age}</p>
              <p>contact:{student?.contact}</p>
              {/* <p><RenderIcons name="pe"/>:{student?.contact}</p> */}
              <p>DOB: {student.date_of_birth}</p>
              <p>pe: {student.physical_education ? "Yes" : "No"}</p>
            </div>
          </div>

          <div className="documents">
            <FilesDownloader bucketName="student-uploads" folderName="students" id={id} />
          </div>
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
        <div className="profile-stats mt-6">
          <h2 className="text-xl font-bold mb-2">Performance Overview</h2>
          <SpecsRadarChart student={student} user={user} />
        </div>
        <div className="profile-stats mt-6">
          <h2 className="text-xl font-bold mb-2">Attendance Overview</h2>
          <AttendanceBarChart student={student} />
        </div>
      </div>
    </>
  );
};

export default LearnerProfile;
