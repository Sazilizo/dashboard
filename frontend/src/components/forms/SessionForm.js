
import React, { useState, useEffect } from "react";
import DynamicBulkForm from "./DynamicBulkForm";
import api from "../../api/client";
import { useParams } from "react-router-dom";
import EntityMultiSelect from "../../hooks/EntityMultiSelect";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import UploadFile from "../profiles/UploadHelper";
import { useSupabaseStudents } from "../../hooks/useSupabaseStudents";


const gradeOptions = [
  "R1", "R2", "R3",
  ...Array.from({ length: 7 }, (_, i) => {
    const grade = i + 1;
    return ["A", "B", "C", "D"].map(section => `${grade}${section}`);
  }).flat()
];

const groupByOptions = ["ww", "pr", "un"];

export default function SessionForm() {
  const { id } = useParams(); // single worker mode if present
  const { user } = useAuth();
  const {schools} = useSchools()
  const [selectedStudents, setSelectedStudents] = useState([]);

  // Fetch all workers for bulk mode
  const { students, loading, error } = useSupabaseStudents({
      school_id: ["superuser", "admin", "hr", "viewer"].includes(user && user?.profile?.roles.name)
        ? schools.map(s => s.id) // all schools
        : [user?.profile?.school_id],       // only user's school
    });

  // Preset fields for DynamicBulkForm
  const presetFields = {
    logged_by: user?.id || "",
    // single mode: preset worker_id to [id]
    ...(id ? { worker_id: [id] } : { worker_id: selectedStudents }),
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        {id ? `Log session for ${students.full_name}` : "Create Students Sessions (Bulk)"}
      </h1>

      {/* Bulk mode: show MultiSelect */}
      {!id &&(
        <div className="mb-4">
          <EntityMultiSelect
            label="Select Students"
            options={students}
            value={selectedStudents}
            onChange={setSelectedStudents}
          />
        </div>
      )}

      <DynamicBulkForm
        schema_name="Academic_sessions"
        presetFields={presetFields}
        onSubmit={async (formData, singleId) => {
          // handle bulk inserts
          const studentsId = singleId ? [singleId] : formData.student_id;

          if (!studentsId || studentsId.length === 0) {
            throw new Error("Please select at least one worker.");
          }


          for (const studentId of studentsId) {
            const record = {
              ...formData,
              student_id: studentId,
            };

            if (record.photo) {
              const uploadedUrl = await UploadFile(
                record.photo,
                "session-uploads",
                `${studentId}/${record.title || "session"}`
              );
              record.photo = uploadedUrl;
            }

            delete record.logged_by;

            const { error } = await api.from("academic_sessions").insert(record);
            if (error) throw error;
          }

        }}
      />
    </div>
  );
}
