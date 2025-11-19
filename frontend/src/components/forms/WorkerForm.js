import React, { useEffect, useState, useRef } from "react";
import { useSchools } from "../../context/SchoolsContext";
import { useData } from "../../context/DataContext";
import api from "../../api/client";
import UploadFileHelper from "../profiles/UploadHelper";
import { queueMutation } from "../../utils/tableCache";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import { autoResizeTextarea } from "../../utils/autoResizeTextarea";
import useToast from "../../hooks/useToast";
import ToastContainer from "../ToastContainer";
import Loader from "../widgets/Loader";
import '../../styles/formStyles.css'

export default function WorkerForm() {
  const { schools } = useSchools();
  const { roles } = useData();
  const { isOnline } = useOnlineStatus();
  const [fields, setFields] = useState([]);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [draftValues, setDraftValues] = useState(null);
  const textareaRefs = useRef({});
  const { toasts, showToast, removeToast } = useToast();
  const autosaveTimeoutRef = useRef(null);

  // Debug: Log roles whenever they change
  useEffect(() => {
    console.log('[WorkerForm] Roles from context:', roles);
  }, [roles]);

  // Development-only soft-refresh trigger for debugging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      if (typeof window.softRefresh !== 'function' && typeof window.refreshCache === 'function') {
        // provide softRefresh via refreshCache if not present
        window.softRefresh = async (opts) => {
          try {
            return await window.refreshCache();
          } catch (err) {
            console.warn('[WorkerForm] softRefresh fallback failed', err);
            return false;
          }
        };
      }
    }
  }, []);

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
                  // Check for autosaved draft but do not auto-apply it
                  try {
                    const userId = (typeof window !== 'undefined' && window.__USER_ID__) || (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('user_id')) || 'anon';
                    const autosaveKey = `form-autosave:Worker:${userId}:${typeof window !== 'undefined' ? window.location.pathname : 'unknown'}`;
                    const saved = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem(autosaveKey) || 'null') : null;
                    if (saved && saved.values) {
                      setDraftAvailable(true);
                      setDraftValues(saved.values);
                    }
                  } catch (err) {
                    // ignore
                  }
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

  // Autosave formData to sessionStorage (debounced)
  useEffect(() => {
    if (!fields || fields.length === 0) return;

    try {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = setTimeout(() => {
        try {
          const userId = (typeof window !== 'undefined' && window.__USER_ID__) || (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('user_id')) || 'anon';
          const autosaveKey = `form-autosave:Worker:${userId}:${typeof window !== 'undefined' ? window.location.pathname : 'unknown'}`;
          const payload = { ts: Date.now(), values: formData };
          sessionStorage.setItem(autosaveKey, JSON.stringify(payload));
        } catch (err) {
          // ignore
        }
      }, 700);
    } catch (err) {
      // ignore
    }

    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    };
  }, [formData, fields]);

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
        // Online: insert base data first, then upload compressed files
        const baseData = {};
        fields.forEach((f) => {
          if (f.format !== "file") {
            baseData[f.name] =
              f.type === "number" ? Number(formData[f.name]) || null : formData[f.name] || null;
          }
        });

        const { data: insertedWorker, error: insertError } = await api
          .from("workers")
          .insert(baseData)
          .select()
          .single();

        if (insertError) throw insertError;

        const workerId = insertedWorker.id;

        // Upload and compress files, then update worker with URLs
        const fileUpdates = {};
        for (const f of fields) {
          if (f.format === "file" && formData[f.name]) {
            const url = await UploadFileHelper(formData[f.name], "workers", workerId);
            if (url) {
              fileUpdates[f.name] = url;
            }
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
      // Clear any saved draft after successful submit
      try {
        const userId = (typeof window !== 'undefined' && window.__USER_ID__) || (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('user_id')) || 'anon';
        const autosaveKey = `form-autosave:Worker:${userId}:${typeof window !== 'undefined' ? window.location.pathname : 'unknown'}`;
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(autosaveKey);
        setDraftAvailable(false);
        setDraftValues(null);
      } catch (err) { /* ignore */ }
    } catch (err) {
      setError(err.message || "Failed to create worker.");
    } finally {
      setLoading(false);
    }
  };

  if (!fields.length) return <Loader variant="bars" size="large" text="Loading form..." />;
  const restoreDraft = () => {
    try {
      const defaults = {};
      fields.forEach((f) => {
        if (f.format === "file") defaults[f.name] = null;
        else if (f.type === "checkbox") defaults[f.name] = false;
        else defaults[f.name] = "";
      });
      const merged = { ...defaults, ...(draftValues || {}) };
      setFormData(merged);
      setDraftAvailable(false);
      setDraftValues(null);
    } catch (err) {
      console.warn('[WorkerForm] restoreDraft failed', err);
    }
  };

  const dismissDraft = () => {
    try {
      const userId = (typeof window !== 'undefined' && window.__USER_ID__) || (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('user_id')) || 'anon';
      const autosaveKey = `form-autosave:Worker:${userId}:${typeof window !== 'undefined' ? window.location.pathname : 'unknown'}`;
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(autosaveKey);
    } catch (err) { /* ignore */ }
    setDraftAvailable(false);
    setDraftValues(null);
  };

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="form-wrapper">
        {draftAvailable && (
          <div className="draft-banner" style={{ marginBottom: 12, padding: 10, background: '#fff7cc', borderLeft: '4px solid #f6c342', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: '#7a5800', fontSize: 14 }}>Recovered unsaved draft available for this form.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={restoreDraft}>Restore Draft</button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={dismissDraft}>Dismiss</button>
            </div>
          </div>
        )}
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
      </div>
    </>
  );
}

