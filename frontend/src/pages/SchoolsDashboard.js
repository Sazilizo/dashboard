import React, { useEffect } from "react";
import FiltersPanel from "../components/filters/FiltersPanel";
import { useAuth } from "../context/AuthProvider";
import { Link } from "react-router-dom";
import { useSchools } from "../context/SchoolsContext";
import { useFilters } from "../context/FiltersContext";

export default function SchoolsDashboard() {
  const { schools } = useSchools();
  const { user } = useAuth();
  const { filters, setFilters } = useFilters();

  const isAllSchoolRole = ["superuser", "admin", "hr", "viewer"].includes(
    user?.profile?.roles?.name
  );

  // Normalize school_id filter to always be an array (or empty array if none)
  const schoolIds = Array.isArray(filters.school_id)
    ? filters.school_id
    : filters.school_id
    ? [filters.school_id]
    : [];

  // Determines schools user is allowed to see
  const allowedSchools = isAllSchoolRole
    ? schools
    : schools.filter((s) => s.id === user?.profile?.school_id);

  // If user has selected schools in filters, filter allowedSchools accordingly
  // Otherwise, show all allowedSchools
  const displayedSchools =
    schoolIds.length > 0
      ? allowedSchools.filter((s) => schoolIds.includes(s.id))
      : allowedSchools;


  return (
    <div>
      <h2>Schools Dashboard</h2>

      <div className="page-filters">
        <FiltersPanel
          user={user}
          schools={schools}
          filters={filters}
          setFilters={setFilters}
          resource="students"
          groupByOptions={["ww", "pr", "un"]}
          showDeletedOption={allowedSchools}
        />
      </div>

      {schools.length > 0 ? (
        schools.map((school) => (
          <Link to={`/dashboard/schools/${school.id}`} key={school.id}>
            <div style={{ border: "1px solid #ccc", margin: 12, padding: 12 }}>
              <h3>{school.name}</h3>
              <div>Address: {school.address || "N/A"}</div>
              <div>
                Contact: {school.contact_number || "N/A"} |{" "}
                {school.email || "N/A"}
              </div>
              <div>Students: {school?.students_count}</div>
              <div>Workers: {school?.workers_count}</div>
              <div>Meals: {school?.meals_count ?? 0}</div>
              <div>Users: {school?.users_count ?? 0}</div>
            </div>
          </Link>
        ))
      ) : (
        <p>No schools selected or available.</p>
      )}
    </div>
  );
}
