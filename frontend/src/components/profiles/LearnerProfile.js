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

const LearnerProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedSessionIndex, setExpandedSessionIndex] = useState(null);

  // Toggle between calendar and biometrics
  const [attendanceMode, setAttendanceMode] = useState("calendar"); // "calendar" | "biometrics"

  useEffect(() => {
    const fetchStudent = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await api
          .from("students")
          .select(`
            *,
            meals:meal_distributions(*),
            academic_sessions:academic_sessions(*),
            pe_sessions:pe_sessions(*),
            assessments(*),
            attendance_records(*),
            school:schools(*)
          `)
          .eq("id", id)
          .single();

        if (error) throw error;
        setStudent(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStudent();
  }, [id]);

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
          Edit Student Profile
        </Link>
        <Link to={`/dashboard/students/attandance/${id}`} className="btn btn-secondary">
          View Attendance
        </Link>
        <button
          className="btn btn-success"
          onClick={() =>
            setAttendanceMode(attendanceMode === "calendar" ? "biometrics" : "calendar")
          }
        >
          {attendanceMode === "calendar" ? "Biometric Attendance" : "Calendar Attendance"}
        </button>
      </div>

      <div className="profile-container">
        <div className="profile-wrapper">
          <div className="profile-header">
            <h1>{student.full_name}</h1>
            <p>School: {student?.school.name}</p>
            <Photos bucketName="student-uploads" folderName="students" id={id} photoCount={1} />
          </div>

          <div className="profile-details">
            <p>Grade: {student.grade}</p>
            <p>Category: {student.category}</p>
            <p>Date Of Birth: {student.date_of_birth}</p>
            <p>Does Physical Education?: {student.physical_education ? "Yes" : "No"}</p>
          </div>

          <div className="documents">
            <FilesDownloader bucketName="student-uploads" folderName="students" id={id} />
          </div>
        </div>

        <div className="profile-stats mt-6">
          {attendanceMode === "calendar" ? (
            <LearnerAttendance id={id} school_id={student.school_id} />
          ) : (
            <BiometricsSignIn
              studentId={id}
              schoolId={student.school_id}
              bucketName="student-uploads"
              folderName="students"
            />
          )}
        </div>

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
