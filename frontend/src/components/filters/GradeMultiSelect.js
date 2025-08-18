import React, { useState, useRef, useEffect } from "react";
import "../../styles/main.css"
const GradeMultiSelect = ({ filters, setFilters, gradeOptions }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef();

  const toggleOption = (grade) => {
    const current = filters.grade || [];
    const updated = current.includes(grade)
      ? current.filter((g) => g !== grade)
      : [...current, grade];
    setFilters((f) => ({ ...f, grade: updated }));
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

return (
  <div className="filter-container" ref={containerRef}>
    <label className="filter-label">Grade:</label>
    <button
      type="button"
      className="filter-button"
      onClick={() => setOpen(!open)}
    >
      {filters.grade?.length > 0 ? filters.grade.join(", ") : "Select grades"}
    </button>

    {open && (
      <div className="filter-dropdown">
        <ul className="filter-list">
          {gradeOptions.map((grade) => (
            <li key={grade} className="filter-list-item">
              <input
                type="checkbox"
                className="filter-checkbox"
                checked={filters.grade?.includes(grade) || false}
                onChange={() => toggleOption(grade)}
                id={`grade-${grade}`}
              />
              <label htmlFor={`grade-${grade}`} className="filter-label-text">
                {grade}
              </label>
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
  );
}

export default GradeMultiSelect;
