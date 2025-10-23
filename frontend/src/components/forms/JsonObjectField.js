import React from "react";

/**
 * JsonObjectField
 * Renders grouped numeric or text inputs based on a "group" definition in schema.
 * Example schema field:
 * {
 *   "name": "specs",
 *   "type": "json_object",
 *   "label": "Performance Specs",
 *   "group": [
 *     { "name": "reading", "label": "Reading", "type": "number", "max": 100 },
 *     { "name": "storytelling", "label": "Storytelling", "type": "number", "max": 100 }
 *   ]
 * }
 */

const JsonObjectField = ({ value = {}, onChange, group = [], max = 100 }) => {
  const handleInputChange = (key, val) => {
    let parsedVal = val;

    // Convert to number if numeric field
    const fieldDef = group.find((f) => f.name === key);
    if (fieldDef?.type === "number") {
      parsedVal = val === "" ? "" : Math.min(Number(val), max);
    }

    onChange({
      ...value,
      [key]: parsedVal,
    });
  };

  return (
    <div className="p-3 border rounded bg-gray-50">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {group.map((field) => (
          <div key={field.name} className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              {field.label}
            </label>
            <input
              type={field.type || "text"}
              value={value?.[field.name] ?? ""}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              className="border p-2 rounded"
              max={field.max || max}
              placeholder={field.label}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default JsonObjectField;
