import React, { useEffect } from "react";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import FiltersPanel from "../filters/FiltersPanel";
import { useSupabaseWorkers } from "../../hooks/useSupabaseWorkers";
import { Link } from "react-router-dom";
import { useFilters } from "../../context/FiltersContext";
import StudentStats from "./StudentStats";
import "../../styles/main.css"
import Photos from "../profiles/Photos";
const groupByOptions =["cleaners", "tutors","coaches", "head coaches", "head tutors"]

export default function StudentList() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const {filters, setFilters} = useFilters()

  const isAllSchoolRole = ["superuser", "admin", "hr", "viewer"].includes(user?.profile?.roles.name);
  const { workers, loading, error } = useSupabaseWorkers({
    school_id: isAllSchoolRole
      ? schools.map(s => s.id) // all schools
      : [user?.profile?.school_id],       // only user's school
  });

  return (
    <div className="items-container">
        <div>
          <div className="page-header">
            <h2>Workers List</h2>
            <div className="page-filters">
              <FiltersPanel
                user={user}
                schools={schools}
                filters={filters}
                setFilters={setFilters}
                resource="workers"
                // gradeOptions={gradeOptions}
                groupByOptions={groupByOptions}
                showDeletedOption={isAllSchoolRole}
              />
            </div>
          </div>
      <div className="items-list">
          <div className="list">
            {isAllSchoolRole && <Link to="/dashboard/workers/create">Creeate workers</Link>}
            {loading && <div>Loading...</div>}
            {error && <div style={{ color: "red" }}>{error}</div>}
            {!loading && !error && (
              <ul className="mapped-list">
                {workers.map(s => (
                  <li>
                    <Link key={s.id} to={`/dashboard/workers/${s.id}`}>
                      <div className="profile-photo">
                          <Photos bucketName="worker-uploads" folderName="workers" id={s.id} />
                      </div>
                      <div className="item-details">
                        <p>
                          <strong>{`${s.name} ${s.last_name}`}</strong>
                        </p>
                        <p>role:{s.roles.name}</p>

                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
           <div className="stats-presentation">
             {workers && workers.length > 0 && (
                <div className="stats-item">
                  {/* <StudentStats students={workers}/> */}
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
