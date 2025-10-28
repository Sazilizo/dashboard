// src/pages/UpdateLearnerProfile.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/client";
import DynamicBulkForm from "../forms/DynamicBulkForm";
import UploadFileHelper from "../profiles/UploadHelper";
import { useSchools } from "../../context/SchoolsContext";
import { useAuth } from "../../context/AuthProvider";
import useToast from "../../hooks/useToast";
import ToastContainer from "../ToastContainer";

export default function UpdateLearnerProfile() {
  const { id } = useParams();
  const {user} = useAuth()
  const {schools} = useSchools();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tutorOptions, setTutorOptions] = useState([]);
  const [coachOptions, setCoachOptions] = useState([]);
  const { toasts, showToast, removeToast } = useToast();


  const schoolIds = React.useMemo(() => {
        const roleName = user?.profile?.roles?.name;
        if (["superuser","admin","hr","viewer"].includes(roleName)) return schools.map(s => s.id).filter(Boolean);
        return user?.profile?.school_id ? [user.profile.school_id] : [];
      }, [user?.profile?.roles?.name, user?.profile?.school_id, schools]);

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
          .filter((w) => w.role?.name && /tutor/i.test(w.role.name))
          .map((w) => ({ value: w.id, label: `${w.name} ${w.last_name}`, school_id: w.school_id}))
      );

      setCoachOptions(
        data
          .filter((w) => w.role?.name && /coach/i.test(w.role.name))
          .map((w) => ({ value: w.id, label: `${w.name} ${w.last_name}`, school_id: w.school_id }))
      );
    }

    fetchWorkers();
  }, [schoolIds]);

  useEffect(()=>{
    console.log("student to update:", student)
  },[student])
  if (loading) return <p>Loading student data...</p>;

  return (
    <div className="p-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
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
          tutorOptions={tutorOptions}
          coachOptions={coachOptions}
          id={id && id}
          folder="students"
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
              showToast("Student profile updated successfully!", "success");
            } catch (err) {
              console.error(err);
              showToast("Failed to update student profile. Please try again.", "error");
            }
          }}
        />
      )}
    </div>
  );
}
