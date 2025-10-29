import React, { useEffect, useState, useRef } from "react";
import { useSchools } from "../../context/SchoolsContext";
import { useData } from "../../context/DataContext";
import api from "../../api/client";
import UploadFile from "../profiles/UploadHelper";
import { queueMutation } from "../../utils/tableCache";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import { autoResizeTextarea } from "../../utils/autoResizeTextarea";
import useToast from "../../hooks/useToast";
import ToastContainer from "../ToastContainer";
import Loader from "../widgets/Loader";

export default function WorkerForm() {
  const { schools } = useSchools();
  const { roles } = useData();
  const { isOnline } = useOnlineStatus();
  const [fields, setFields] = useState([]);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRefs = useRef({});
  const { toasts, showToast, removeToast } = useToast();

  // Debug: Log roles whenever they change
  useEffect(() => {
    console.log('[WorkerForm] Roles from context:', roles);
  }, [roles]);

  // Load Worker schema
  useEffect(() => {
    async function fetchSchema() {
      try {
        // Try to get from cache first when offline
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          try {
            const { getTable } = await import("../../utils/tableCache");
            const cached = await getTable("form_schemas");
            const schemaData = cached?.find(s => s.model_name === "Worker");
            
            if (schemaData) {
              const schemaFields = (schemaData.schema && schemaData.schema.fields) || [];
              setFields(schemaFields);

              // Initialize formData
              const defaults = {};
              schemaFields.forEach((f) => {
                if (f.format === "file") defaults[f.name] = null;
                else if (f.type === "checkbox") defaults[f.name] = false;
                else defaults[f.name] = "";
              });
              setFormData(defaults);
              console.log('[WorkerForm] Using cached schema');
              return;
            }
          } catch (cacheErr) {
            console.warn('[WorkerForm] Cache read failed:', cacheErr);
          }
        }

        // Fetch from network
        const { data, error, fromCache } = await api
          .from("form_schemas")
          .select("schema, model_name")
          .eq("model_name", "Worker")
          .single();

        if (error) {
          // Try cache as fallback even when online
          try {
            const { getTable } = await import("../../utils/tableCache");
            const cached = await getTable("form_schemas");
            const schemaData = cached?.find(s => s.model_name === "Worker");
            
            if (schemaData) {
              const schemaFields = (schemaData.schema && schemaData.schema.fields) || [];
              setFields(schemaFields);

              // Initialize formData
              const defaults = {};
              schemaFields.forEach((f) => {
                if (f.format === "file") defaults[f.name] = null;
                else if (f.type === "checkbox") defaults[f.name] = false;
                else defaults[f.name] = "";
              });
              setFormData(defaults);
              console.log('[WorkerForm] Recovered from cache after error');
              return;
            }
          } catch (cacheErr) {
            console.warn('[WorkerForm] Cache fallback failed:', cacheErr);
          }
          
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

        // Cache the schema for offline use (cache all schemas, not just Worker)
        if (!fromCache) {
          try {
            const { cacheTable } = await import("../../utils/tableCache");
            const { data: allSchemas } = await api.from("form_schemas").select("*");
            if (allSchemas) {
              await cacheTable("form_schemas", allSchemas);
              console.log('[WorkerForm] Cached form schemas for offline use');
            }
          } catch (cacheErr) {
            console.warn('[WorkerForm] Failed to cache schemas:', cacheErr);
          }
        }
      } catch (err) {
        console.error('[WorkerForm] Schema fetch failed:', err);
        setError("Failed to load form schema.");
      }
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

        showToast("Worker created successfully!", "success");
      } else {
        // Offline: queue mutation (queueMutation will extract file blobs into FILE_STORE)
        await queueMutation("workers", "insert", insertData);
        showToast("You are offline. The worker has been queued and will sync when back online.", "info");
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

  if (!fields.length) return <Loader variant="bars" size="large" text="Loading form..." />;

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
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

        // Role select
        if (f.format === "select" && f.foreign?.includes("roles")) {
          console.log('[WorkerForm] Rendering role select with', roles.length, 'roles');
          return (
            <div key={f.name}>
              <label>{f.label}</label>
              <select
                name={f.name}
                value={formData[f.name]}
                onChange={handleChange}
                required={f.required}
              >
                <option value="">Select a role</option>
                {roles && roles.length > 0 ? (
                  roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))
                ) : (
                  <option disabled>Loading roles...</option>
                )}
              </select>
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
    </>
  );
}

