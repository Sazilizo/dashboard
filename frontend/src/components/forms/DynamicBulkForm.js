import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useForm, Controller, useWatch } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import UploadFile from "../profiles/UploadFile";
import JsonObjectField from "../forms/JsonObjectField";
import { useSchools } from "../../context/SchoolsContext";
import api from "../../api/client";
import { getTable, cacheTable } from "../../utils/tableCache";

// Grade regex & transform
const gradeRegex = /^(R[1-4]|[1-7][A-D])$/;
const gradeTransform = (v) => v?.toUpperCase().trim() || "";

// Calculate age from DOB
const calculateAge = (dobStr) => {
  if (!dobStr) return "";
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

export default function DynamicBulkFormRHF({
  schema_name,
  presetFields = {},
  onSubmit,
  roles = [],
  categories: catOptions = ["ww", "pr", "un"],
  raceOptions = ["black", "white", "coloured", "indian"],
  genderOptions = ["male", "female"],
  schoolIds = [],
  isOnline,
  // accept externally-provided options so parent can control fetching
  tutorOptions: externalTutorOptions = [],
  coachOptions: externalCoachOptions = [],
  studentId: externalRecordId,
  folder: folderProp,
}) {
  const { id } = useParams();
  const { schools } = useSchools();

  const [tutorOptions, setTutorOptions] = useState([]);
  const [coachOptions, setCoachOptions] = useState([]);
  const [schema, setSchema] = useState([]);
  const [formSchema, setFormSchema] = useState(null);
  const [loading, setLoading] = useState(false);

  // ---------------------- BUILD DEFAULTS & VALIDATION ----------------------
  const buildDefaultsAndSchema = (fields) => {
    const defaultValues = {};
    const shape = {};

    fields.forEach((f) => {
      if (f.type === "checkbox" || f.type === "boolean")
        defaultValues[f.name] = false;
      else if (f.type === "select" && f.multiple)
        defaultValues[f.name] = [];
      else if (f.type === "json_object") defaultValues[f.name] = {};
      else defaultValues[f.name] = "";

      if (f.name === "grade") {
        shape[f.name] = yup
          .string()
          .transform(gradeTransform)
          .required("Grade is required")
          .matches(
            gradeRegex,
            "Grade must be R1–R4 or 1A–7D. Only letters A–D allowed."
          );
      } else if (f.name === "age") {
        shape[f.name] = yup
          .number()
          .required("Age is required")
          .min(4, "Too young")
          .max(20, "Too old");
      } else if (f.name === "year") {
        shape[f.name] = yup
          .number()
          .required("Year is required")
          .min(2015, "Year too early")
          .max(new Date().getFullYear(), "Year too high");
      } else if (f.type === "text" && f.required) {
        shape[f.name] = yup.string().required(`${f.label} is required`);
      } else if (f.type === "select" && f.required) {
        shape[f.name] = yup.string().required(`Please select ${f.label}`);
      } else if (f.type === "checkbox" && f.required) {
        shape[f.name] = yup
          .boolean()
          .oneOf([true], `${f.label} must be checked`);
      } else if (f.type === "number") {
        let validator = yup.number();
        if (f.min) validator = validator.min(f.min);
        if (f.max) validator = validator.max(f.max);
        if (f.required)
          validator = validator.required(`${f.label} is required`);
        shape[f.name] = validator;
      }
    });

    return [defaultValues, yup.object().shape(shape)];
  };

  // ---------------------- LOAD SCHEMA ----------------------
  useEffect(() => {
    if (!schema_name) return;

    async function fetchSchema() {
      try {
        const { data, error } = await api
          .from("form_schemas")
          .select("schema")
          .eq("model_name", schema_name)
          .single();

        if (error) throw error;
        const fields = data?.schema?.fields || [];

        setSchema(fields);
        const [defaults, yupSchema] = buildDefaultsAndSchema(fields);
        reset({ ...defaults, ...presetFields });
        setFormSchema(yupSchema);
      } catch (err) {
        console.error("Failed to load schema:", err);
      }
    }

    fetchSchema();
  }, [schema_name, presetFields]);

  // ---------------------- RHF SETUP ----------------------
  const {
    control,
    handleSubmit: rhfSubmit,
    reset,
    setValue,
    trigger,
    watch,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: formSchema ? yupResolver(formSchema) : undefined,
  });

  const watchAll = useWatch({ control });
  const selectedSchool = watchAll.school_id;
  const physicalEdSelected = watchAll.physical_education;

  // ---------------------- Auto age from DOB ----------------------
  useEffect(() => {
    if (!watchAll.date_of_birth) return;
    const age = calculateAge(watchAll.date_of_birth);
    setValue("age", age);
    trigger("age");
  }, [watchAll.date_of_birth]);

  // ---------------------- Fetch Tutors & Coaches ----------------------
  useEffect(() => {
    // If parent passed tutor/coach options, use them and skip fetching
    if (externalTutorOptions?.length || externalCoachOptions?.length) {
      if (externalTutorOptions?.length) setTutorOptions(externalTutorOptions);
      if (externalCoachOptions?.length) setCoachOptions(externalCoachOptions);
      return;
    }

    if (!schoolIds?.length) return;

    async function fetchWorkers() {
      try {
        let data = [];

        if (!isOnline) {
          const cached = await getTable("workers");
          data = (cached || []).filter((w) => schoolIds.includes(w.school_id));
        } else {
          const { data: fetched, error } = await api
            .from("workers")
            .select("id, name, last_name, role:roles(name), school_id")
            .in("school_id", schoolIds);
          if (error) throw error;
          data = fetched;
          await cacheTable("workers", data);
        }

        console.log("Fetched Workers:", data);
        // Accept tutor/coach and head variants, case-insensitive
        setTutorOptions(
          data
            .filter((w) => w.role?.name && /tutor/i.test(w.role.name))
            .map((w) => ({
              value: w.id,
              label: `${w.name} ${w.last_name}`,
              school_id: w.school_id,
            }))
        );

        setCoachOptions(
          data
            .filter((w) => w.role?.name && /coach/i.test(w.role.name))
            .map((w) => ({
              value: w.id,
              label: `${w.name} ${w.last_name}`,
              school_id: w.school_id,
            }))
        );
      } catch (err) {
        console.warn("Worker fetch failed:", err);
      }
    }

    fetchWorkers();
  }, [schoolIds, isOnline]);

  // Reset dependent fields when school changes
  useEffect(() => {
    setValue("tutor_id", "");
    setValue("coach_id", "");
  }, [selectedSchool]);

  // ---------------------- Conditional validation tweaks ----------------------
  // If coach is not applicable (physical education not selected), make it optional
  useEffect(() => {
    if (!schema || !schema.length) return;

    try {
      const modified = schema.map((f) => {
        if (f.name === "coach_id" && !physicalEdSelected) return { ...f, required: false };
        return f;
      });

      const [, yupSchema] = buildDefaultsAndSchema(modified);
      setFormSchema(yupSchema);
    } catch (err) {
      console.warn("Failed to update conditional validation schema:", err);
    }
  }, [schema, physicalEdSelected]);


  const submitForm = async (data) => {
    setLoading(true);
    try {
      console.log("DynamicBulkForm: submitting", { schema_name, id, data });
      // Normalize payload: ensure every field from schema is present; empty values -> null
      const normalizeItem = (item) => {
        const out = { ...item };
        (schema || []).forEach((f) => {
          const name = f.name;
          const val = out[name];

          // keep explicit falsy booleans
          if (typeof val === "boolean") return;

          // coerce number-like fields to numbers when present
          if (f.type === "number" && val != null && val !== "") {
            const n = Number(val);
            out[name] = Number.isNaN(n) ? null : n;
            return;
          }

          // treat empty string, undefined, empty array, or empty object as NULL
          if (
            val === undefined ||
            val === "" ||
            (Array.isArray(val) && val.length === 0) ||
            (f.type === "json_object" && val && Object.keys(val).length === 0)
          ) {
            out[name] = null;
          }
        });
        return out;
      };

      let payload = Array.isArray(data) ? data.map(normalizeItem) : [normalizeItem(data)];

      console.log("DynamicBulkForm: prepared payload", payload);

      // Sanity-check: warn about keys present in payload that are not in the schema
      try {
        const schemaNames = (schema || []).map((f) => f.name);
        const payloadKeys = Object.keys(payload[0] || {});
        const extraKeys = payloadKeys.filter((k) => !schemaNames.includes(k) && k !== "id");
        if (extraKeys.length) console.warn("Payload contains keys not defined in form schema:", extraKeys);
      } catch (err) {
        /* ignore */
      }

      if (typeof onSubmit === "function") {
        const res = await onSubmit(Array.isArray(data) ? payload : payload[0], id);
        console.log("DynamicBulkForm: onSubmit returned", res);
      } else {
        // Fallback behaviour: if parent didn't provide onSubmit, insert into schema_name
        try {
          const { data: inserted, error } = await api.from(schema_name).insert(payload).select();
          if (error) throw error;
          console.log("DynamicBulkForm: inserted records:", inserted);
        } catch (err) {
          console.error("DynamicBulkForm fallback insert failed:", err);
          throw err;
        }
      }
      const [defaults] = buildDefaultsAndSchema(schema);
      reset({ ...defaults, ...presetFields });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field) => {
    if (field.name === "coach_id" && !physicalEdSelected) return null;

    // Determine whether the field should be marked required in the UI.
    const isRequired = !!field.required && !(field.name === "coach_id" && !physicalEdSelected);

    let options = field.options || [];
    if (field.name === "school_id") options = schools;
    if (field.name === "role") options = roles;
    if (field.name === "category") options = catOptions;
    if (field.name === "tutor_id")
      // tutorOptions already has { value, label, school_id }
      // allow loose equality because selectedSchool may be string/number
      options = tutorOptions.filter((t) => t.school_id == selectedSchool);
    if (field.name === "coach_id")
      options = coachOptions.filter((c) => c.school_id == selectedSchool);
    
    if (field.name === "race") options = raceOptions;
    if (field.name === "gender") options = genderOptions;

    if (field.name === "grade") {
      options = ["R1", "R2", "R3", "R4"];
      for (let i = 1; i <= 7; i++) ["A", "B", "C", "D"].forEach((l) => options.push(`${i}${l}`));

      return (
        <div key={field.name} className="mb-3">
          <label className="block mb-1 font-semibold">
            {field.label} {isRequired && <span className="text-red-600 ml-1">*</span>}
          </label>
          <Controller
            control={control}
            name={field.name}
            render={({ field: f }) => (
              <select {...f} className="w-full p-2 border rounded">
                <option value="">Select {field.label}</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
          />
          {errors[field.name]?.message && <p className="text-red-600 text-sm">{errors[field.name]?.message}</p>}
        </div>
      );
    }
    if (field.name === "year") {
      const currentYear = new Date().getFullYear();
      options = [];
      for (let y = 2015; y <= currentYear; y++) options.push(y);

      return (
        <div key={field.name} className="mb-3">
          <label className="block mb-1 font-semibold">
            {field.label} {isRequired && <span className="text-red-600 ml-1">*</span>}
          </label>
          <Controller
            control={control}
            name={field.name}
            render={({ field: f }) => (
              <select {...f} className="w-full p-2 border rounded">
                <option value="">Select {field.label}</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
          />
          {errors[field.name]?.message && <p className="text-red-600 text-sm">{errors[field.name]?.message}</p>}
        </div>
      );
    }
    switch (field.type) {
      case "file":
        return (
          <div key={field.name} className="mb-3">
            <label className="block mb-1 font-semibold">
              {field.label} {isRequired && <span className="text-red-600 ml-1">*</span>}
            </label>
            <Controller
              control={control}
              name={field.name}
              render={({ field: f }) => (
                <UploadFile
                  {...f}
                  label={field.label}
                  // prefer explicit field.group, then parent's folderProp, then field.name, then pluralized schema_name
                  folder={field.group || folderProp || field.name || `${String(schema_name).toLowerCase()}s`}
                  id={externalRecordId || id}
                />
              )}
            />
            {errors[field.name]?.message && <p className="text-red-600 text-sm">{errors[field.name]?.message}</p>}
          </div>
        );

      case "checkbox":
      case "boolean":
        return (
          <div key={field.name} className="mb-3">
            <Controller
              control={control}
              name={field.name}
              render={({ field: f }) => (
                <label className="flex items-center gap-2">
                  <input type="checkbox" {...f} />
                  <span>
                    {field.label} {isRequired && <span className="text-red-600 ml-1">*</span>}
                  </span>
                </label>
              )}
            />
            {errors[field.name]?.message && <p className="text-red-600 text-sm">{errors[field.name]?.message}</p>}
          </div>
        );

      case "json_object":
        return (
          <div key={field.name} className="mb-3">
            <label className="block mb-1 font-semibold">
              {field.label} {isRequired && <span className="text-red-600 ml-1">*</span>}
            </label>
            <Controller
              control={control}
              name={field.name}
              render={({ field: f }) => (
                <JsonObjectField
                  value={f.value}
                  onChange={(val) => f.onChange(val)}
                  group={field.group}
                  max={field.max || 100}
                />
              )}
            />
            {errors[field.name]?.message && <p className="text-red-600 text-sm">{errors[field.name]?.message}</p>}
          </div>
        );

      case "select":
        return (
          <div key={field.name} className="mb-3">
            <label className="block mb-1 font-semibold">
              {field.label} {isRequired && <span className="text-red-600 ml-1">*</span>}
            </label>
            <Controller
              control={control}
              name={field.name}
              render={({ field: f }) => (
                <select {...f} className="w-full p-2 border rounded">
                  <option value="">Select {field.label}</option>
                  {options.map((opt) => (
                    <option
                      key={opt.id || opt.value || opt}
                      value={opt.id || opt.value || opt}
                    >
                      {opt.label || opt.name || opt}
                    </option>
                  ))}
                </select>
              )}
            />
            {errors[field.name]?.message && <p className="text-red-600 text-sm">{errors[field.name]?.message}</p>}
          </div>
        );

      default:
        return (
          <div key={field.name} className="mb-3">
            <label className="block mb-1 font-semibold">
              {field.label} {isRequired && <span className="text-red-600 ml-1">*</span>}
            </label>
            <Controller
              control={control}
              name={field.name}
              render={({ field: f }) => (
                <input
                  {...f}
                  type={field.type || "text"}
                  className="w-full p-2 border rounded"
                  placeholder={field.label}
                  min={field.min}
                  max={field.max}
                  readOnly={field.name === "age"}
                  onBlur={() => trigger(field.name)}
                />
              )}
            />
            {errors[field.name]?.message && <p className="text-red-600 text-sm">{errors[field.name]?.message}</p>}
          </div>
        );
    }

    if (field.type === "file") {
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
    }

    if (field.name === "answers" && formData.answers) {
      console.log("Rendering answers field with data:", formData.answers);
      return (
        <div key={field.name} className="mb-4">
          <h3 className="text-lg font-semibold mb-2">{field.label}</h3>

          {Object.entries(formData.answers).map(([qid, value]) => (
            <div key={qid} className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {qid.replace(/_/g, " ")}
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    answers: { ...prev.answers, [qid]: e.target.value },
                  }))
                }
                className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
                placeholder="Enter answer"
              />
            </div>
          ))}
        </div>
      );
    }

    if (field.type === "select") {
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
            {(Array.isArray(field.options) ? field.options : []).map((opt) => (
              <option key={opt.value ?? opt} value={opt.value ?? opt}>
                {opt.label ?? opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === "checkbox") {
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
    }

    // default text/number/etc.
    return (
      <div key={field.name} className="mb-4">
        <label className="block text-sm font-medium">{field.label}</label>
        <input
          type={field.type || "text"}
          value={formData[field.name] ?? ""}
          onChange={(e) => handleChange(field.name, e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>
    );
  };

  // ---------------------- FORM ----------------------
  useEffect(() => {
    console.log("DynamicBulkForm mounted", { schema_name, id });
  }, []);

  useEffect(() => {
    console.log("DynamicBulkForm loading state:", loading);
  }, [loading]);

  return (
    <form onSubmit={rhfSubmit(submitForm)} className="space-y-4">
      {schema.map(renderField)}
      <button
        type="submit"
        disabled={!!loading}
        className="px-4 py-2 bg-blue-600 text-white rounded"
        onClick={(e) => {
          console.log("Submit clicked", { loading, schema_name, id });
          try {
            const vals = getValues();
            console.log("DynamicBulkForm current values before submit:", vals);
          } catch (err) {
            console.warn("getValues failed:", err);
          }
          // trigger RHF submit programmatically and log validation errors if any
          try {
            rhfSubmit(submitForm, (validationErrors) => {
              console.log("DynamicBulkForm validation errors:", validationErrors);
            })();
          } catch (err) {
            console.error("rhfSubmit call failed:", err);
          }
        }}
        aria-disabled={!!loading}
      >
        {loading ? "Submitting..." : id ? "Update" : "Create"}
      </button>
    </form>
  );
}
