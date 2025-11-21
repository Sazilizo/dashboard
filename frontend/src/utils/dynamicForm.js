import React, { useState, useEffect, use } from "react";
import api from "../api/client";
import JsonObjectField from "./JsonObjectField";
import StudentCheckboxDropdown from "./StudentCheckboxDropdown"; // <- Add import
import "../styles/dynamicForm.css";
export default function DynamicForm({
  model,
  schemaRoute,
  submitRoute,
  mode = "create",
  id = null,
  onSuccess,
  presetFields = {},
  endpoint,
  twoStepFileUpload = false,
  fileUploadRouteBuilder,
  loading: externalLoading = false,
  filters = {},
  students = [],
}) {
  const [schema, setSchema] = useState([]);
  const [formData, setFormData] = useState({});
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    const route = schemaRoute ?? submitRoute ?? model.toLowerCase() + "s";

    api
      .get(`/${route}/form_schema`, {
        params: { model: model.charAt(0).toUpperCase() + model.slice(1) },
      })
      .then((res) => {
        if (!isMounted) return;
        const fields = res.data.fields;
        setSchema(fields);

        const initFormData = {};
        const initFiles = {};
        fields.forEach((field) => {
          if (field.type === "file") initFiles[field.name] = null;
          else initFormData[field.name] = presetFields[field.name] ?? "";
        });
        setFormData(initFormData);
        setFiles(initFiles);
      })
      .catch(() => {
        if (!isMounted) return;
        setError("Failed to load form schema.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [model, schemaRoute]);

  const handleChange = (e) => {
    const { name, type, value, checked, files: fileInput } = e.target;
    if (type === "file") {
      setFiles((prev) => ({ ...prev, [name]: fileInput[0] }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const handleJsonObjectChange = (fieldName, val) => {
    setFormData((prev) => ({ ...prev, [fieldName]: val }));
  };

  const handleStudentIdsChange = (selectedIds) => {
    setFormData((prev) => ({ ...prev, student_ids: selectedIds }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 🛠 Patch: Ensure only one of student_id or student_ids is sent
      const cleanedFormData = { ...formData };
      if (cleanedFormData.student_ids?.length > 0) {
        delete cleanedFormData.student_id;
      } else if (!cleanedFormData.student_id) {
        delete cleanedFormData.student_id; // avoid sending empty string
      }

      if (cleanedFormData.user_id === "") {
        delete cleanedFormData.user_id;
      }

      if (twoStepFileUpload) {
        const nonFileData = {};
        Object.entries(cleanedFormData).forEach(([k, v]) => {
          if (!(k in files)) nonFileData[k] = v;
        });

        const route = submitRoute ?? endpoint ?? model.toLowerCase() + "s";
        const createUrl = `/${route}/${mode === "edit" ? id : "create"}`;
        const createRes = await api.post(createUrl, nonFileData);
        const createdItem = createRes.data[model.toLowerCase()] || createRes.data;

        const filesToUpload = {};
        Object.entries(files).forEach(([k, f]) => {
          if (f) filesToUpload[k] = f;
        });

        if (Object.keys(filesToUpload).length > 0) {
          if (typeof fileUploadRouteBuilder !== "function") {
            throw new Error("fileUploadRouteBuilder is required when using twoStepFileUpload");
          }

          const uploadUrl = fileUploadRouteBuilder(createdItem);
          const form = new FormData();
          Object.entries(filesToUpload).forEach(([k, f]) => {
            form.append(k, f);
          });

          console.log("uploaded form data:", form);


          await api.post(uploadUrl, form, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }

        if (onSuccess) onSuccess(createdItem);
      } else {
        const hasFileFields = schema.some((f) => f.type === "file");
        if (hasFileFields) {
  const formDataObj = new FormData();
  Object.entries(presetFields).forEach(([k, v]) =>
    formDataObj.append(k, v)
  );
  Object.entries(cleanedFormData).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      v.forEach((item) => {
        formDataObj.append(k, item);
        if (k === "student_id") {
        }
      });
    } else if (v && typeof v === "object") {
      formDataObj.append(k, JSON.stringify(v));
    } else {
      formDataObj.append(k, v);
    }
  });

  for (let pair of formDataObj.entries()) {
    console.log("Submitting", pair[0], pair[1]);
  }

  if (twoStepFileUpload) {
    Object.entries(files).forEach(([k, f]) => {
      if (f) formDataObj.append(k, f);
    });
  }

  const route = submitRoute ?? endpoint ?? model.toLowerCase() + "s";
  const url = `/${route}/${mode === "edit" ? id : "create"}`;
  console.log("Submitting to:", url, formDataObj);
  await api.post(url, formDataObj);
  if (onSuccess) onSuccess();

        } else {
          const dataToSend = { ...presetFields, ...cleanedFormData };
          const route = submitRoute ?? endpoint ?? model.toLowerCase() + "s";
          const url = `/${route}/${mode === "edit" ? id : "create"}`;
          await api.post(url, dataToSend, {
            headers: { "Content-Type": "application/json" },
          });
          if (onSuccess) onSuccess();
        }
      }
    } catch (err) {
      console.error("Submission failed:", err);
      setError(err.response?.data?.error || err.message || "Submission failed");
    } finally {
      setLoading(false);
    }
  };

  if (loading || externalLoading) return <p>Loading...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" encType="multipart/form-data">
      {schema.map((field) => {
        const isDisabled = presetFields.hasOwnProperty(field.name);
        if (field.name === "student_id" && field.type === "select") {
          return (
            <div key={field.name} className="flex flex-col">
              <label className="font-medium">
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
              </label>
              <p>Students dropdown?</p>
              <StudentCheckboxDropdown
                filters={filters}
                students={students}
                value={formData.student_id}
                onChange={handleStudentIdsChange}
              />
            </div>
          );
        }

        if (field.type === "checkbox") {
          return (
            <div key={field.name} className="flex flex-col">
              <label className="font-medium">
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="checkbox"
                name={field.name}
                checked={!!formData[field.name]}
                onChange={handleChange}
                disabled={isDisabled}
              />
            </div>
          );
        }

        if (field.type === "file") {
          return (
            <div key={field.name} className="flex flex-col">
              <label className="font-medium">
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="file"
                name={field.name}
                onChange={handleChange}
                accept="image/*,application/pdf"
                disabled={isDisabled}
              />
            </div>
          );
        }

        if (field.type === "json_object") {
          return (
            <JsonObjectField
              key={field.name}
              name={field.name}
              label={field.label}
              group={field.group}
              value={formData[field.name] || {}}
              max={100}
              onChange={handleJsonObjectChange}
            />
          );
        }

        return (
          <div key={field.name} className="flex flex-col">
            <label className="font-medium">
              {field.label}
              {field.required && <span className="text-red-500">*</span>}
            </label>
            <input
              type={field.type}
              name={field.name}
              value={formData[field.name] || ""}
              onChange={handleChange}
              required={field.required}
              disabled={isDisabled}
            />
          </div>
        );
      })}

      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        disabled={loading || externalLoading}
      >
        {mode === "edit" ? "Save Changes" : "Submit"}
      </button>
    </form>
  );
}

import { useAuth } from "../context/AuthProvider";
import FiltersPanel from "../components/filters/FiltersPanel";
import { useResourceFilters } from "../hooks/useResouceFilters";

export function DynamicFormForStudents({
  model,
  schemaRoute,
  submitRoute,
  mode = "create",
  id = null,
  onSuccess,
  presetFields = {},
  endpoint,
}) {
  const [schema, setSchema] = useState([]);
  const [formData, setFormData] = useState({});
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

   // access category, grade
  const { user } = useAuth(); // access user.id and user.name
  const {
      data,
      filters,
      setFilters,
      // loading,
      // error
    } = useResourceFilters("/students/list", {
      school_id: [user.school_id],
      // any default filters here
    });
  useEffect(() => {
    let mounted = true;
    const route = schemaRoute ?? submitRoute ?? model.toLowerCase() + "s";

    api.get(`/${route}/form_schema`, {
      params: { model: model.charAt(0).toUpperCase() + model.slice(1) },
    })
      .then((res) => {
        if (!mounted) return;
        const fields = res.data.fields;
        setSchema(fields);

        const initialData = {};
        const initialFiles = {};

        fields.forEach((field) => {
          if (field.type === "file") {
            initialFiles[field.name] = null;
          } else {
            initialData[field.name] = presetFields[field.name] ?? "";
          }
        });

        // Automatically fill in category from filter and user_id from auth
        if (filters?.category) initialData.category = filters.category;
        if (user?.id) initialData.user_id = user.id;

        setFormData(initialData);
        setFiles(initialFiles);
      })
      .catch(() => setError("Failed to load form schema"))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [model, schemaRoute, filters, user]);

  const handleChange = (e) => {
    const { name, type, value, checked, files: fileInput } = e.target;
    if (type === "file") {
      setFiles((prev) => ({ ...prev, [name]: fileInput[0] }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const handleJsonObjectChange = (name, val) => {
    setFormData((prev) => ({ ...prev, [name]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const form = new FormData();

      const combinedData = {
        ...presetFields,
        ...formData,
        category: filters?.category ?? formData.category,
        user_id: user?.id ?? formData.user_id,
      };

      if (
        (model === "PESession" || model === "AcademicSession") &&
        combinedData.student
      ) {
        combinedData.students = [combinedData.student];
        delete combinedData.student;
      }

      Object.entries(combinedData).forEach(([key, value]) => {
        if (typeof value === "object" && !Array.isArray(value)) {
          form.append(key, JSON.stringify(value));
        } else if (Array.isArray(value)) {
          value.forEach((v) => form.append(`${key}[]`, v));
        } else {
          form.append(key, value);
        }
      });

      Object.entries(files).forEach(([key, file]) => {
        if (file) form.append(key, file);
      });

      const route = schemaRoute ?? submitRoute ?? model.toLowerCase() + "s";
      const url = `/${route}/${mode === "edit" ? id : "create"}`;

      // const queryParams = {};
      // presetFields.forEach(({ key, value }) => {
      //   queryParams[key] = value;
      // });

      await api.post(url, form, {
        headers: { "Content-Type": "application/json" },
        params: presetFields, 
      });
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error("Submission error:", err);
      setError(err.response?.data?.error || err.message || "Submission failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log("form students", data);
  },[data])

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" encType="multipart/form-data">
      {schema.map((field) => {
        const disabled = field.name in presetFields;

        if (
          (model === "PESession" || model === "AcademicSession") &&
          field.name === "student" &&
          field.type === "select"
        ) {
          return (
            <div key="students" className="flex flex-col">
              <label className="font-medium">
                Students {field.required && <span className="text-red-500">*</span>}
              </label>
              <select
                name="students"
                multiple
                value={formData.students || []}
                onChange={(e) => {
                  const selected = Array.from(
                    e.target.selectedOptions,
                    (opt) => opt.value
                  );
                  setFormData((prev) => ({ ...prev, students: selected }));
                }}
              >
                {field.options.map((opt, idx) => {
                  const value = typeof opt === "object" ? opt.value : opt;
                  const label = typeof opt === "object" ? opt.label : String(opt);
                  return (
                    <option key={value ?? idx} value={value}>
                      {label} me too
                    </option>
                  );
                })}
              </select>
            </div>
          );
        }
        if (field.type === "array" && field.items?.type === "select") {
          return (
            <div key={key} className="form-group mb-4">
              <label className="form-label">{field.label}</label>
              <select
                multiple
                value={formData[key] || []}
                onChange={(e) => {
                  const options = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setFormData({ ...formData, [key]: options });
                }}
                className="form-control"
              >
                {(field.items?.options || []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} me
                  </option>
                ))}
              </select>
            </div>
          );
        }

        if (field.type === "select") {
          return (
            <div key={field.name} className="flex flex-col">
              <label className="font-medium">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              <select
                name={field.name}
                value={formData[field.name]}
                onChange={handleChange}
                required={field.required}
                disabled={disabled}
              >
                <option value="">Select...</option>
                {field.options.map((opt, idx) => {
                  const val = typeof opt === "object" ? opt.value : opt;
                  const lbl = typeof opt === "object" ? opt.label : String(opt);
                  return (
                    <option key={val ?? idx} value={val}>
                      {lbl}
                    </option>
                  );
                })}
              </select>
            </div>
          );
        }

        if (field.type === "checkbox") {
          return (
            <div key={field.name} className="flex flex-col">
              <label className="font-medium">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="checkbox"
                name={field.name}
                checked={!!formData[field.name]}
                onChange={handleChange}
                disabled={disabled}
              />
            </div>
          );
        }

        if (field.type === "file") {
          return (
            <div key={field.name} className="flex flex-col">
              <label className="font-medium">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="file"
                name={field.name}
                accept="image/*,application/pdf"
                onChange={handleChange}
                disabled={disabled}
              />
            </div>
          );
        }

        if (field.type === "json_object") {
          return (
            <JsonObjectField
              key={field.name}
              name={field.name}
              label={field.label}
              group={field.group}
              value={formData[field.name] || {}}
              max={100}
              onChange={handleJsonObjectChange}
            />
          );
        }

        return (
          <div key={field.name} className="flex flex-col">
            <label className="font-medium">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <input
              type={field.type}
              name={field.name}
              value={formData[field.name]}
              onChange={handleChange}
              required={field.required}
              disabled={disabled}
            />
          </div>
        );
      })}

      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        disabled={loading}
      >
        {mode === "edit" ? "Save Changes" : "Submit"}
      </button>
    </form>
  );
}