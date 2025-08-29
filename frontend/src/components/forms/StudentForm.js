import React, { useEffect, useState } from "react";
import { useSchools } from "../../context/SchoolsContext";
import api from "../../api/client";
import UploadFileHelper from "../profiles/UploadHelper";

const CATEGORY_OPTIONS = [
  { value: "pr", label: "pr" },
  { value: "ww", label: "ww" },
  { value: "un", label: "un" },
];

export default function StudentForm() {
  const { schools } = useSchools();
  const [schema, setSchema] = useState(null);
  const [formData, setFormData] = useState({
    full_name: "",
    grade: "",
    category: "",
    physical_education: false,
    year: new Date().getFullYear(),
    school_id: "",
    // id_number: "",
    // date_of_birth: "",
    photo: null,
    parent_permission_pdf: null,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch form schema from Supabase
  useEffect(() => {
    async function fetchSchema() {
      const { data, error } = await api
        .from("form_schemas")
        .select("schema")
        .eq("model_name", "Student")
        .single();
      if (error) {
        setError("Failed to load form schema.");
        return;
      }
      setSchema(data.schema);
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
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Step 1: Insert student *without* file URLs to get the new id
      const insertData = {
        full_name: formData.full_name,
        grade: formData.grade,
        category: formData.category,
        physical_education: formData.physical_education,
        year: Number(formData.year),
        school_id: Number(formData.school_id),
        // id_number: formData.id_number || null,
        // date_of_birth: formData.date_of_birth || null,
        // photo: null,
        // parent_permission_pdf: null,
      };

      const { data: insertedStudent, error: insertError } = await api
        .from("students")
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      const studentId = insertedStudent.id;

      // Step 2: Upload files with folder named by studentId
      let photoUrl = null;
      let permissionPdfUrl = null;

      if (formData.photo) {
        photoUrl = await UploadFileHelper(formData.photo, "students", studentId);
      }

      if (formData.parent_permission_pdf) {
        permissionPdfUrl = await UploadFileHelper(
          formData.parent_permission_pdf,
          "students",
          studentId
        );
      }

      // Step 3: Update the student record with uploaded file URLs
      const { error: updateError } = await api
        .from("students")
        .update({ photo: photoUrl, parent_permission_pdf: permissionPdfUrl })
        .eq("id", studentId);

      if (updateError) throw updateError;

      alert("Student created successfully!");

      // Reset form
      setFormData({
        full_name: "",
        grade: "",
        category: "",
        physical_education: false,
        year: new Date().getFullYear(),
        school_id: "",
        // id_number: "",
        // date_of_birth: "",
        photo: null,
        parent_permission_pdf: null,
      });
    } catch (err) {
      setError(err.message || "Failed to create student");
    } finally {
      setLoading(false);
    }
  };

  if (!schema) return <p>Loading form schema...</p>;

  return (
    <>
    <button className="btn btn-primary" onClick={() => window.history.back()}>Back to Students</button>
    <form onSubmit={handleSubmit}>
      {/* Full Name */}
      <div>
        <label>Full Name *</label>
        <input
          type="text"
          name="full_name"
          value={formData.full_name}
          onChange={handleChange}
          required
        />
      </div>

      {/* Grade */}
      <div>
        <label>Grade *</label>
        <input
          type="text"
          name="grade"
          value={formData.grade}
          onChange={handleChange}
          required
        />
      </div>

      {/* Category */}
      <div>
        <label>Category *</label>
        <select
          name="category"
          value={formData.category}
          onChange={handleChange}
          required
        >
          <option value="">Select category</option>
          {CATEGORY_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Physical Education */}
      <div>
        <label>
          <input
            type="checkbox"
            name="physical_education"
            checked={formData.physical_education}
            onChange={handleChange}
          />
          Physical Education
        </label>
      </div>

      {/* Year */}
      <div>
        <label>Year *</label>
        <input
          type="number"
          name="year"
          value={formData.year}
          onChange={handleChange}
          required
        />
      </div>

      {/* School */}
      <div>
        <label>School *</label>
        <select
          name="school_id"
          value={formData.school_id}
          onChange={handleChange}
          required
        >
          <option value="">Select a school</option>
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
      </div>

      {/* ID Number */}
      {/* <div>
        <label>ID Number</label>
        <input
          type="text"
          name="id_number"
          value={formData.id_number}
          onChange={handleChange}
        />
      </div> */}

      {/* Date of Birth */}
      {/* <div>
        <label>Date of Birth</label>
        <input
          type="date"
          name="date_of_birth"
          value={formData.date_of_birth}
          onChange={handleChange}
        />
      </div> */}

      {/* Photo */}
      <div>
        <label>Photo</label>
        <input
          type="file"
          name="photo"
          onChange={handleChange}
          accept="image/*"
        />
      </div>

      {/* Parent Permission PDF */}
      <div>
        <label>Parent Permission PDF</label>
        <input
          type="file"
          name="parent_permission_pdf"
          onChange={handleChange}
          accept="application/pdf"
        />
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create Student"}
      </button>
    </form>
    </>
  );
}
