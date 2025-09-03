import React, { useEffect } from "react";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import FiltersPanel from "../filters/FiltersPanel";
import { useSupabaseWorkers } from "../../hooks/useSupabaseWorkers";
import { useFilters } from "../../context/FiltersContext";
import StudentStats from "./StudentStats";
import "../../styles/main.css"
import Photos from "../profiles/Photos";
import { Link } from "react-router-dom";
import WorkerStats from "./WorkerStats";

const groupByOptions =["cleaners", "tutors","coaches", "head coaches", "head tutors"]

export default function WorkerList() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();
  const [showList, setShowList] = React.useState(true);

  const isAllSchoolRole = ["superuser", "admin", "hr", "viewer"].includes(user?.profile?.roles.name);
  const { workers, loading, error } = useSupabaseWorkers({
    school_id: isAllSchoolRole ? schools.map((s) => s.id) : [user?.profile?.school_id],
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
              groupByOptions={groupByOptions}
              showDeletedOption={isAllSchoolRole}
            />
          </div>
        </div>

        <div className={`split-container ${showList ? "expanded" : "collapsed"}`}>
          {/* LEFT = List */}
          <div className={`list-panel ${showList ? "show" : "hide"}`}>
            {isAllSchoolRole && (
              <Link to="/dashboard/workers/create" className="btn btn-primary">Create worker</Link>
            )}
            {loading && <div>Loading...</div>}
            {error && <div style={{ color: "red" }}>{error}</div>}
            {!loading && !error && (
              <ul className="mapped-list">
                {workers.map((s) => (
                  <li key={s.id}>
                    <Link to={`/dashboard/workers/${s.id}`}>
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

          {/* MIDDLE = Toggle Button */}
          <button
            className="toggle-btn"
            onClick={() => setShowList((prev) => !prev)}
          >
            {showList ? "<" : ">"}
          </button>

          {/* RIGHT = Stats */}
          <div className="stats-presentation">
            {workers && workers.length > 0 && (
              <div className="stats-item">
                <WorkerStats workers={workers} loading={loading} />
                {/* You can add a WorkerStats component here if available */}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
