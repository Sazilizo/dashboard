import React, { useState, useEffect } from "react";
import DynamicBulkForm from "./DynamicBulkForm";
import useOfflineTable from "../../hooks/useOfflineTable";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import { useParams } from "react-router-dom";
import SelectableList from "../widgets/SelectableList";
import { useAuth } from "../../context/AuthProvider";
import { useSupabaseWorkers } from "../../hooks/useSupabaseWorkers";
import { cacheTable, getTable } from "../../utils/tableCache";
import { useSchools } from "../../context/SchoolsContext";
import UploadFile from "../profiles/UploadHelper";
import '../../styles/formStyles.css'


export default function TrainingForm() {
  const { id } = useParams(); // single worker mode if present
  const { user } = useAuth();
  const {schools} = useSchools()
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const { addRow } = useOfflineTable("training_records");
  const { isOnline } = useOnlineStatus();

  // Fetch all workers for bulk mode
  const { workers, loading, error } = useSupabaseWorkers({
      school_id: ["superuser", "admin", "hr", "viewer"].includes(user && user?.profile?.roles.name)
        ? schools.map(s => s.id) // all schools
        : [user?.profile?.school_id],       // only user's school
    });

  const [displayedWorkers, setDisplayedWorkers] = useState([]);

  // Keep a cached copy when online, and fall back to cached workers when offline
  useEffect(() => {
    let mounted = true;
    async function ensureWorkers() {
      try {
        if (isOnline) {
          if (Array.isArray(workers) && workers.length) {
            if (mounted) setDisplayedWorkers(workers);
            try {
              await cacheTable("workers", workers);
            } catch (err) {
              console.warn("Failed to cache workers", err);
            }
          }
        } else {
          const cached = await getTable("workers");
          if (mounted) setDisplayedWorkers(cached || []);
        }
      } catch (err) {
        console.warn("ensureWorkers error", err);
      }
    }
    ensureWorkers();
    return () => { mounted = false; };
  }, [workers, isOnline]);

  // Preset fields for DynamicBulkForm
  const presetFields = {
    // logged_by: user?.id,
    // single mode: preset worker_id to [id]
    ...(id ? { worker_id: [id] } : { worker_id: selectedWorkers }),
  };

  return (
    <div className="p-6">
      {process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && (
        <div style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              try {
                if (typeof window.softRefresh === 'function') await window.softRefresh();
                else if (typeof window.refreshCache === 'function') await window.refreshCache();
                else window.location.reload();
              } catch (err) {
                console.warn('softRefresh failed', err);
                try { window.location.reload(); } catch (e) { /* ignore */ }
              }
            }}
          >
            Debug: Soft Refresh Cache
          </button>
        </div>
      )}
      <h1 className="text-2xl font-bold mb-6">
        {id ? "Log Training for Worker" : "Create Worker Trainings (Bulk)"}
      </h1>

      {/* Bulk mode: show MultiSelect */}
      {!id &&(
        <div className="mb-4">
          <SelectableList
            students={workers}
            resource="workers"
            checkbox={true}
            value={selectedWorkers}
            onChange={setSelectedWorkers}
            bucketName="worker-uploads"
            folderName="workers"
          />
        </div>
      )}

      <div className="form-wrapper">
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

              // remove logged_by if present
              delete record.logged_by;

              // If online, upload photo now; if offline, queueMutation will keep the File/blob
              if (record.photo && isOnline) {
                const uploadedUrl = await UploadFile(
                  record.photo,
                  "training-uploads",
                  `${workerId}/${record.title || "training"}`
                );
                record.photo = uploadedUrl;
              }

              const res = await addRow(record);
              if (res?.mutationKey && !isOnline) {
                // queued
              }
          }

        }}
        />
      </div>
    </div>
  );
}