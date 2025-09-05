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

const LearnerProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Overlay state: null | "calendar" | "biometrics"
  const [attendanceMode, setAttendanceMode] = useState(null);

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
            school:schools(name, address)
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

  useEffect(()=>{
    console.log("Student:", student)
  },[student])

  if (loading) return <p>Loading student data...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!student) return <p>No student found</p>;

  return (
    <>
      {/* Print + Back */}
      <div className="profile-learner-print">
        <button className="btn btn-primary" onClick={() => window.history.back()}>
          Back to Students
        </button>
        <button className="btn btn-secondary" onClick={() => window.print()}>
          Print Profile
        </button>
      </div>

      {/* Action buttons */}
      <div className="profile-edit-section">
        <Link to={`/dashboard/sessions/record/${id}`} className="btn btn-primary">
          Record Session
        </Link>
        <Link to={`/dashboard/meals/distribute/${id}`} className="btn btn-secondary">
          Distribute Meal
        </Link>
        <Link to={`/dashboard/students/update/${id}`} className="btn btn-secondary">
          Edit Profile
        </Link>
        {/* Attendance toggle buttons */}
        <button className="btn btn-success mb-2" onClick={() => setAttendanceMode("calendar")}>
          Calendar Attendance
        </button>
        <button className="btn btn-success mb-2" onClick={() => setAttendanceMode("biometrics")}>
          Biometric Attendance
        </button>
      </div>

      <div className="profile-container">
        {/* Header */}
        <div className="profile-wrapper">
          <div className="profile-header">
            <Photos bucketName="student-uploads" folderName="students" id={id} photoCount={1} />
          </div>
          <div className="profile-school-details">
            <h1>{student.full_name}</h1>
            <p>{student?.school.name}</p>
            <div className="profile-details">
              <p>Grade: {student.grade} ({student.category})</p>
              <p>Age: {student.age}</p>
              <p>Contact: {student?.contact}</p>
              <p>Date Of Birth: {student.date_of_birth}</p>
              <p>PE {student.physical_education ? "Yes" : "No"}</p>
            </div>
          </div>

          <div className="documents">
            <FilesDownloader bucketName="student-uploads" folderName="students" id={id} />
          </div>
        </div>

        {/* Attendance Overlay */}
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

        {/* Performance Section */}
        <div className="profile-stats mt-6">
          <h2 className="text-xl font-bold mb-2">Performance Overview</h2>
          <SpecsRadarChart student={student} user={user} />
        </div>

        {/* Attendance Section */}
        <div className="profile-stats mt-6">
          <h2 className="text-xl font-bold mb-2">Attendance Overview</h2>
          <AttendanceBarChart student={student} />
        </div>
      </div>
    </>
  );
};

export default LearnerProfile;
