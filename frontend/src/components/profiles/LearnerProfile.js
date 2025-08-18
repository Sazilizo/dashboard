import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/client";
import Photos from "./Photos";
import FilesDownloader from "./FilesDownloader";

const  LearnerProfile=()=> {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState(null);
  const [sessionCount, setSessionCount] = useState(0)
  const [expandedSessionIndex, setExpandedSessionIndex] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStudentAndRelations() {
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
            attendance:attendance_records(*),
            school:schools(*)
          `)
          .eq("id", id)
          .single();

        if (error) throw error;
        setStudent(data);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchStudentAndRelations();
  }, [id]);


  if (loading) return <p>Loading student data...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!student) return <p>No student found</p>;


  return (
    <>
        <div className="profile-learner-print">
            <button className="btn btn-primary" onClick={() => window.history.back()}>Back to Students</button>
            <button className="btn btn-secondary" onClick={() => window.print()}>Print Profile</button>
        </div>
        <div className="student-edit-section">
                <>
                <Link to={`/dashboard/sessions/record/${id}`} className="btn btn-primary">
                    Record Session
                </Link>
                <Link to={`/dashboard/students/${id}/distribute-meal`} className="btn btn-secondary">
                    Distribute Meal
                </Link>
                <Link to={`/dashboard/students/update/${id}`} className="btn btn-secondary">
                    Edit Student Profile
                </Link>
                </>

        </div>
        <div className="profile-container">
            <div className="profile-wrapper">
                <div className="profile-header">
                    <h1>{student.full_name}</h1>
                    <p>School: {student?.school.name}</p>
                    <Photos bucketName="student-uploads" folderName="students" id={id} />
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
            <div className="profile-stats">
                <p>Number of Academic Sessions completed: {sessionCount && sessionCount}</p>
                <p>Number of Meals received: {student?.meals_distributed || 0}</p>
                <div className="lessions">
                    {student.academic_sessions &&
                        student.academic_sessions.map((session, index) => (
                        <React.Fragment key={session.created_at || index}>
                            <button onClick={() => setExpandedSessionIndex(index === expandedSessionIndex ? null : index)}>
                            {session.session_name}
                            </button>
                            {expandedSessionIndex === index && (
                            <div className="session_information">
                                {/* Display session details here */}
                                <p><strong>Name:</strong> {session.session_name}</p>
                                <p><strong>Created:</strong> {session.created_at}</p>
                                <p><strong>Details:</strong> {JSON.stringify(session.specs)}</p>
                            </div>
                            )}
                        </React.Fragment>
                    ))}
                </div>

            </div>
        {/* ... */}
        </div>
    </>
  );
}


export default LearnerProfile;