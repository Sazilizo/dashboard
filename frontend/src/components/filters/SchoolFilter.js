
import React, { useEffect, useState } from "react";
import "../../styles/main.css"

export default function SchoolFilter({ user, schools, onChange }) {
  const isAllSchoolRole = ["admin", "hr", "superuser", "viewer"].includes(
    user?.profile?.roles?.name
  );

  const [selectedSchools, setSelectedSchools] = useState([]);
  const [initialized, setInitialized] = useState(false);

  // Initialize: If role is single-school, preselect their school
  // If multi-school role, select all schools by default
  useEffect(() => {
    if (initialized) return;
    
    if (!isAllSchoolRole && user?.profile?.school_id) {
      // Single school role - lock to their school
      const schoolId = user.profile.school_id;
      setSelectedSchools([schoolId]);
      onChange([schoolId]);
      setInitialized(true);
    } else if (isAllSchoolRole && schools.length > 0) {
      // Multi-school role - select all schools by default
      const allSchoolIds = schools.map(s => s.id);
      setSelectedSchools(allSchoolIds);
      onChange(allSchoolIds);
      setInitialized(true);
    } else if (isAllSchoolRole && schools.length === 0) {
      // Fallback for mobile/initial runs when schools haven't loaded yet
      // Use sentinel -1 meaning "All Schools"
      setSelectedSchools([-1]);
      onChange([-1]);
      setInitialized(true);
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
