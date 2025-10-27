import React from "react";
import "../../styles/main.css";

export default function MealFilters({ filters, setFilters, typeOptions, dayOptions, monthOptions }) {
  return (
    <div className="filter-container" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div>
        <label className="filter-label">Meal Type:</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {typeOptions.map(opt => (
            <label key={opt} className="filter-label-text" style={{ marginLeft: 8, display: "flex", alignItems: "center", gap: 4 }}>
              <input 
                type="checkbox" 
                className="filter-checkbox"
                checked={filters.type?.includes(opt) || false} 
                onChange={e => {
                  setFilters(f => ({ ...f, type: e.target.checked ? [...(f.type||[]), opt] : (f.type||[]).filter(x => x !== opt) }));
                }} 
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="filter-label">Day:</label>
        <select 
          className="filter-button"
          value={filters.day || ""} 
          onChange={e => setFilters(f => ({ ...f, day: e.target.value }))}
        >
          <option value="">All</option>
          {dayOptions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <label className="filter-label">Month:</label>
        <select 
          className="filter-button"
          value={filters.month || ""} 
          onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}
        >
          <option value="">All</option>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
    </div>
  );
}
