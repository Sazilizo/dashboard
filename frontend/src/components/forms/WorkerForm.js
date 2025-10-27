import React, { useEffect, useState, useRef } from "react";
import { useSchools } from "../../context/SchoolsContext";
import api from "../../api/client";
import UploadFile from "../profiles/UploadHelper";
import RoleSelect from "../../hooks/RoleSelect";
import { queueMutation } from "../../utils/tableCache";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import { autoResizeTextarea } from "../../utils/autoResizeTextarea";

export default function WorkerForm() {
  const { schools } = useSchools();
  const { isOnline } = useOnlineStatus();
  const [fields, setFields] = useState([]);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRefs = useRef({});

  // Load Worker schema
  useEffect(() => {
    async function fetchSchema() {
      const { data, error } = await api
        .from("form_schemas")
        .select("schema")
        .eq("model_name", "Worker")
        .single();

      if (error) {
        setError("Failed to load form schema.");
        return;
      }

      // Extract fields array
      const schemaFields = (data.schema && data.schema.fields) || [];
      setFields(schemaFields);

      // Initialize formData
      const defaults = {};
      schemaFields.forEach((f) => {
        if (f.format === "file") defaults[f.name] = null;
        else if (f.type === "checkbox") defaults[f.name] = false;
        else defaults[f.name] = "";
      });
      setFormData(defaults);
    }
    fetchSchema();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === "checkbox") {
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else if (type === "file") {
      setFormData((prev) => ({ ...prev, [name]: files[0] || null }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
      // Auto-resize textarea on change
      if (e.target.tagName === 'TEXTAREA') {
        autoResizeTextarea(e.target);
      }
    }
  };

  const validateField = (field, value) => {
    if (field.required && !value) return `${field.label} is required.`;

    if (field.format === "email" && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) return "Invalid email address.";
    }

    if (field.name === "contact_number" && value) {
      const phoneRegex = /^0[678]\d{8}$/;
      if (!phoneRegex.test(value)) return "Contact number must be 10 digits starting with 0,6,7, or 8.";
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validate all fields
    for (const f of fields) {
      const err = validateField(f, formData[f.name]);
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }
    }

    try {
      // Build insert payload; keep files as blobs in the payload for queueing
      const insertData = {};
      fields.forEach((f) => {
        if (f.format !== "file") {
          insertData[f.name] =
            f.type === "number" ? Number(formData[f.name]) || null : formData[f.name] || null;
        } else {
          insertData[f.name] = formData[f.name] || null; // file blob or null
        }
      });

      if (isOnline) {
        // Online: upload like before
        const { data: insertedWorker, error: insertError } = await api
          .from("workers")
          .insert(insertData)
          .select()
          .single();

        if (insertError) throw insertError;

        const workerId = insertedWorker.id;

        // Upload files and update worker
        const fileUpdates = {};
        for (const f of fields) {
          if (f.format === "file" && formData[f.name]) {
            const url = await UploadFile(formData[f.name], "workers", workerId);
            fileUpdates[f.name] = url;
          }
        }

        if (Object.keys(fileUpdates).length > 0) {
          const { error: updateError } = await api
            .from("workers")
            .update(fileUpdates)
            .eq("id", workerId);
          if (updateError) throw updateError;
        }

        alert("Worker created successfully!");
      } else {
        // Offline: queue mutation (queueMutation will extract file blobs into FILE_STORE)
        await queueMutation("workers", "insert", insertData);
        alert("You are offline. The worker has been queued and will sync when back online.");
      }

      // Reset form
      const resetData = {};
      fields.forEach((f) => {
        if (f.format === "file") resetData[f.name] = null;
        else if (f.type === "checkbox") resetData[f.name] = false;
        else resetData[f.name] = "";
      });
      setFormData(resetData);
    } catch (err) {
      setError(err.message || "Failed to create worker.");
    } finally {
      setLoading(false);
    }
  };

  if (!fields.length) return <p>Loading form...</p>;

  return (
    <form onSubmit={handleSubmit}>
      {fields.map((f) => {
        let inputType = "text";
        if (f.format === "file") inputType = "file";
        else if (f.type === "number") inputType = "number";
        else if (f.name === "start_date" || f.name === "date_of_birth") inputType = "date";

        // School select
        if (f.format === "select" && f.foreign?.includes("schools")) {
          return (
            <div key={f.name}>
              <label>{f.label}</label>
              <select
                name={f.name}
                value={formData[f.name]}
                onChange={handleChange}
                required={f.required}
              >
                <option value="">Select a school</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        // Role select (assuming RoleSelect component exists)
        if (f.format === "select" && f.foreign?.includes("roles")) {
          return (
            <div key={f.name}>
              <label>{f.label}</label>
              <RoleSelect
                name={f.name}
                value={formData[f.name]}
                onChange={handleChange}
                required={f.required}
              />
            </div>
          );
        }

        // Textarea
        if (f.format === "textarea") {
          return (
            <div key={f.name}>
              <label>{f.label}</label>
              <textarea
                name={f.name}
                value={formData[f.name]}
                onChange={handleChange}
                required={f.required}
                ref={(el) => {
                  textareaRefs.current[f.name] = el;
                  if (el) autoResizeTextarea(el);
                }}
                data-auto-resize="true"
              />
            </div>
          );
        }

        // Default input
        return (
          <div key={f.name}>
            <label>{f.label}</label>
            <input
              type={inputType}
              name={f.name}
              value={f.format === "file" ? undefined : formData[f.name]}
              onChange={handleChange}
              required={f.required}
            />
          </div>
        );
      })}

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create Worker"}
      </button>
    </form>
  );
}

