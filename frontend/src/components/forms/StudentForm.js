// src/components/students/StudentForm.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import DynamicBulkForm from "../forms/DynamicBulkForm";
import { useSchools } from "../../context/SchoolsContext";
import { useAuth

 } from "../../context/AuthProvider";
export default function StudentForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {schools} = useSchools()
  const [studentId, selectStudentId] = useState();

   const presetFields = {
    studentId: studentId && studentId,
    school_id: user?.profile?.school_id,
  };
  const handleSubmit = async (payload) => {
    try {
      // insert into students
      const { data, error } = await api
        .from("students")
        .insert(payload)
        .select("id"); // return the new ids

      if (error) throw error;

      selectStudentId(data[0]?.id);

    } catch (err) {
      console.error("Failed to create student:", err);
      throw err;
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Create Student</h2>
      <DynamicBulkForm
        schema_name="Student"
        presetFields={presetFields}
        onSubmit={handleSubmit}
        studentId={studentId}
      />
    </div>
  );
}
