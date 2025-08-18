import React from "react";

export default function WorkerFilters({ filters, setFilters, trainingOptions, showDeletedOption }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div>
        <label>Trainings:</label>
        {trainingOptions.map(opt => (
          <label key={opt} style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={filters.trainings?.includes(opt) || false} onChange={e => {
              setFilters(f => ({ ...f, trainings: e.target.checked ? [...(f.trainings||[]), opt] : (f.trainings||[]).filter(x => x !== opt) }));
            }} /> {opt}
          </label>
        ))}
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
