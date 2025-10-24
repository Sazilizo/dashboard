import React, { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useResourceFilters} from "../../hooks/useResouceFilters";
import FiltersPanel from "../filters/FiltersPanel";
import { useAuth } from "../../context/AuthProvider"; 
import { useSchools } from "../../context/SchoolsContext";
import { useFilters } from "../../context/FiltersContext";
import useOfflineTable from "../../hooks/useOfflineTable";

const gradeOptions = [
  "R1", "R2", "R3", // Reception grades
  ...Array.from({ length: 7 }, (_, i) => {
    const grade = i + 1;
    return ["A", "B", "C", "D"].map(section => `${grade}${section}`);
  }).flat()
]
const groupByOptions = ["ww", "pr",,"un"];

export default function SessionList({deleted}) {
  const { user } = useAuth();
  const { schools } = useSchools();
  const {filters, setFilters} = useFilters()


  const sessionTypeOptions = user?.profile?.roles.name === "head tutor"
    ? ["Academics"]
    : user?.profile?.roles.name === "head coach"
      ? ["PE"]
      : ["PE", "Academics"];
  
  const normalizedFilters = {
    school_id: ["superuser", "admin", "hr", "viewer"].includes(user && user?.profile?.roles.name)
      ? schools.map(s => s.id)
      : [user?.profile?.school_id],
  };

  // const { rows: sessions, loading, error } = useOfflineTable(
  //   "students",
  //   normalizedFilters,
  //   `
  //           *,
  //           academic_sessions:academic_sessions(*),
  //           pe_sessions:pe_sessions(*),
  //           assessments(*),
  //           attendance:attendance_records(*),
  //           school:schools(*)
  //         `,
  //   10,
  //   "id",
  //   "asc"
  // );

  return (
    <div className="app-list-container">
      <div className="app-list-header">
        <h2>Session List {deleted ? "(Deleted)" : ""}</h2>
        <div className="app-list-filters">
          <FiltersPanel
            user={user}
            schools={schools}
            filters={{ ...filters, session_type: sessionTypeOptions }}
            setFilters={setFilters}
            resource="students"
            gradeOptions={gradeOptions}
            sessionTypeOptions={sessionTypeOptions}
            groupByOptions={groupByOptions}
            showDeletedOption={["admin", "hr", "superviser"].includes(user?.profile?.roles.name)}
          />
        </div>
      </div>
      <Link to="/dashboard/sessions/create" className="app-btn app-btn-primary">Create Session</Link>

      <Link to="/dashboard/sessions/mark" className="app-btn app-btn-primary">Distribute Session</Link>
      {/* {loading && <div>Loading...</div>} */}
      {/* {error && <div style={{ color: "red" }}>{error}</div>} */}
      {/* {!loading && !error && (
        <ul className="app-list">
          {sessions && sessions.map(s => {
            console.log()
            return (
              <li key={s.id}>
                <Link to={`/dashboard/dashboard/session/${s.id}`}>
                  <div className="app-list-item-details">
                    {s?.photo && <img src={s.photo} alt={`${s.session_name} ${s.full_name}`} style={{ width: "50px", height: "50px", borderRadius: "50%" }} />}
                    <span style={{marginRight:"1rem"}}>{s.full_name}</span>
                    <span>{s.category}</span>
                    <span>{s.session_name}</span>
                    <span>{s.session_date}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )} */}
      <Outlet/>
    </div>
  );
}
