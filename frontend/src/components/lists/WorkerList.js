import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import { useFilters } from "../../context/FiltersContext";
import FiltersPanel from "../filters/FiltersPanel";
import useOfflineTable from "../../hooks/useOfflineTable";
import WorkerStats from "./WorkerStats";
import Photos from "../profiles/Photos";
import Pagination from "../widgets/Pagination";
import SortDropdown from "../widgets/SortDropdown";
import QueuedList from "../widgets/QueuedList";
import "../../styles/main.css";

const groupByOptions = ["cleaners", "tutors", "coaches", "head coaches", "head tutors"];

export default function WorkerList() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();

  const [showList, setShowList] = useState(true);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState("asc");

  const roleName = user?.profile?.roles?.name || "";
  const userSchoolId = user?.profile?.school_id;

  const isAllSchoolRole = useMemo(
    () => ["superuser", "admin", "hr", "viewer"].includes(roleName),
    [roleName]
  );

  // ✅ Unified school filter logic
  const schoolIds = useMemo(() => {
    if (isAllSchoolRole) {
      if (Array.isArray(filters.school_id) && filters.school_id.length > 0) {
        return filters.school_id.map(Number);
      }
      return schools.map((s) => s.id).filter(Boolean);
    }
    return userSchoolId ? [userSchoolId] : [];
  }, [isAllSchoolRole, filters.school_id, schools, userSchoolId]);

  // ✅ Construct normalized filters
  const normalizedFilters = useMemo(() => {
    const f = { school_id: schoolIds };
    if (Array.isArray(filters.group_by) && filters.group_by.length > 0)
      f.group_by = filters.group_by;
    if (Array.isArray(filters.deleted) && filters.deleted.length > 0)
      f.deleted = filters.deleted;
    return f;
  }, [schoolIds, filters.group_by, filters.deleted]);

  // ✅ Offline data hook for workers
  const {
    rows: workers,
    loading,
    error,
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
        {/* HEADER */}
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

        {/* MAIN CONTENT */}
        <div className={`split-container ${showList ? "expanded" : "collapsed"}`}>
          {/* LEFT LIST PANEL */}
          <div className={`app-list-panel ${showList ? "show" : "hide"}`}>
            <div style={{ marginBottom: 8 }}>
              {isAllSchoolRole && (
                <Link
                  to="/dashboard/workers/create"
                  className="app-btn app-btn-primary"
                >
                  Create Worker
                </Link>
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

              <div style={{ marginTop: 4 }}>
                <span>Status: </span>
                <span className={isOnline ? "text-green-600" : "text-yellow-600"}>
                  {isOnline ? "Online" : "Offline (sync pending)"}
                </span>
              </div>
            </div>

            {loading && <div>Loading...</div>}
            {error && <div style={{ color: "red" }}>{error.message || String(error)}</div>}

            {!loading && !error && (
              <>
                {workers.length === 0 ? (
                  <p style={{ marginTop: 10 }}>No workers found.</p>
                ) : (
                  <ul className="app-list">
                    {workers.map((w) => (
                      <li key={w.id}>
                        <Link to={`/dashboard/workers/${w.id}`}>
                          <div className="app-profile-photo">
                            {/* ✅ Fixed: Fetch only files inside profile-picture folder */}
                            <Photos
                              bucketName="worker-uploads"
                              folderName={`workers/${w.id}/profile-picture`}
                              id={w.id}
                              photoCount={1}
                            />
                          </div>
                          <div className="app-list-item-details">
                            <p>
                              <strong>{`${w.name || ""} ${w.last_name || ""}`}</strong>
                            </p>
                            <p>Role: {w?.roles?.name || "N/A"}</p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

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

          {/* TOGGLE BUTTON */}
          <button
            className="app-list-toggle-btn"
            onClick={() => setShowList((prev) => !prev)}
          >
            {showList ? "<" : ">"}
          </button>

          {/* RIGHT PANEL - STATS */}
          <div className="app-list-stats">
            {workers.length > 0 && (
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
