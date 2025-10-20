import React, { useState, useEffect, useRef } from "react";

const StudentChartFilters = ({ filters, onChange }) => {
  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];
  const years = [2023, 2024, 2025];
  const sessions = ["all", "academic", "pe"];

  return (
    <div className="dropdown-chart-filters">
      <MultiSelectDropdown
        label="Months"
        options={months}
        selected={filters.months || []}
        onChange={(months) => onChange({ ...filters, months })}
      />

      <select
        value={filters.year}
        onChange={(e) => onChange({ ...filters, year: Number(e.target.value) })}
        className="border rounded-lg px-3 py-2"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <select
        value={filters.session}
        onChange={(e) => onChange({ ...filters, session: e.target.value })}
        className="border rounded-lg px-3 py-2"
      >
        {sessions.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
};

const MultiSelectDropdown = ({ label, options, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (value) => {
    if (!selected) return;
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const displayText = (selected && selected.length > 0)
    ? selected.join(", ")
    : `Select ${label}`;

  return (
    <div className="relative w-48" ref={ref}>
      {/* Input box */}
      <div
        className="border rounded-lg px-3 py-2 cursor-pointer bg-white"
        onClick={() => setOpen(!open)}
      >
        {displayText}
      </div>

      {/* Dropdown list */}
      {open && (
        <div className="dropdown-chart-filters-list absolute z-10">
          {options.map((option) => (
            <label key={option} className="dropdown-chart-filters-item">
              <input
                type="checkbox"
                checked={selected?.includes(option)}
                onChange={() => toggleOption(option)}
                className="form-checkbox"
              />
              {option}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentChartFilters;
