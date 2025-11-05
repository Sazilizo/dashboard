import React, { useEffect, useState } from "react";
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

  // Track small screen to adapt grade overlay sizing
  const [isSmallScreen, setIsSmallScreen] = useState(typeof window !== 'undefined' ? window.innerWidth <= 640 : false);
  useEffect(() => {
    const onResize = () => setIsSmallScreen(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: 'flex-start' }}>
      <div className="mb-4" style={{ display: 'inline-block', position: 'relative' }}>
        {/* Grade multi-select wrapper: on small screens constrain overlay by sizing this container */}
        <div style={isSmallScreen ? { width: '80vw', height: '60vh', maxWidth: '100%', overflow: 'auto' } : {}}>
          <GradeMultiSelect filters={filters} setFilters={setFilters} gradeOptions={gradeOptions} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontWeight: 600, marginBottom: 6 }}>Session Type:</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {normalizedSessionTypeOptions.map(opt => (
              <label key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 6 }}>
                <input
                  type="checkbox"
                  checked={currentSessionTypes.includes(opt.value)}
                  onChange={() => toggleSessionType(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontWeight: 600, marginBottom: 6 }}>Category:</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {CATEGORY_OPTIONS.map(opt => (
              <label key={opt} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={filters.show_deleted || false}
                onChange={e => setFilters(f => ({ ...f, show_deleted: e.target.checked }))}
              />
              <span>Show Deleted</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
