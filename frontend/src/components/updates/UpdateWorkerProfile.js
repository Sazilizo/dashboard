import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/client";
import DynamicBulkForm, { getTableColumns } from "../forms/DynamicBulkForm";
import UploadFileHelper from "../profiles/UploadHelper";
import { useSchools } from "../../context/SchoolsContext";
import { useAuth } from "../../context/AuthProvider";
import useOnlineStatus from "../../hooks/useOnlineStatus";

export default function UpdateWorkerProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const { schools } = useSchools();
  const { isOnline } = useOnlineStatus();
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);

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
          isOnline={isOnline}
          schoolIds={schoolIds}
          folder="workers"
          onSubmit={async (formData) => {
            try {
              console.log("UpdateWorkerProfile: received formData", formData);
              
              // Dynamically fetch real DB columns for workers
              const columns = await getTableColumns("workers");
              console.log("UpdateWorkerProfile: DB columns", columns);
              
              const filtered = {};
              for (const k in formData) {
                if (columns.includes(k)) filtered[k] = formData[k];
              }

              console.log("UpdateWorkerProfile: filtered payload", filtered);

              // Handle all file uploads (photo, id_copy_pdf, cv_pdf, clearance_pdf, child_protection_pdf)
              const fileFields = ["photo", "id_copy_pdf", "cv_pdf", "clearance_pdf", "child_protection_pdf"];
              for (const fieldName of fileFields) {
                if (filtered[fieldName] instanceof File) {
                  const uploadedUrl = await UploadFileHelper(
                    filtered[fieldName],
                    "workers",
                    id
                  );
                  filtered[fieldName] = uploadedUrl;
                }
              }

              // Save updates
              const { data, error } = await api
                .from("workers")
                .update(filtered)
                .eq("id", id)
                .select();

              if (error) {
                console.error("UpdateWorkerProfile: Supabase error", error);
                throw error;
              }

              console.log("UpdateWorkerProfile: update successful", data);
              alert("Worker profile updated successfully!");
            } catch (err) {
              console.error("UpdateWorkerProfile: Error during update", err);
              alert(`Failed to update worker profile: ${err.message || JSON.stringify(err)}`);
            }
          }}
        />
      )}
    </div>
  );
}
