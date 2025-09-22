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
  const { id } = useParams();
  const { user } = useAuth();
  const { schools } = useSchools();
  const [selectedStudents, setSelectedStudents] = useState([]);
  const { filters, setFilters } = useFilters();
  const [sessionType, setSessionType] = useState("");

  const { students } = useSupabaseStudents({
    school_id: ["superuser", "admin", "hr", "viewer"].includes(user?.profile?.roles.name)
      ? schools.map(s => s.id)
      : [user?.profile?.school_id],
    filters,
  });

  // Role-based session type default
  useEffect(() => {
    const role = user?.profile?.roles.name;
    if (role === "head tutor") setSessionType("academic_sessions");
    else if (role === "head coach") setSessionType("pe_sessions");
  }, [user]);

  const role = user?.profile?.roles.name;
  const sessionOptions = [
    { value: "academic_sessions", label: "Academics" },
    { value: "pe_sessions", label: "PE" },
  ];

  // Filter students based on sessionType
  const filteredStudents = students.filter(s => {
    if (sessionType === "pe_sessions") return s.physical_education; // only PE students
    return true; // all students for academics or no session type
  });

  const presetFields = {
    logged_by: user?.id || "",
    school_id: filters?.school_id || user?.profile?.school_id,
    ...(id ? { student_id: [id] } : { student_id: selectedStudents }),
  };

  const student = students.find(s => s.id === Number(id));

  return (
    <div className="p-6">
      {!id && (
        <div className="page-filters">
          <FiltersPanel
            user={user}
            schools={schools}
            filters={{ ...filters, session_type: sessionType ? [sessionType] : [] }}
            setFilters={setFilters}
            resource="students"
            gradeOptions={gradeOptions}
            sessionTypeOptions={role === "superuser" || role === "admin" ? sessionOptions.map(o => o.label) : []}
            groupByOptions={groupByOptions}
            showDeletedOption={["admin", "hr", "superviser"].includes(role)}
          />
        </div>
      )}

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
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6">
        {id ? `Log session for ${student?.full_name || "student"}` : "Create Students Sessions (Bulk)"}
      </h1>

      {!id && (
        <div className="mb-4">
          <EntityMultiSelect
            label="Select Students"
            options={filteredStudents}
            value={selectedStudents}
            onChange={setSelectedStudents}
          />
        </div>
      )}

      {sessionType && (
        <DynamicBulkForm
          schema_name={sessionType === "academic_sessions" ? "Academic_sessions" : "PE_sessions"}
          presetFields={presetFields}
          onSubmit={async (formData, singleId) => {
            const studentsId = singleId ? [singleId] : formData.student_id;
            if (!studentsId || studentsId.length === 0) {
              throw new Error("Please select at least one student.");
            }

            const tableName = sessionType;

            for (const studentId of studentsId) {
              const record = { ...formData, student_id: studentId };
              if (record.photo) {
                record.photo = await UploadFile(
                  record.photo,
                  "session-uploads",
                  `${studentId}/${record.title || "session"}`
                );
              }
              delete record.logged_by;

              const { error } = await api.from(tableName).insert(record);
              if (error) throw error;
            }
          }}
        />
      )}
    </div>
  );
}
