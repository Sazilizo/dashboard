import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/client";
import RoleSelect from "../../hooks/RoleSelect";
import EntityMultiSelect from "../../hooks/EntityMultiSelect";
import UploadFile from "../profiles/UploadFile";
import { useSchools } from "../../context/SchoolsContext";
import { useAuth } from "../../context/AuthProvider";

export default function DynamicBulkForm({ schema_name, presetFields = {}, onSubmit, studentId, tutorOptions, coachOptions }) {
  const { id } = useParams();
  const { schools } = useSchools();
  const [schema, setSchema] = useState([]);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const calculateAge = (dobStr) => {
    if (!dobStr) return "";
    const today = new Date();
    const dob = new Date(dobStr);
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  };

  const parseIdNumberToDob = (idNumber) => {
    if (!idNumber || idNumber.length < 6) return "";
    const year = parseInt(idNumber.substring(0, 2), 10);
    const month = parseInt(idNumber.substring(2, 4), 10) - 1;
    const day = parseInt(idNumber.substring(4, 6), 10);
    const currentYear = new Date().getFullYear() % 100;
    const fullYear = year > currentYear ? 1900 + year : 2000 + year;
    return new Date(fullYear, month, day).toISOString().split("T")[0];
  };

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

      const defaults = {};
      fields.forEach((f) => {
        if (f.type === "json_object") {
          const groupDefaults = {};
          f.group.forEach((g) => {
            groupDefaults[g.key] = g.default ?? 0;
          });
          defaults[f.name] = { ...groupDefaults };
        } else if (f.type === "checkbox" || f.type === "boolean") {
          defaults[f.name] = false;
        } else if (f.type === "select" && f.multiple) {
          defaults[f.name] = id ? [id] : [];
        } else {
          defaults[f.name] = "";
        }
      });

      Object.assign(defaults, presetFields);
      if (id) defaults.school_id = Number(id)
      if (presetFields.category) defaults.category = presetFields.category;

      setFormData(defaults);
    }

    fetchSchema();
  }, [schema_name, presetFields, id]);

  const handleChange = (name, value) => {
    let updated = { ...formData, [name]: value };

    // handle is_fruit logic
    if (name === "is_fruit" && !value) {
      updated.fruit_type = "";
      updated.fruit_other_description = "";
    }

    if (name === "id_number" && value.length >= 6 && schema_name === "Worker") {
      const dob = parseIdNumberToDob(value);
      if (dob) {
        const age = calculateAge(dob);
        if (age < 18 || age > 60) {
          setError("Worker must be between 18 and 60 years old.");
        } else {
          updated.date_of_birth = dob;
          updated.age = age;
          setError(null);
        }
      }
    }

    if (name === "date_of_birth" && schema_name === "Student") {
      updated.age = calculateAge(value);
      if (updated.age < 2) setError("Student must be at least 2 years old.");
      else setError(null);
    }

    setFormData(updated);
  };

  const handleJsonObjectChange = (fieldName, key, value) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: { ...prev[fieldName], [key]: Number(value) }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = { ...formData };

      schema.forEach((f) => {
        if (f.type === "checkbox" || f.type === "boolean") {
          payload[f.name] = !!payload[f.name];
        }
      });
      if (schema_name == "Student") {
        payload.id = id;
      }else{
        payload.student_id = id || presetFields.student_id;
      }

      payload.category = presetFields.category || formData.category;
      payload.school_id = Number(presetFields.school_id) || Number(formData.school_id);

      await onSubmit(payload, id);

      // reset form
      const resetData = {};
      schema.forEach((f) => {
        if (f.type === "json_object") {
          const groupDefaults = {};
          f.group.forEach((g) => groupDefaults[g.key] = g.default ?? 0);
          resetData[f.name] = { ...groupDefaults };
        } else if (f.type === "checkbox" || f.type === "boolean") {
          resetData[f.name] = false;
        } else if (f.type === "select" && f.multiple) {
          resetData[f.name] = [];
        } else {
          resetData[f.name] = "";
        }
      });
      Object.assign(resetData, presetFields);
      setFormData(resetData);

    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to submit");
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field) => {
    if (field.name === "student_id") return null;

    if (field.name === "school_id") {
      return (
        <div key={field.name} className="mb-4">
          <label className="block font-medium">{field.label || "School"}</label>
          <select
            value={formData[field.name] || ""}
            onChange={(e) => handleChange(field.name, Number(e.target.value))}
            className="w-full p-2 border rounded"
          >
            <option value="">Select School...</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      );
    }
    if (field.name === "tutor_id") {
      const schoolId = formData.school_id;
      const filteredTutors = (tutorOptions || []).filter(
        (opt) => !schoolId || opt.school_id === Number(schoolId)
      );

      return (
        <div key={field.name} className="mb-4">
          <label className="block font-medium">{field.label || "Tutor"}</label>
          <select
            value={formData[field.name] || ""}
            onChange={(e) => handleChange("tutor_id", Number(e.target.value))}
            className="w-full p-2 border rounded"
          >
            <option value="">Select Tutor...</option>
            {filteredTutors.map((opt) => (
              
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.name === "coach_id") {
      const schoolId = formData.school_id;
      const filteredCoaches = (coachOptions || []).filter(
        (opt) => !schoolId || opt.school_id === Number(schoolId)
      );
      return (
        <div key={field.name} className="mb-4">
          <label className="block font-medium">{field.label || "Coach"}</label>
          <select
            value={formData[field.name] || ""}
            onChange={(e) => handleChange("coach_id", Number(e.target.value))}
            className="w-full p-2 border rounded"
          >
            <option value="">Select Coach...</option>
            {filteredCoaches.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }
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

    if (field.name === "age") {
      return (
        <div key={field.name} className="mb-4">
          <label className="block text-sm font-medium">{field.label}</label>
          <input
            type="number"
            value={formData[field.name] || ""}
            readOnly
            className="w-full p-2 border rounded bg-gray-100"
          />
        </div>
      );
    }

    if (field.name === "date_of_birth") {
      const today = new Date();
      let minDate = "";
      let maxDate = "";

      if (schema_name === "Student") {
        minDate = new Date(today.getFullYear() - 60, 0, 1).toISOString().split("T")[0];
        maxDate = new Date(today.getFullYear() - 2, 11, 31).toISOString().split("T")[0];
      } else if (schema_name === "Worker") {
        minDate = new Date(today.getFullYear() - 60, 0, 1).toISOString().split("T")[0];
        maxDate = new Date(today.getFullYear() - 18, 11, 31).toISOString().split("T")[0];
      }

      return (
        <div key={field.name} className="mb-4">
          <label className="block text-sm font-medium">{field.label}</label>
          <input
            type="date"
            value={formData[field.name] || ""}
            onChange={(e) => handleChange(field.name, e.target.value)}
            min={minDate}
            max={maxDate}
            className="w-full p-2 border rounded"
          />
        </div>
      );
    }

    // Fruit logic
    if (field.name === "is_fruit") {
      return (
        <div key={field.name} className="mb-4">
          <label className="block font-medium mb-2">{field.label}</label>
          <select
            value={formData[field.name] || false}
            onChange={(e) => handleChange(field.name, e.target.value === "true")}
            className="w-full p-2 border rounded"
          >
            <option value="false">False</option>
            <option value="true">True</option>
          </select>
        </div>
      );
    }

    if ((field.name === "fruit_type" || field.name === "fruit_other_description") && !formData.is_fruit) {
      return null;
    }

    // rest of field rendering (select, json_object, file, checkbox, default)
    switch (field.type) {
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
        const jsonValues = formData[field.name] || {};
        return (
          <div key={field.name}>
            <label>{field.label}</label>
            {field.group.map((g) => (
              <div key={g.name}>
                <label>{g.label}</label>
                <input
                  type="number"
                  min={g.min ?? 0}
                  max={g.max ?? 100}
                  value={jsonValues[g.name]}
                  onChange={(e) => handleJsonObjectChange(field.name, g.name, e.target.value)}
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
            id={studentId || id}
            accept="image/*,.pdf"
          />
        );
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
                  {opt.label || opt}
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
        {loading ? "Saving..." : id ? "Save Record" : "Submit"}
      </button>
    </form>
  );
}
