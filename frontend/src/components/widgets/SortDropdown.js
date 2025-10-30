import React from "react";

export default function SortDropdown({ options, value, order, onChange, onOrderChange }) {
  return (
    <div className="sort-dropdown" style={{ display: "inline-flex", marginLeft: 16 }}>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        className="app-btn app-btn-secondary"
        style={{ marginLeft: 8 }}
        onClick={() => onOrderChange(order === "asc" ? "desc" : "asc")}
      >
        {order === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}