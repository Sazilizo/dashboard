import React, { useEffect, useMemo } from "react";
import FiltersPanel from "../components/filters/FiltersPanel";
import { useAuth } from "../context/AuthProvider";
import { Link } from "react-router-dom";
import { useSchools } from "../context/SchoolsContext";
import { useFilters } from "../context/FiltersContext";
import useSeo from '../hooks/useSeo';

export default function SchoolsDashboard() {
  const { schools } = useSchools();
  const { user } = useAuth();
  const { filters, setFilters } = useFilters();

  useSeo({ title: 'Schools - GCU Dashboard', description: 'Browse and manage schools in your organization.' });

  const isAllSchoolRole = ["superuser", "admin", "hr", "viewer"].includes(
    user?.profile?.roles?.name
  );

  // Determine school IDs based on role and filter selection
  const schoolIds = useMemo(() => {
    const roleName = user?.profile?.roles?.name;
    
    if (["superuser", "admin", "hr", "viewer"].includes(roleName)) {
      // If user has selected schools in filters, use those
      if (Array.isArray(filters.school_id) && filters.school_id.length > 0) {
        return filters.school_id.map(id => typeof id === 'number' ? id : Number(id)).filter(Boolean);
      }
      // Otherwise show all schools
      return schools.map(s => s.id).filter(Boolean);
    }
    
    // Single school role - only their school
    return user?.profile?.school_id ? [user.profile.school_id] : [];
  }, [user?.profile?.roles?.name, user?.profile?.school_id, schools, filters.school_id]);

  // Filter schools to display based on selection
  const displayedSchools = useMemo(() => {
    if (schoolIds.length === 0) return schools;
    return schools.filter(s => schoolIds.includes(s.id));
  }, [schools, schoolIds]);

  useEffect(() => {
    console.log('[SchoolsDashboard] Displayed schools:', displayedSchools?.length || 0);
  }, [displayedSchools]);

  return (
    <>
    <div>
      <h2>Schools Dashboard</h2>

      <div className="page-filters">
        <FiltersPanel
          user={user}
          schools={schools}
          filters={filters}
          setFilters={setFilters}
          resource="schools"
          showDeletedOption={false}
        />
      </div>

      {displayedSchools.length > 0 ? (
        displayedSchools.map((school) => (
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
    </>
  );
}
