import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/client";
import DynamicBulkForm from "../forms/DynamicBulkForm";
import UploadFileHelper from "../profiles/UploadHelper";
import { useSchools } from "../../context/SchoolsContext";
import { useAuth } from "../../context/AuthProvider";

export default function UpdateWorkerProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const { schools } = useSchools();
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tutorOptions, setTutorOptions] = useState([]);
  const [coachOptions, setCoachOptions] = useState([]);

  // Compute allowed school IDs based on user role
  const schoolIds = useMemo(() => {
    const roleName = user?.profile?.roles?.name;
    if (["superuser", "admin", "hr", "viewer"].includes(roleName))
      return schools.map((s) => s.id).filter(Boolean);
    return user?.profile?.school_id ? [user.profile.school_id] : [];
  }, [user?.profile?.roles?.name, user?.profile?.school_id, schools]);

  // Fetch worker details
  useEffect(() => {
    const fetchWorker = async () => {
      try {
        const { data, error } = await api
          .from("workers")
          .select(`
            *
          `)
          .eq("id", id)
          .single();

        if (error) throw error;
        setWorker(data);
      } catch (err) {
        console.error("Failed to fetch worker:", err.message);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchWorker();
  }, [id]);

  // Populate worker options for linking (like supervisor, tutor, coach, etc.)
  useEffect(() => {
    if (!schoolIds.length) return;

    async function fetchWorkers() {
      const { data, error } = await api
        .from("workers")
        .select("id, name, last_name, role:roles(name), school_id")
        .in("school_id", schoolIds);

      if (error) {
        console.error("Failed to fetch workers:", error);
        return;
      }

      setTutorOptions(
        data
          ?.filter((w) => w.role?.name && /tutor/i.test(w.role.name))
          ?.map((w) => ({
            value: w.id,
            label: `${w.name} ${w.last_name}`,
            school_id: w.school_id,
          })) || []
      );

      setCoachOptions(
        data
          ?.filter((w) => w.role?.name && /coach/i.test(w.role.name))
          ?.map((w) => ({
            value: w.id,
            label: `${w.name} ${w.last_name}`,
            school_id: w.school_id,
          })) || []
      );
    }

    fetchWorkers();
  }, [schoolIds]);

  if (loading) return <p>Loading worker data...</p>;

  return (
    <div className="p-6">
      <div className="profile-learner-print mb-4">
        <button className="btn btn-primary" onClick={() => window.history.back()}>
          Back to Workers
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-6">Update Worker Profile</h1>

      {worker && (
        <DynamicBulkForm
          schema_name="Worker"
          presetFields={worker}
          id={id}
          onSubmit={async (formData) => {
            try {
              const record = { ...formData };

              // Handle photo upload if new file provided
              if (record.photo instanceof File) {
                const uploadedUrl = await UploadFileHelper(
                  record.photo,
                  "workers",
                  id
                );
                record.photo = uploadedUrl;
              }

              // Save updates
              const { error } = await api
                .from("workers")
                .update(record)
                .eq("id", id);

              if (error) throw error;

              alert("Worker profile updated successfully!");
            } catch (err) {
              console.error(err);
              alert("Failed to update worker profile.");
            }
          }}
        />
      )}
    </div>
  );
}
