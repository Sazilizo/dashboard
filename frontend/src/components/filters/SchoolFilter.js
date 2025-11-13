
import React, { useEffect, useState } from "react";
import "../../styles/main.css"

export default function SchoolFilter({ user, schools, onChange }) {
  const isAllSchoolRole = ["admin", "hr", "superuser", "viewer"].includes(
    user?.profile?.roles?.name
  );

  const [selectedSchools, setSelectedSchools] = useState([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Remove previous incorrect sync. Do not call onChange here with unexpected args.
    // Initialization and selection are handled in the main init effect below.
  }, [user]);

  // Initialize: If role is single-school, preselect their school
  // If multi-school role, select all schools by default
  useEffect(() => {
    // Initialize selection once when either user or schools become available
    if (initialized) return;

    // Single-school role: lock to their school immediately if available
    if (!isAllSchoolRole && user?.profile?.school_id) {
      const schoolId = user.profile.school_id;
      setSelectedSchools([schoolId]);
      if (typeof onChange === 'function') onChange([schoolId]);
      setInitialized(true);
      return;
    }

    // Multi-school role: if schools are already loaded, select all
    if (isAllSchoolRole && Array.isArray(schools) && schools.length > 0) {
      const allSchoolIds = schools.map((s) => s.id);
      setSelectedSchools(allSchoolIds);
      if (typeof onChange === 'function') onChange(allSchoolIds);
      setInitialized(true);
      return;
    }

    // If multi-school role but schools not yet loaded, select sentinel indicating all
    if (isAllSchoolRole && (!schools || schools.length === 0)) {
      setSelectedSchools([-1]);
      if (typeof onChange === 'function') onChange([-1]);
      setInitialized(true);
      return;
    }
  }, [isAllSchoolRole, user, schools, onChange, initialized]);

  const toggleOption = (school_id) => {
    setSelectedSchools((prev) => {
      const updated = prev.includes(school_id)
        ? prev.filter((s) => s !== school_id)
        : [...prev, school_id];
      
      // Ensure at least one school is selected
      if (updated.length === 0) {
        console.warn('[SchoolFilter] Cannot deselect all schools');
        return prev;
      }
      
      onChange(updated);
      return updated;
    });
  };

  // Single-school role view
  if (!isAllSchoolRole) {
    const userSchool = schools.find(
      (s) => s.id === user?.profile?.school_id
    );
    return (
      <div className="school-filter">
        <label>School:</label>
        <span className="school-name">{userSchool?.name || "Unknown School"}</span>
      </div>
    );
  }

  // Multi-school role view
  return (
    <div className="school-filter">
      <label>Schools:</label>
      {schools.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="school-all-fallback"
            className="filter-checkbox"
            checked={selectedSchools.includes(-1)}
            onChange={() => {
              // Toggle the sentinel value
              setSelectedSchools((prev) => {
                const hasAll = prev.includes(-1);
                const updated = hasAll ? [] : [-1];
                onChange(updated);
                return updated;
              });
            }}
          />
          <label htmlFor="school-all-fallback" className="filter-label-text">
            All Schools
          </label>
          <span style={{ fontSize: 12, color: '#777' }}>(fallback - schools not loaded yet)</span>
        </div>
      ) : (
        <ul className="filter-list-schools filter-list">
          {schools.map((school) => (
            <li key={school.id} className="filter-list-item">
              <input
                type="checkbox"
                id={`school-${school.id}`}
                className="filter-checkbox"
                checked={selectedSchools.includes(school.id)}
                onChange={() => toggleOption(school.id)}
              />
              <label
                htmlFor={`school-${school.id}`}
                className="filter-label-text"
              >
                {school.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
