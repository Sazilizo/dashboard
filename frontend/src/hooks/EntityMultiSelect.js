import React from "react";

function EntityMultiSelect({ options, value, onChange }) {
  const safeValue = Array.isArray(value) ? value : value ? [value] : [];

  const handleToggle = (id) => {
    console.log("student id", id);
    console.log("current value", safeValue);
    if (safeValue.includes(id)) {
      onChange(safeValue.filter(v => v !== id));
    } else {
      onChange([...safeValue, id]);
    }
  };

  return (
    <div className="student-multiselect">
      <h2>Please Select</h2>
      {options.map(opt => (
        <label key={opt.id} style={{ display: "block" }}>
          <input
            type="checkbox"
            checked={safeValue.includes(opt.id)}
            onChange={() => handleToggle(opt.id)}
          />
          {opt.full_name || opt.name}
        </label>
      ))}
    </div>
  );
}

export default EntityMultiSelect