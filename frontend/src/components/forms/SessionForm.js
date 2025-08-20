
import React, { useState, useEffect } from "react";
import DynamicBulkForm from "./DynamicBulkForm";
import api from "../../api/client";
import { useParams } from "react-router-dom";
import EntityMultiSelect from "../../hooks/EntityMultiSelect";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import UploadFile from "../profiles/UploadHelper";
import { useSupabaseStudents } from "../../hooks/useSupabaseStudents";
import FiltersPanel from "../filters/FiltersPanel";
import { useFilters } from "../../context/FiltersContext";

const gradeOptions = [
  "R1", "R2", "R3",
  ...Array.from({ length: 7 }, (_, i) => {
    const grade = i + 1;
    return ["A", "B", "C", "D"].map(section => `${grade}${section}`);
  }).flat()
];

const groupByOptions = ["ww", "pr", "un"];

export default function SessionForm() {
  const { id } = useParams(); // single student mode if present
  const { user } = useAuth();
  const {schools} = useSchools()
  const [selectedStudents, setSelectedStudents] = useState([]);
  const {filters, setFilters} = useFilters();

  // Fetch all students for bulk mode
  const { students, loading, error } = useSupabaseStudents({
      school_id: ["superuser", "admin", "hr", "viewer"].includes(user && user?.profile?.roles.name)
        ? schools.map(s => s.id) // all schools
        : [user?.profile?.school_id],       // only user's school
    });

  const sessionTypeOptions = user?.profile?.roles.name === "head tutor"
    ? ["Academics"]
    : user?.profile?.roles.name === "head coach"
      ? ["PE"]
      : ["PE", "Academics"];

  // Preset fields for DynamicBulkForm
  const presetFields = {
    logged_by: user?.id || "",
    school_id: user?.profile?.school_id,
    ...(id ? { student_id: [id] } : { student_id: selectedStudents }),
  };

  const student = students.find(s => s.id === Number(id)) || students;
  

  return (
    <div className="p-6">
      <div className="page-filters">
        <FiltersPanel
          user={user}
          schools={schools}
          filters={{ ...filters, session_type: sessionTypeOptions }}
          setFilters={setFilters}
          resource="students"
          gradeOptions={gradeOptions}
          sessionTypeOptions={sessionTypeOptions}
          groupByOptions={groupByOptions}
          showDeletedOption={["admin", "hr", "superviser"].includes(user?.profile?.roles.name)}
        />
      </div>
      <h1 className="text-2xl font-bold mb-6">
        {id ? `Log session for ${student.full_name}` : "Create Students Sessions (Bulk)"}
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
