// src/pages/TrainingForm.jsx
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/client";
import DynamicBulkForm from "./DynamicBulkForm";
import EntityMultiSelect from "../../hooks/EntityMultiSelect";
import { useAuth } from "../../context/AuthProvider";
import UploadFileHelper from "../profiles/UploadHelper";

export default function IndividualSessionForm() {
  const { id } = useParams(); // single student mode
  const { user } = useAuth();
  const [student, setStudent] = useState(null);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch student if single mode
  useEffect(() => {
    if (!id) return;

    async function fetchStudent() {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await api
          .from("students")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;
        setStudent(data);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchStudent();
  }, [id]);

  // Fetch all workers for bulk mode
  // useEffect(() => {
  //   if (id) return; // skip in single mode
  //   async function fetchWorkers() {
  //     try {
  //       const { data, error } = await api.from("workers").select("*");
  //       if (error) throw error;
  //       setWorkers(data || []);
  //     } catch (err) {
  //       console.error(err);
  //     }
  //   }
  //   fetchWorkers();
  // }, [id]);

  // const student = students.find(s => s.id === Number(id));

  // Prepare preset fields
  const presetFields = {
    logged_by: user?.profile?.email || "",
    ...(student?.category ? { category: student.category } : {}),
  };

  useEffect(()=>{
    console.log("student: ", student)
  },[student])

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        {/* Create session for {student && student.full_name} */}
      </h1>


      {/* Render the dynamic form */}
      {/* {(!id || (id && student)) && (
        <DynamicBulkForm
          schema_name="academic_sessions"
          presetFields={presetFields}
          studentId={student.id}
          onSubmit={async (formData, singleId) => {
            // Determine worker IDs
            const workerIds = singleId ? [singleId] : selectedWorkers;
            if (!workerIds || workerIds.length === 0) {
              throw new Error("Please select at least one worker.");
            }

            // Loop through each worker
            for (const workerId of workerIds) {
              const record = { ...formData, worker_id: workerId };

              // Handle file upload
              if (record.photo) {
                const uploadedUrl = await UploadFileHelper(
                  record.photo,
                  "training-uploads",
                  `${workerId}/${record.title || "training"}`
                );
                record.photo = uploadedUrl;
              }

              const { error } = await api.from("training_records").insert(record);
              if (error) throw error;
            }
          }}
        />
      )} */}
    </div>
  );
}
