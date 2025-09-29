import React, { useEffect } from "react";
import DashboardSummary from "../components/charts/DashboardSummary";
import { Outlet } from "react-router-dom";
import FiltersPanel from "../components/filters/FiltersPanel";
import { useAuth } from "../context/AuthProvider";
import { useSchools } from "../context/SchoolsContext";
import { useFilters } from "../context/FiltersContext";
import { useSupabaseWorkers } from "../hooks/useSupabaseWorkers";
import SkeletonList from "../components/widgets/SkeletonList";
import ListItems from "../components/widgets/ListItems";
export default function DashboardHome() {
  // const {user} = useAuth();
  // const {schools} = useAuth();
  // const {filters, setFilters} = useFilters()

  // const isAllSchoolRole = ["superuser", "admin", "hr", "viewer"].includes(user?.profile?.roles.name);
  //   const { workers, loading, error } = useSupabaseWorkers({
  //     school_id: isAllSchoolRole ? schools.map((s) => s.id) : [user?.profile?.school_id],
  //   });

  return (
    <div>
      <h2>School Overview</h2>
      {/* <div className="app-list-filters">
          <FiltersPanel
            user={user}
            schools={schools}
            filters={filters}
            setFilters={setFilters}
            resource="workers"
            // groupByOptions={groupByOptions}
            showDeletedOption={isAllSchoolRole}
          />
      </div>
      <div className="list-items grid-item app-list-panel">
          {loading && <SkeletonList count={10} />}
          {!loading && error && <div style={{color:"red"}}>{error.message || error}</div>}
          {!loading && !error && <ListItems schools={schools} />}
      </div> */}
    </div>
  );
}
