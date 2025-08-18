import React from "react";

export default function MealFilters({ filters, setFilters, typeOptions, dayOptions, monthOptions }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div>
        <label>Meal Type:</label>
        {typeOptions.map(opt => (
          <label key={opt} style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={filters.type?.includes(opt) || false} onChange={e => {
              setFilters(f => ({ ...f, type: e.target.checked ? [...(f.type||[]), opt] : (f.type||[]).filter(x => x !== opt) }));
            }} /> {opt}
          </label>
        ))}
      </div>
      <div>
        <label>Day:</label>
        <select value={filters.day || ""} onChange={e => setFilters(f => ({ ...f, day: e.target.value }))}>
          <option value="">All</option>
          {dayOptions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <label>Month:</label>
        <select value={filters.month || ""} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}>
          <option value="">All</option>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
    </div>
  );
}
