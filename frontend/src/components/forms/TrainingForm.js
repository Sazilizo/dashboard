import React, { useState, useEffect } from "react";
import DynamicBulkForm from "./DynamicBulkForm";
import api from "../../api/client";
import { useParams } from "react-router-dom";
import EntityMultiSelect from "../../hooks/EntityMultiSelect";
import { useAuth } from "../../context/AuthProvider";
import { useSupabaseWorkers } from "../../hooks/useSupabaseWorkers";
import { useSchools } from "../../context/SchoolsContext";
import UploadFile from "../profiles/UploadHelper";


export default function TrainingForm() {
  const { id } = useParams(); // single worker mode if present
  const { user } = useAuth();
  const {schools} = useSchools()
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  // Fetch all workers for bulk mode
  const { workers, loading, error } = useSupabaseWorkers({
      school_id: ["superuser", "admin", "hr", "viewer"].includes(user && user?.profile?.roles.name)
        ? schools.map(s => s.id) // all schools
        : [user?.profile?.school_id],       // only user's school
    });

  // Preset fields for DynamicBulkForm
  const presetFields = {
    // logged_by: user?.id,
    // single mode: preset worker_id to [id]
    ...(id ? { worker_id: [id] } : { worker_id: selectedWorkers }),
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        {id ? "Log Training for Worker" : "Create Worker Trainings (Bulk)"}
      </h1>

      {/* Bulk mode: show MultiSelect */}
      {!id &&(
        <div className="mb-4">
          <EntityMultiSelect
            label="Select Workers"
            options={workers}
            value={selectedWorkers}
            onChange={setSelectedWorkers}
          />
        </div>
      )}

      <DynamicBulkForm
        schema_name="training_records"
        presetFields={presetFields}
        onSubmit={async (formData, singleId) => {
          // handle bulk inserts
          const workerIds = singleId ? [singleId] : formData.worker_id;

          if (!workerIds || workerIds.length === 0) {
            throw new Error("Please select at least one worker.");
          }


          for (const workerId of workerIds) {
            const record = {
              ...formData,
              worker_id: workerId,
            };

            if (record.photo) {
              const uploadedUrl = await UploadFile(
                record.photo,
                "training-uploads",
                `${workerId}/${record.title || "training"}`
              );
              record.photo = uploadedUrl;
            }

            delete record.logged_by;

            const { error } = await api.from("training_records").insert(record);
            if (error) throw error;
          }

        }}
      />
    </div>
  );
}