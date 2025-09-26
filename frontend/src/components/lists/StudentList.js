import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import FiltersPanel from "../filters/FiltersPanel";
import { useOfflineSupabase } from "../../hooks/useOfflineSupabase";
import { useFilters } from "../../context/FiltersContext";
import StudentStats from "./StudentStats";
import Pagination from "../widgets/Pagination";
import SkeletonList from "../widgets/SkeletonList";
import ListItems from "../widgets/ListItems";
import "../../styles/main.css";
import { Link } from "react-router-dom";
import { useSupabaseStudents } from "../../hooks/useSupabaseStudents";

const gradeOptions = [
  "R1","R2","R3",
  ...Array.from({ length: 7 }, (_, i) => {
    const grade = i + 1;
    return ["A","B","C","D"].map(s => `${grade}${s}`);
  }).flat()
];

export default function StudentList() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();
  const [showList, setShowList] = useState(true);


  useEffect(() =>{
    console.log(schools)
  },[schools])
  const schoolIds = React.useMemo(() => {
    const roleName = user?.profile?.roles?.name;
    if (["superuser","admin","hr","viewer"].includes(roleName)) return schools.map(s => s.id).filter(Boolean);
    return user?.profile?.school_id ? [user.profile.school_id] : [];
  }, [user?.profile?.roles?.name, user?.profile?.school_id, schools]);

  const { students,error, loading} = useSupabaseStudents("students", {
     school_id: ["superuser", "admin", "hr", "viewer"].includes(user && user?.profile?.roles.name)
      ? schools.map(s => s.id) // all schools
      : [user?.profile?.school_id], 
    });

  return (
    <div className="app-list-container">
      <div>
        <div className="app-list-header">
          <div className="app-list-filters">
            <FiltersPanel
              user={user}
              schools={schools}
              filters={filters}
              setFilters={setFilters}
              resource="students"
              gradeOptions={gradeOptions}
              showDeletedOption={["admin","hr","superviser"].includes(user?.profile?.roles?.name)}
            />
          </div>
        </div>

        <div className={`split-container ${showList ? "expanded" : "collapsed"}`}>
          <div className={`app-list-panel ${showList ? "show" : "hide"}`}>
            <Link to="/dashboard/students/create" className="app-btn app-btn-primary">Create student</Link>

            {loading && <SkeletonList count={10} />}
            {!loading && error && <div style={{color:"red"}}>{error.message || error}</div>}
            {!loading && !error && <ListItems students={students} />}

            {/* <Pagination page={page} hasMore={hasMore} loadMore={loadMore} loading={loading} /> */}
          </div>

          <button className="app-list-toggle-btn" onClick={() => setShowList(prev => !prev)}>
            {showList ? "<" : ">"}
          </button>

          <div className="app-list-stats">
            {students.length > 0 && <StudentStats students={students} loading={loading} />}
          </div>
        </div>
      </div>
    </div>
  );
}
