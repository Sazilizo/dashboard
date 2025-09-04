import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import DynamicBulkForm from "./DynamicBulkForm";
import EntityMultiSelect from "../../hooks/EntityMultiSelect";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import { useSupabaseStudents } from "../../hooks/useSupabaseStudents";
import FiltersPanel from "../filters/FiltersPanel";
import { useFilters } from "../../context/FiltersContext";
import UploadFileHelper from "../profiles/UploadHelper";
import api from "../../api/client";

const gradeOptions = [
  "R1", "R2", "R3",
  ...Array.from({ length: 7 }, (_, i) => {
    const grade = i + 1;
    return ["A", "B", "C", "D"].map(section => `${grade}${section}`);
  }).flat()
];

export default function MealDistributionForm() {
  const { id } = useParams();
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [meals, setMeals] = useState([]);
  const [selectedMeal, setSelectedMeal] = useState("");
  const [singleStudent, setSingleStudent] = useState(null);

  // Fetch students for bulk or single mode
  const { students } = useSupabaseStudents({
    school_id: ["superuser", "admin", "hr", "viewer"].includes(
      user?.profile?.roles.name
    )
      ? schools.map((s) => s.id)
      : [user?.profile?.school_id],
  });

  // Fetch the single student if id is present
  useEffect(() => {
    if (!id) return;
    const student = students.find(s => s.id === Number(id));
    if (student) setSingleStudent(student);
  }, [id, students]);

  // Fetch meals (global)
  useEffect(() => {
    async function fetchMeals() {
      const { data, error } = await api
        .from("meals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) console.error(error);
      else setMeals(data);
    }
    fetchMeals();
  }, []);

  // Preset fields
  const presetFields = {
    recorded_by: user?.id,
    school_id: singleStudent ? singleStudent.school_id : filters?.school_id,
    ...(id ? { student_id: [id] } : { student_id: selectedStudents }),
    meal_id: selectedMeal,
  };

  useEffect(()=>{
    console.log("selected single student:", singleStudent)
  },[singleStudent])

  return (
    <div className="p-6">
      {/* Only show filters if bulk mode */}
      {!id && (
        <div className="page-filters">
          <FiltersPanel
            user={user}
            schools={schools}
            filters={filters}
            setFilters={setFilters}
            resource="students"
            gradeOptions={gradeOptions}
            showDeletedOption={["admin", "hr", "superviser"].includes(user?.profile?.roles.name)}
          />
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6">
        {id
          ? "Distribute Meal to Student"
          : "Distribute Meals to Students (Bulk)"}
      </h1>

      {/* Bulk mode: select students */}
      {!id && (
        <div className="mb-4">
          <EntityMultiSelect
            label="Select Students"
            options={students}
            value={selectedStudents}
            onChange={setSelectedStudents}
          />
        </div>
      )}

      {/* Meal dropdown */}
      <div className="mb-4">
        <label className="block font-medium mb-2">Select Meal</label>
        <select
          value={selectedMeal}
          onChange={(e) => setSelectedMeal(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option value="">-- Select a meal --</option>
          {meals.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <DynamicBulkForm
        schema_name="Meal_distribution"
        presetFields={presetFields}
        onSubmit={async (formData, singleId) => {
          const studentsId = singleId ? [singleId] : formData.student_id;
          const mealId = formData.meal_id;

          if (!studentsId?.length || !mealId) {
            throw new Error("Please select at least one student and a meal.");
          }

          for (const studentId of studentsId) {
            const record = {
              ...formData,
              student_id: studentId,
              meal_id: mealId,
            };

            if (record.photo) {
              const uploadedUrl = await UploadFileHelper(
                record.photo,
                "meal-distributions",
                `${studentId}/${record.title || "meal"}`
              );
              record.photo = uploadedUrl;
            }

            delete record.recorded_by;

            const { error } = await api.from("meal_distributions").insert(record);
            if (error) throw error;
          }
        }}
      />
    </div>
  );
}
