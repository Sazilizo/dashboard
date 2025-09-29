// src/components/students/StudentForm.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import DynamicBulkForm from "../forms/DynamicBulkForm";
import { useSchools } from "../../context/SchoolsContext";
import { useAuth } from "../../context/AuthProvider";

export default function StudentForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { schools } = useSchools();
  const [studentId, setStudentId] = useState();
  const [tutorOptions, setTutorOptions] = useState([]);
  const [coachOptions, setCoachOptions] = useState([]);

  const schoolIds = React.useMemo(() => {
      const roleName = user?.profile?.roles?.name;
      if (["superuser","admin","hr","viewer"].includes(roleName)) return schools.map(s => s.id).filter(Boolean);
      return user?.profile?.school_id ? [user.profile.school_id] : [];
    }, [user?.profile?.roles?.name, user?.profile?.school_id, schools]);

  // Fetch tutors and coaches from workers
  useEffect(() => {
    if (!schoolIds) return;

    async function fetchWorkers() {
      const { data, error } = await api
        .from("workers")
        .select("id, name, last_name, role:roles(name),school_id")
        .in("school_id", schoolIds);

      if (error) {
        console.error("Failed to fetch workers:", error);
        return;
      }
      console.log("data",data)

      setTutorOptions(
        data
          .filter((w) => w.role?.name === "tutor")
          .map((w) => ({ value: w.id, label: `${w.name} ${w.last_name}`, school_id: w.school_id}))
      );

      setCoachOptions(
        data
          .filter((w) => w.role?.name === "coach")
          .map((w) => ({ value: w.id, label: `${w.name} ${w.last_name}`, school_id: w.school_id }))
      );
    }

    fetchWorkers();
  }, [schoolIds]);

  const presetFields = {
    studentId,
    // tutorOptions,
    // coachOptions,
    ...(user?.profile?.school_id && !["superuser","admin","hr","viewer"].includes(user?.profile?.roles?.name)
      ? { school_id: user.profile.school_id }
      : {}),
  };

  useEffect(()=>{
    console.log("tutors: ", tutorOptions, "coaches: ", coachOptions)
  },[tutorOptions,coachOptions])
  const handleSubmit = async (payload) => {
    try {
      const { data, error } = await api
        .from("students")
        .insert(payload)
        .select("id");

      if (error) throw error;
      setStudentId(data[0]?.id);
    } catch (err) {
      console.error("Failed to create student:", err);
      throw err;
    }
  };

  useEffect(() => {
    console.log("user", user)
  },[user])

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Create Student</h2>
      <DynamicBulkForm
        schema_name="Student"
        presetFields={presetFields}
        tutorOptions={tutorOptions}
        coachOptions={coachOptions}
        onSubmit={handleSubmit}
        studentId={studentId}
      />
    </div>
  );
}
