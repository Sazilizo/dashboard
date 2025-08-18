import React, { useState, useEffect } from "react";

const JsonObjectField = ({ name, label, group = [], onChange, value = {}, max = 100 }) => {
  const [fields, setFields] = useState({});

  useEffect(() => {
    // Initialize from prop value if present
    if (value && typeof value === "object") {
      setFields(value);
    }
  }, [value]);

  const handleFieldChange = (key, val) => {
    let intVal = parseInt(val, 10);
    if (isNaN(intVal)) intVal = "";

    if (intVal > max) intVal = max;

    const updated = {
      ...fields,
      [key]: intVal
    };

    setFields(updated);
    onChange(name, updated);
  };

  return (
    <div className="form-group">
      <label>{label}</label>
      <div style={{ paddingLeft: "1rem" }}>
        {group.map(({ key, label: fieldLabel }) => (
          <div key={key} style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${name}-${key}`} style={{ marginRight: "0.5rem" }}>
              {fieldLabel}
            </label>
            <input
              id={`${name}-${key}`}
              type="number"
              className="form-control"
              value={fields[key] ?? ""}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              max={max}
              min={0}
              step={1}
              style={{ width: "100px", display: "inline-block" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default JsonObjectField;
