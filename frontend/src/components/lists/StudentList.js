import React, { useMemo, useState } from "react";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import FiltersPanel from "../filters/FiltersPanel";
import { useSupabaseStudents } from "../../hooks/useSupabaseStudents";
import { Link } from "react-router-dom";
import { useFilters } from "../../context/FiltersContext";
import StudentStats from "./StudentStats";
import "../../styles/main.css";
import Photos from "../profiles/Photos";

const gradeOptions = [
  "R1",
  "R2",
  "R3", // Reception grades
  ...Array.from({ length: 7 }, (_, i) => {
    const grade = i + 1;
    return ["A", "B", "C", "D"].map((section) => `${grade}${section}`);
  }).flat(),
];

export default function StudentList() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();
  const [showList, setShowList] = useState(true); // toggle state

  const schoolIds = useMemo(() => {
    if (
      ["superuser", "admin", "hr", "viewer"].includes(user?.profile?.roles.name)
    ) {
      return schools.map((s) => s.id);
    }
    return [user?.profile?.school_id];
  }, [user?.profile?.roles.name, user?.profile?.school_id, schools]);

  const { students, loading, error } = useSupabaseStudents({
    school_id: schoolIds,
  });

  return (
    <div className="items-container">
      <div>
        <div className="page-header">
          <h2>Student List</h2>
          <div className="page-filters">
            <FiltersPanel
              user={user}
              schools={schools}
              filters={filters}
              setFilters={setFilters}
              resource="students"
              gradeOptions={gradeOptions}
              showDeletedOption={["admin", "hr", "superviser"].includes(
                user?.profile?.roles.name
              )}
            />
          </div>
        </div>

        <div className={`split-container ${showList ? "expanded" : "collapsed"}`}>
          {/* LEFT = List */}
          <div className={`list-panel ${showList ? "show" : "hide"}`}>
            <Link to="/dashboard/students/create" className="btn btn-primary">Create student</Link>
            {loading && <div>Loading...</div>}
            {error && <div style={{ color: "red" }}>{error}</div>}
            {!loading && !error && (
              <ul className="mapped-list">
                {students.map((s) => (
                  <li key={s.id}>
                    <Link to={`/dashboard/students/${s.id}`}>
                      <div className="profile-photo">
                        <Photos
                          bucketName="student-uploads"
                          folderName="students"
                          id={s.id}
                        />
                      </div>
                      <div className="item-details">
                        <p>
                          <strong>{s.full_name}</strong>
                        </p>
                        <p>grade:{s.grade}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* MIDDLE = Toggle Button */}
          <button
            className="toggle-btn"
            onClick={() => setShowList((prev) => !prev)}
          >
            {showList ? "<" : ">"}
          </button>

          {/* RIGHT = Stats */}
          <div className="stats-presentation">
            {students && students.length > 0 && (
              <div className="stats-item">
                <StudentStats students={students} loading={loading}/>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
