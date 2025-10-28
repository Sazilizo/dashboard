import React, { useEffect } from "react";
import GradeMultiSelect from "./GradeMultiSelect";

const CATEGORY_OPTIONS = ["pr", "ww", "un"];

export default function StudentFilters({
  filters,
  setFilters,
  gradeOptions,
  sessionTypeOptions, // expect: [{ value, label }]
  groupByOptions,
  showDeletedOption,
}) {
  const currentCategories = Array.isArray(filters?.category) ? filters.category : [];
  const currentSessionTypes = Array.isArray(filters?.session_type) ? filters.session_type : [];

  // Normalize sessionTypeOptions to { value, label } objects for consistent rendering
  const normalizedSessionTypeOptions = (sessionTypeOptions || []).map(opt => {
    if (!opt && opt !== 0) return null;
    if (typeof opt === 'string') return { value: opt, label: String(opt) };
    if (typeof opt === 'object' && opt.value !== undefined) return opt;
    // fallback: try to coerce
    return { value: String(opt), label: String(opt) };
  }).filter(Boolean);

  const toggleCategory = (opt) => {
    setFilters(prev => {
      const existing = Array.isArray(prev.category) ? prev.category : [];
      const next = existing.includes(opt)
        ? existing.filter(c => c !== opt)
        : [...existing, opt];
      return { ...prev, category: next.length ? next : null };
    });
  };

  const toggleSessionType = (value) => {
    setFilters(prev => {
      const existing = Array.isArray(prev.session_type) ? prev.session_type : [];
      const next = existing.includes(value)
        ? existing.filter(s => s !== value)
        : [...existing, value];
      return { ...prev, session_type: next.length ? next : null };
    });
  };

  useEffect(() => {
    console.log("Session Type Options:", sessionTypeOptions);
  }, [sessionTypeOptions]);

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div className="mb-4">
        <GradeMultiSelect filters={filters} setFilters={setFilters} gradeOptions={gradeOptions} />
      </div>

      <div>
        <label>Session Type:</label>
        {normalizedSessionTypeOptions.map(opt => (
          <label key={opt.value} style={{ marginLeft: 8 }}>
            <input
              type="checkbox"
              checked={currentSessionTypes.includes(opt.value)}
              onChange={() => toggleSessionType(opt.value)}
            />{" "}
            {opt.label}
          </label>
        ))}
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
            <input
              type="checkbox"
              checked={filters.show_deleted || false}
              onChange={e => setFilters(f => ({ ...f, show_deleted: e.target.checked }))}
            />{" "}
            Show Deleted
          </label>
        </div>
      )}
    </div>
  );
}
