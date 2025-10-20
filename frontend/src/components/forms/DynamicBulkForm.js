// src/components/forms/DynamicBulkForm.js
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/client";
import RoleSelect from "../../hooks/RoleSelect";
import EntityMultiSelect from "../../hooks/EntityMultiSelect";
import UploadFile from "../profiles/UploadFile";
import { useSchools } from "../../context/SchoolsContext";
import { useAuth } from "../../context/AuthProvider";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import { getTable, cacheTable } from "../../utils/tableCache";

export default function DynamicBulkForm({
  schema_name,
  presetFields = {},
  onSubmit,
  studentId,
  tutorOptions,
  coachOptions,
  selectedData,
  filteredData,
  valueChange
}) {
  const { id } = useParams();
  const { schools } = useSchools();
  const { user } = useAuth();
  const role = user?.role;

  const [schema, setSchema] = useState([]);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [sessionType, setSessionType] = useState("");
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);

  const sessionOptions = [
    { value: "academic", label: "Academic Session" },
    { value: "pe", label: "PE Session" },
  ];

  // useEffect(() => {
  //   if (students.length) {
  //     setFilteredStudents(students.filter((s) => s.active));
  //   }
  // }, [students]);

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

  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    if (!schema_name) return;

    async function fetchSchema() {
      // Offline: read schema from cache
      if (!isOnline) {
        try {
          const cached = await getTable("form_schemas");
          const entry = (cached || []).find((r) => r.model_name === schema_name);
          const fields = entry?.schema?.fields || [];
          if (!fields || fields.length === 0) {
            // No cached schema available for this model
            setSchema([]);
            setError(
              `No cached schema for ${schema_name} is available offline. Open this form while online once to cache the schema, or go online to load it now.`
            );
            return;
          }
          setSchema(fields);
          // build defaults from fields
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
          Object.keys(presetFields).forEach((k) => {
            if (fields.some((f) => f.name === k)) {
              defaults[k] = presetFields[k];
            }
          });
          setFormData(defaults);
          return;
        } catch (err) {
          console.warn("Failed to read cached form schema", err);
          setSchema([]);
          setError(
            `Failed to load form schema (offline). Error reading local cache: ${err?.message || err}`
          );
          return;
        }
      }

      // Online: fetch and cache schema
      const { data: schemaData, error: schemaError } = await api
        .from("form_schemas")
        .select("schema,model_name")
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

      Object.keys(presetFields).forEach((k) => {
        if (fields.some((f) => f.name === k)) {
          defaults[k] = presetFields[k];
        }
      });

      setFormData(defaults);

      // Cache fetched schema for offline use
      try {
        const existing = await getTable("form_schemas");
        const others = (existing || []).filter((r) => r.model_name !== schemaData.model_name);
        await cacheTable("form_schemas", [...others, { model_name: schemaData.model_name, schema: schemaData.schema }]);
      } catch (err) {
        console.warn("Failed to cache form schema", err);
      }
    }

    fetchSchema();
  }, [schema_name, presetFields, id, isOnline]);

  const handleChange = (name, value) => {
    let updated = { ...formData, [name]: value };

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
      [fieldName]: { ...prev[fieldName], [key]: Number(value) },
    }));
  };

  const handleSectionChange = (sectionIndex, key, value) => {
    setFormData((prev) => {
      const sectionsData = prev.sections.sections || [];
      sectionsData[sectionIndex] = {
        ...sectionsData[sectionIndex],
        [key]: key === "number_of_questions" ? Number(value) : value,
      };
      return {
        ...prev,
        sections: { ...prev.sections, sections: sectionsData },
      };
    });
  };

  const handleQuestionChange = (sectionIndex, questionIndex, key, value) => {
    setFormData((prev) => {
      const sectionsData = prev.sections.sections || [];
      const questionsData = sectionsData[sectionIndex].questions || [];
      questionsData[questionIndex] = {
        ...questionsData[questionIndex],
        [key]: value,
      };
      sectionsData[sectionIndex].questions = questionsData;
      return {
        ...prev,
        sections: { ...prev.sections, sections: sectionsData },
      };
    });
  };

  const handleAddSection = () => {
    setFormData((prev) => {
      const sectionsData = prev.sections.sections || [];
      sectionsData.push({
        section_title: "",
        section_image: null,
        number_of_questions: 0,
        questions: [],
      });
      return {
        ...prev,
        sections: { ...prev.sections, sections: sectionsData },
      };
    });
  };

  const handleAddQuestion = (sectionIndex) => {
    setFormData((prev) => {
      const sectionsData = prev.sections.sections || [];
      const questionsData = sectionsData[sectionIndex].questions || [];
      questionsData.push({ question: "", type: "text", options: [], correct_answer: "" });
      sectionsData[sectionIndex].questions = questionsData;
      return {
        ...prev,
        sections: { ...prev.sections, sections: sectionsData },
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate sections & questions
      const sections = formData.sections?.sections || [];
      for (const [sIndex, sec] of sections.entries()) {
        if (!sec.section_title) throw new Error(`Section ${sIndex + 1} title is required.`);
        if (sec.number_of_questions !== sec.questions.length) {
          throw new Error(`Section ${sIndex + 1} must have ${sec.number_of_questions} questions.`);
        }
        sec.questions.forEach((q, qIndex) => {
          if (!q.question) throw new Error(`Question ${qIndex + 1} in Section ${sIndex + 1} is required.`);
          if (!q.type) throw new Error(`Question ${qIndex + 1} in Section ${sIndex + 1} type is required.`);
        });
      }

      const payload = { ...formData };

      schema.forEach((f) => {
        let val = formData[f.name];
        if (f.type === "checkbox" || f.type === "boolean") val = !!val;
        payload[f.name] = val;
      });

      if (schema.some((f) => f.name === "school_id")) {
        payload.school_id = Number(presetFields.school_id) || Number(formData.school_id);
      }
      if (schema.some((f) => f.name === "student_id")) {
        payload.student_id = id || presetFields.student_id;
      }

      if (role === "superuser" || role === "admin") {
        payload.sessionType = sessionType;
      }
      if (["academic_sessions", "pe_sessions"].includes(schema_name)) {
        payload.auth_uid = user.id;
        if (user.school_id) payload.school_id = user.school_id;
      }

      if (!id && (payload.student_ids?.length || payload.worker_ids?.length)) {
        const ids = payload.student_ids || payload.worker_ids;
        for (const entityId of ids) {
          const record = {
            ...payload,
            student_id: payload.student_ids ? entityId : undefined,
            worker_id: payload.worker_ids ? entityId : undefined,
          };
          await onSubmit(record, entityId);
        }
      } else {
        await onSubmit(payload, id);
      }

      // Reset form
      const resetData = {};
      schema.forEach((f) => {
        if (f.type === "json_object") {
          const groupDefaults = {};
          f.group.forEach((g) => {
            groupDefaults[g.name] = g.type === "repeater" ? [] : g.default ?? 0;
          });
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
    if (field.name === "school_id" && !schools?.length) return null;

    if (field.name === "school_id" && schools?.length) {
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

      const showCoach =
        schema_name === "Student" &&
        (formData.physical_education === true ||
          formData.physical_education === "true"); 

      if (!showCoach) return null;

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
        minDate = new Date(today.getFullYear() - 60, 0, 1)
          .toISOString()
          .split("T")[0];
        maxDate = new Date(today.getFullYear() - 2, 11, 31)
          .toISOString()
          .split("T")[0];
      } else if (schema_name === "Worker") {
        minDate = new Date(today.getFullYear() - 60, 0, 1)
          .toISOString()
          .split("T")[0];
        maxDate = new Date(today.getFullYear() - 18, 11, 31)
          .toISOString()
          .split("T")[0];
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

    if (field.type === "json_object" && field.group.some(g => g.type === "repeater")) {
      const sectionsData = formData[field.name]?.sections || [];
      return (
        <div key={field.name} className="mb-4 border p-2 rounded">
          <label className="font-medium">{field.label}</label>
          <div className="mb-2">
            <button type="button" onClick={handleAddSection} className="px-2 py-1 bg-green-500 text-white rounded">
              + Add Section
            </button>
          </div>
          {sectionsData.map((section, sIndex) => (
            <div key={sIndex} className="mb-4 border p-2 rounded bg-gray-50">
              <input
                type="text"
                placeholder={`Section ${sIndex + 1} Title`}
                value={section.section_title}
                onChange={(e) => handleSectionChange(sIndex, "section_title", e.target.value)}
                className="w-full mb-2 p-2 border rounded"
                required
              />
              <input
                type="number"
                placeholder="Number of Questions"
                min={0}
                max={20}
                value={section.number_of_questions}
                onChange={(e) => handleSectionChange(sIndex, "number_of_questions", e.target.value)}
                className="w-full mb-2 p-2 border rounded"
                required
              />
              <div>
                <button type="button" onClick={() => handleAddQuestion(sIndex)} className="px-2 py-1 bg-blue-500 text-white rounded mb-2">
                  + Add Question
                </button>
              </div>
              {section.questions?.map((q, qIndex) => (
                <div key={qIndex} className="mb-2 p-2 border rounded bg-white">
                  <input
                    type="text"
                    placeholder={`Question ${qIndex + 1}`}
                    value={q.question}
                    onChange={(e) => handleQuestionChange(sIndex, qIndex, "question", e.target.value)}
                    className="w-full mb-1 p-2 border rounded"
                    required
                  />
                  <select
                    value={q.type}
                    onChange={(e) => handleQuestionChange(sIndex, qIndex, "type", e.target.value)}
                    className="w-full mb-1 p-2 border rounded"
                    required
                  >
                    <option value="">Select Type</option>
                    <option value="text">Text</option>
                    <option value="image_choice">Image Choice</option>
                    <option value="multiple_choice">Multiple Choice</option>
                    <option value="long_text">Long Text</option>
                  </select>
                  {(q.type === "multiple_choice" || q.type === "image_choice") && (
                    <input
                      type="text"
                      placeholder="Options (comma separated)"
                      value={q.options?.join(",") || ""}
                      onChange={(e) => handleQuestionChange(sIndex, qIndex, "options", e.target.value.split(","))}
                      className="w-full mb-1 p-2 border rounded"
                    />
                  )}
                  <input
                    type="text"
                    placeholder="Correct Answer"
                    value={q.correct_answer || ""}
                    onChange={(e) => handleQuestionChange(sIndex, qIndex, "correct_answer", e.target.value)}
                    className="w-full mb-1 p-2 border rounded"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }
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

    if (
      (field.name === "fruit_type" ||
        field.name === "fruit_other_description") &&
      !formData.is_fruit
    ) {
      return null;
    }
    if (field.name === "gender") {
      return (
        <div key={field.name} className="mb-4">
          <label className="block font-medium">{field.label || "Gender"}</label>
          <select
            value={formData[field.name] || ""}
            onChange={(e) => handleChange("gender", e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Select Gender...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      );
    }

    if (field.name === "race") {
      return (
        <div key={field.name} className="mb-4">
          <label className="block font-medium">{field.label || "Race"}</label>
          <select
            value={formData[field.name] || ""}
            onChange={(e) => handleChange("race", e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Select Race...</option>
            <option value="black">Black</option>
            <option value="white">White</option>
            <option value="coloured">Coloured</option>
            <option value="indian">Indian</option>
          </select>
        </div>
      );
    }


    switch (field.type) {
      case "multi_select" && field.label ==="Students":
        return (
          <EntityMultiSelect
            key={field.name}
            label={field.label}
            value={formData[field.name]}
            options={field.options || []}
            onChange={(val) => handleChange(field.name, val)}
          />
        );
      case field.format === "select" && field.foreign?.includes("roles") :
          return (
            <div key={field.name}>
              <label>{field.label}</label>
              <RoleSelect
                name={field.name}
                value={formData[field.name]}
                onChange={handleChange}
                required={field.required}
              />
            </div>
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
                  onChange={(e) =>
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

      {(role === "superuser" || role === "admin") && (
        <div className="mb-4">
          <label className="block font-medium mb-2">Select Session Type</label>
          <select
            value={sessionType}
            onChange={(e) => setSessionType(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">-- Select Session Type --</option>
            {sessionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Entity selector for bulk */}
      {!id && (
        <div className="mb-4">
          <EntityMultiSelect
            // label="Select Workers"
            options={filteredData || []}
            value={selectedData}
            onChange={valueChange}
          />
        </div>
      )}

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
