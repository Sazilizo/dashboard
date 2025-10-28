// src/components/students/StudentForm.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTable, cacheTable } from "../../utils/tableCache";
import useOfflineTable from "../../hooks/useOfflineTable";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import DynamicBulkForm from "../forms/DynamicBulkForm";
import { useSchools } from "../../context/SchoolsContext";
import { useAuth } from "../../context/AuthProvider";
import api from "../../api/client";
import useToast from "../../hooks/useToast";
import ToastContainer from "../ToastContainer";

export default function StudentForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { schools } = useSchools();
  const { isOnline } = useOnlineStatus();
  const { addRow } = useOfflineTable("students");
  const [studentId, setStudentId] = useState();
  const [tutorOptions, setTutorOptions] = useState([]);
  const [coachOptions, setCoachOptions] = useState([]);
  const { toasts, showToast, removeToast } = useToast();

  const schoolIds = React.useMemo(() => {
      const roleName = user?.profile?.roles?.name;
      if (["superuser","admin","hr","viewer"].includes(roleName)) return schools.map(s => s.id).filter(Boolean);
      return user?.profile?.school_id ? [user.profile.school_id] : [];
    }, [user?.profile?.roles?.name, user?.profile?.school_id, schools]);

  // Fetch tutors and coaches from workers
  useEffect(() => {
    if (!schoolIds) return;

    async function fetchWorkers() {
      // If offline, read cached workers list
      if (!isOnline) {
        try {
          const cached = await getTable("workers");
          const data = (cached || []).filter((w) => schoolIds.includes(w.school_id));
          setTutorOptions(
            data
              .filter((w) => w.role?.name === "tutor")
              .map((w) => ({ value: w.id, label: `${w.name} ${w.last_name}`, school_id: w.school_id }))
          );
          setCoachOptions(
            data
              .filter((w) => w.role?.name === "coach")
              .map((w) => ({ value: w.id, label: `${w.name} ${w.last_name}`, school_id: w.school_id }))
          );
          return;
        } catch (err) {
          console.warn("Failed to read cached workers", err);
        }
      }

      const { data, error } = await api
        .from("workers")
        .select("id, name, last_name, role:roles(name),school_id")
        .in("school_id", schoolIds);

      if (error) {
        console.error("Failed to fetch workers:", error);
        return;
      }

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

      // Cache workers for offline use
      try {
        await cacheTable("workers", data);
      } catch (err) {
        console.warn("Failed to cache workers", err);
      }
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
  // Use the offline table helper which will perform an online insert or
  // queue the mutation when offline. It returns a temp id/mutation key
  // when queued so the UI can reflect that state.
  const res = await addRow(payload);
      if (res && res.tempId) {
        // queued (offline) — show temp id
        setStudentId(res.tempId);
      } else if (res && res.id) {
        // online insert returned created record — set the new id so UploadFile can upload
        setStudentId(res.id);
      } else {
        // no id information available
        setStudentId(null);
      }
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
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <h2 className="text-xl font-bold mb-4">Create Student</h2>
      <DynamicBulkForm
        schema_name="Student"
        presetFields={presetFields}
        tutorOptions={tutorOptions}
        coachOptions={coachOptions}
        onSubmit={handleSubmit}
        studentId={studentId}
        folder="students"
      />
    </div>
  );
}
