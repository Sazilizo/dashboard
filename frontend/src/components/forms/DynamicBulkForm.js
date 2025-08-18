import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/client";
import RoleSelect from "../../hooks/RoleSelect";
import EntityMultiSelect from "../../hooks/EntityMultiSelect";
import UploadFile from "../profiles/UploadFile"; // ✅ UI file input

export default function DynamicBulkForm({ schema_name, presetFields = {}, onSubmit } ) {
  const { id } = useParams(); // single mode if present
  const [schema, setSchema] = useState([]);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 🔹 fetch schema + defaults
  useEffect(() => {
    if (!schema_name) return;

    async function fetchSchema() {
      const { data: schemaData, error: schemaError } = await api
        .from("form_schemas")
        .select("schema")
        .eq("model_name", schema_name)
        .single();

      if (schemaError) {
        setError("Failed to load form schema.");
        return;
      }

      const fields = schemaData.schema?.fields || [];
      setSchema(fields);

      // build defaults
      const defaults = {};
      fields.forEach((f) => {
        if (f.type === "json_object") {
          const groupDefaults = {};
          f.group.forEach((g) => (groupDefaults[g.key] = 0));
          defaults[f.name] = groupDefaults;
        } else if (f.type === "checkbox" || f.type === "boolean") {
          defaults[f.name] = false; // always boolean
        } else if (f.type === "select" && f.multiple) {
          defaults[f.name] = id ? [id] : [];
        } else defaults[f.name] = "";
      });

      // Inject preset fields and student info
      Object.assign(defaults, presetFields);
      if (id) defaults.student_id = id;
      if (presetFields.category) defaults.category = presetFields.category;

      setFormData(defaults);
    }

    fetchSchema();
  }, [schema_name, presetFields, id]);



  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  const handleJsonObjectChange = (fieldName, key, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: { ...prev[fieldName], [key]: Number(value) }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Normalize booleans before sending
      const payload = { ...formData };
      schema.forEach((f) => {
        if (f.type === "checkbox" || f.type === "boolean") {
          payload[f.name] = !!payload[f.name];
        }
      });

      // Always include student_id & category silently
      payload.student_id = id || presetFields.student_id;
      payload.category = presetFields.category || formData.category;

      await onSubmit(payload, id);
      setFormData({});
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to submit");
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field) => {
    // Hide student_id & category (always injected)
    if (field.name === "student_id" || field.name === "category") return null;

    if (field.readOnly) {
      return (
        <div key={field.name} className="mb-4">
          <label className="block text-sm font-medium">{field.label}</label>
          <input
            type="text"
            value={presetFields[field.name] || ""}
            readOnly
            className="w-full p-2 border rounded bg-gray-100"
          />
        </div>
      );
    }

    if (field.name === "accredited") {
      return (
        <div key={field.name} className="mb-4">
          <label className="block font-medium">{field.label}</label>
          <select
            value={formData[field.name] ?? "false"}
            onChange={(e) => handleChange(field.name, e.target.value === "true")}
            className="w-full p-2 border rounded"
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </div>
      );
    }

    switch (field.type) {
      case "role_select":
        return (
          <RoleSelect
            key={field.name}
            value={formData[field.name]}
            onChange={(val) => handleChange(field.name, val)}
          />
        );

      case "multi_select":
        return (
          <EntityMultiSelect
            key={field.name}
            label={field.label}
            value={formData[field.name]}
            options={field.options || []}
            onChange={(val) => handleChange(field.name, val)}
          />
        );

      case "json_object":
        return (
          <div key={field.name}>
            <label>{field.label}</label>
              {field.group.map(g => (
                <div key={g.name}>
                   <label>{g.label}</label>
                  <input
                    type="number"
                    min={g.min ?? 0}
                    max={g.max ?? 100}
                    value={formData[field.name][g.name]}
                    onChange={e =>
                      handleJsonObjectChange(field.name, g.name, e.target.value)
                    }
                    required
                  />
                </div>
              ))}
            </div>
      );

      case "file":
        return (
          <UploadFile
            key={field.name}
            label={field.label}
            value={formData[field.name]}
            onChange={(val) => handleChange(field.name, val)}
            folder="students"
            id={id || "temp"}
            accept="image/*,.pdf"
          />
        );

      // case "json_object":
      //   return (
      //     <div key={field.name} className="mb-4">
      //       <label className="block font-medium">{field.label}</label>
      //       <div className="grid grid-cols-2 gap-2">
      //         {field.group.map((g) => (
      //           <input
      //             key={g.key}
      //             type="number"
      //             min="0"
      //             max="100"
      //             placeholder={g.label}
      //             value={formData[field.name]?.[g.key] || ""}
      //             onChange={(e) =>
      //               handleChange(field.name, {
      //                 ...formData[field.name],
      //                 [g.key]: e.target.value,
      //               })
      //             }
      //             className="p-2 border rounded"
      //           />
      //         ))}
      //       </div>
      //     </div>
      //   );

      case "select":
        return (
          <div key={field.name} className="mb-4">
            <label className="block font-medium">{field.label}</label>
            <select
              multiple={field.multiple}
              value={formData[field.name] || (field.multiple ? [] : "")}
              onChange={(e) =>
                handleChange(
                  field.name,
                  field.multiple
                    ? Array.from(e.target.selectedOptions, (opt) => opt.value)
                    : e.target.value
                )
              }
              className="w-full p-2 border rounded"
            >
              <option value="">Select...</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );

      case "checkbox":
        return (
          <div key={field.name} className="mb-4 flex items-center">
            <input
              type="checkbox"
              checked={!!formData[field.name]}
              onChange={(e) => handleChange(field.name, e.target.checked)}
              className="mr-2"
            />
            <label>{field.label}</label>
          </div>
        );

      default:
        return (
          <div key={field.name} className="mb-4">
            <label className="block text-sm font-medium">{field.label}</label>
            <input
              type={field.type || "text"}
              value={formData[field.name] || ""}
              onChange={(e) => handleChange(field.name, e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-white rounded shadow-md">
      {error && <p className="text-red-500">{error}</p>}
      {schema.map(renderField)}
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        {loading ? "Saving..." : id ? "Save Record" : "Submit Bulk"}
      </button>
    </form>
  );
}
