import React, { useState, useEffect } from "react";
import GradeMultiSelect from "./GradeMultiSelect";

const CATEGORY_OPTIONS = ["pr", "ww", "un"];


export default function StudentFilters({ filters, setFilters, gradeOptions, sessionTypeOptions, groupByOptions, showDeletedOption }) {

  const currentCategories = Array.isArray(filters?.category) ? filters?.category : [];

  const toggleCategory = (opt) => {
    setFilters(prev => {
      const existing = Array.isArray(prev.category) ? prev.category : [];
      const next = existing.includes(opt) ? existing.filter(c => c !== opt) : [...existing, opt];
      return { ...prev, category: next.length ? next : null }; // null when empty (or keep [] if you prefer)
    });
  };
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div className="mb-4">
          <GradeMultiSelect filters={filters} setFilters={setFilters} gradeOptions={gradeOptions} />
      </div>

      <div>
        <label>Session Type:</label>
        {sessionTypeOptions.map(opt => {
          return (
          <label key={opt} style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={filters.session?.includes(opt) || false} onChange={e => {
              setFilters(f => ({ ...f, session: e.target.checked ? [...(f.session||[]), opt] : (f.session||[]).filter(x => x !== opt) }));
            }} /> {opt}
          </label>
)})}
      </div>
      <div>
        <label style={{ display: "block", fontWeight: 600 }}>Category:</label>
        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
          {CATEGORY_OPTIONS.map(opt => (
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={currentCategories.includes(opt)}
                onChange={() => toggleCategory(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </div>
      {showDeletedOption && (
        <div>
          <label>
            <input type="checkbox" checked={filters.show_deleted || false} onChange={e => setFilters(f => ({ ...f, show_deleted: e.target.checked }))} /> Show Deleted
          </label>
        </div>
      )}
    </div>
  );
}
