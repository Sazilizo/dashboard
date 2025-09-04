// src/pages/UpdateLearnerProfile.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/client";
import DynamicBulkForm from "../forms/DynamicBulkForm";
import UploadFileHelper from "../profiles/UploadHelper";

export default function UpdateLearnerProfile() {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStudent = async () => {
      try {
        const { data, error } = await api
          .from("students")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;
        setStudent(data);
      } catch (err) {
        console.error("Failed to fetch student:", err.message);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchStudent();
  }, [id]);

  useEffect(()=>{
    console.log("student to update:", student)
  },[student])
  if (loading) return <p>Loading student data...</p>;

  return (
    <div className="p-6">
      <div className="profile-learner-print mb-4">
        <button className="btn btn-primary" onClick={() => window.history.back()}>
          Back to Students
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-6">Update Student Profile</h1>

      {student && (
        <DynamicBulkForm
          schema_name="Student"
          presetFields={student}
          onSubmit={async (formData) => {
            try {
              const record = { ...formData };

              // handle photo upload if it's a File
              if (record.photo instanceof File) {
                const uploadedUrl = await UploadFileHelper(
                  record.photo,
                  "students",
                  id
                );
                record.photo = uploadedUrl;
              }

              const  {error } = await api
                .from("students")
                .update(record)
                .eq("id", id);

              if (error) throw error;
              alert("Student profile updated successfully!");
            } catch (err) {
              console.error(err);
              alert("Failed to update student profile.");
            }
          }}
        />
      )}
    </div>
  );
}
