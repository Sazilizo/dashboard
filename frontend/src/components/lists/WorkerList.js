import React, { useEffect } from "react";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import FiltersPanel from "../filters/FiltersPanel";
import useOfflineTable from "../../hooks/useOfflineTable";
import { useFilters } from "../../context/FiltersContext";
import StudentStats from "./StudentStats";
import "../../styles/main.css"
import { Link } from "react-router-dom";
import WorkerStats from "./WorkerStats";
import Pagination from "../widgets/Pagination";
import SortDropdown from "../widgets/SortDropdown";
import QueuedList from "../widgets/QueuedList";
import WorkerListItems from "../widgets/WorkerListItems";

const groupByOptions =["cleaners", "tutors","coaches", "head coaches", "head tutors"]

export default function WorkerList() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();
  const [showList, setShowList] = React.useState(true);
  const [sortBy, setSortBy] = React.useState("id");
  const [sortOrder, setSortOrder] = React.useState("asc");

  const isAllSchoolRole = ["superuser", "admin", "hr", "viewer"].includes(user?.profile?.roles?.name);

  // Determine school IDs like StudentList so filters work consistently
  const schoolIds = React.useMemo(() => {
    const roleName = user?.profile?.roles?.name;
    if (["superuser", "admin", "hr", "viewer"].includes(roleName)) {
      if (Array.isArray(filters.school_id) && filters.school_id.length > 0) {
        return filters.school_id.map(Number);
      }
      return schools.map((s) => s.id).filter(Boolean);
    }
    return user?.profile?.school_id ? [user.profile.school_id] : [];
  }, [user?.profile?.roles?.name, user?.profile?.school_id, schools, filters.school_id]);

  const normalizedFilters = React.useMemo(() => {
    const f = { school_id: schoolIds };
    if (Array.isArray(filters.group_by) && filters.group_by.length > 0) f.group_by = filters.group_by;
    if (Array.isArray(filters.deleted) && filters.deleted.length > 0) f.deleted = filters.deleted;
    return f;
  }, [schoolIds, filters.group_by, filters.deleted]);

  // Use the offline hook for workers. Include relation fields as needed (roles)
  const {
    rows: workers,
    loading,
    error,
    addRow,
    updateRow,
    deleteRow,
    isOnline,
    page,
    hasMore,
    loadMore,
  } = useOfflineTable(
    "workers",
    normalizedFilters,
    `*, roles:roles(name)`,
    50,
    sortBy,
    sortOrder
  );

  return (
  <div className="app-list-container">
      <div>
  <div className="app-list-header">
          <h2>Workers List</h2>
          <div className="app-list-filters">
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
          <div className={`app-list-panel ${showList ? "show" : "hide"}`}>
            <div style={{ marginBottom: 8 }}>
              {isAllSchoolRole && (
                <Link to="/dashboard/workers/create" className="app-btn app-btn-primary">Create worker</Link>
              )}
              <SortDropdown
                options={[
                  { value: "name", label: "Name" },
                  { value: "roles.name", label: "Role" },
                  { value: "id", label: "ID" },
                ]}
                value={sortBy}
                order={sortOrder}
                onChange={setSortBy}
                onOrderChange={setSortOrder}
              />
            
              <span>Status: </span>
              <span className={isOnline ? "text-green-600" : "text-yellow-600"}>
                {isOnline ? "Online" : "Offline (changes will sync when online)"}
              </span>
            </div>

            {loading && <div>Loading...</div>}
            {!loading && error && <div style={{ color: "red" }}>{error.message || error}</div>}
            {!loading && !error && (
              <>
                  <WorkerListItems workers={workers} />

                <Pagination
                  page={page}
                  hasMore={hasMore}
                  loadMore={loadMore}
                  loading={loading}
                />
                <QueuedList table="workers" />
              </>
            )}
          </div>

          {/* MIDDLE = Toggle Button */}
          <button
            className="app-list-toggle-btn"
            onClick={() => setShowList((prev) => !prev)}
          >
            {showList ? "<" : ">"}
          </button>

          {/* RIGHT = Stats */}
          <div className="app-list-stats">
            {workers && workers.length > 0 && (
              <div className="app-list-stats-item">
                <WorkerStats workers={workers} loading={loading} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
