import React from "react";

function EntityMultiSelect({ label = "Please Select", options = [], value, onChange }) {
  const safeValue = Array.isArray(value) ? value : value ? [value] : [];

  const handleToggle = (id) => {
    if (safeValue.includes(id)) {
      onChange(safeValue.filter((v) => v !== id));
    } else {
      onChange([...safeValue, id]);
    }
  };

  return (
    <div className="entity-multiselect mb-4 w-full">
      <h2 className="font-medium mb-2">{label}</h2>

      {/* Scrollable list with hidden scrollbar (visualless but scrollable) */}
      <div className="entity-multiselect-list">
        {options.map((opt) => (
          <label key={opt.id} className="block px-2 py-1 hover:bg-gray-50 rounded">
            <input
              type="checkbox"
              checked={safeValue.includes(opt.id)}
              onChange={() => handleToggle(opt.id)}
            />
            <span className="ml-2">{opt.full_name || opt.name || `ID: ${opt.id}`}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default EntityMultiSelect;
