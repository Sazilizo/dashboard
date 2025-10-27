import React from "react";
import "../../styles/main.css";

export default function WorkerFilters({ filters, setFilters, trainingOptions, showDeletedOption }) {
  return (
    <div className="filter-container" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div>
        <label className="filter-label">Trainings:</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {trainingOptions.map(opt => (
            <label key={opt} className="filter-label-text" style={{ marginLeft: 8, display: "flex", alignItems: "center", gap: 4 }}>
              <input 
                type="checkbox" 
                className="filter-checkbox"
                checked={filters.trainings?.includes(opt) || false} 
                onChange={e => {
                  setFilters(f => ({ ...f, trainings: e.target.checked ? [...(f.trainings||[]), opt] : (f.trainings||[]).filter(x => x !== opt) }));
                }} 
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </div>
      {showDeletedOption && (
        <div>
          <label className="filter-label-text" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input 
              type="checkbox" 
              className="filter-checkbox"
              checked={filters.show_deleted || false} 
              onChange={e => setFilters(f => ({ ...f, show_deleted: e.target.checked }))} 
            />
            <span>Show Deleted</span>
          </label>
        </div>
      )}
    </div>
  );
}
