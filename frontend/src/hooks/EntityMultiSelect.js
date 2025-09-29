import React from "react";

function EntityMultiSelect({ label = "Please Select", options, value, onChange }) {
  const safeValue = Array.isArray(value) ? value : value ? [value] : [];

  const handleToggle = (id) => {
    if (safeValue.includes(id)) {
      onChange(safeValue.filter((v) => v !== id));
    } else {
      onChange([...safeValue, id]);
    }
  };

  return (
    <div className="entity-multiselect mb-4">
      <h2 className="font-medium mb-2">{label}</h2>
      {options.map((opt) => (
        <label key={opt.id} className="block">
          <input
            type="checkbox"
            checked={safeValue.includes(opt.id)}
            onChange={() => handleToggle(opt.id)}
          />
          <span className="ml-2">{opt.full_name || opt.name || `ID: ${opt.id}`}</span>
        </label>
      ))}
    </div>
  );
}

export default EntityMultiSelect;
