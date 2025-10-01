
import React, { useEffect, useState } from "react";
import "../../styles/main.css"

export default function SchoolFilter({ user, schools, onChange }) {
  const isAllSchoolRole = ["admin", "hr", "superuser", "viewer"].includes(
    user?.profile?.roles?.name
  );

  const [selectedSchools, setSelectedSchools] = useState([]);

  // If role is single-school, preselect and lock their school
  useEffect(() => {
    if (!isAllSchoolRole && user?.profile?.school_id) {
      setSelectedSchools([user.profile.school_id]);
      onChange([user.profile.school_id.toString()]);
    }
  }, [isAllSchoolRole, user, onChange]);

  const toggleOption = (school_id) => {
    setSelectedSchools((prev) => {
      const updated = prev.includes(school_id)
        ? prev.filter((s) => s !== school_id)
        : [...prev, school_id];
      onChange(updated.map(String)); // send as strings
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
    </div>
  );
}
