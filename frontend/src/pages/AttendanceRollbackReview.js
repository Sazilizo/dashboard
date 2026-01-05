import React, { useEffect, useState, useCallback } from "react";
import useToast from "../hooks/useToast";
import Photos from "../components/profiles/Photos";
import api from "../api/client";

/**
 * AttendanceRollbackReview
 * - Lists workers whose attendance was auto-cleared
 * - Shows reason
 * - Allows admin to rollback / restore
 */
export default function AttendanceRollbackReview({ currentUser }) {
  const { showToast } = useToast();
  const [rollbackRecords, setRollbackRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchRollbackRecords = useCallback(async () => {
    setLoading(true);
    const { data, error } = await api
      .from("worker_attendance_rollback")
      .select(`
        id,
        worker_id,
        date,
        sign_in_time,
        sign_out_time,
        reason,
        cleared_by,
        cleared_at,
        workers!inner(name, last_name, school_name)
      `)
      .order("cleared_at", { ascending: false });

    if (error) {
      showToast("Failed to fetch rollback records", "error");
      console.error(error);
    } else {
      setRollbackRecords(data || []);
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    fetchRollbackRecords();
  }, [fetchRollbackRecords]);

  const handleRollback = async (recordId) => {
    if (!currentUser || !currentUser.id) {
      showToast("Cannot perform rollback: missing user", "error");
      return;
    }

    setLoading(true);
    const { error } = await api.rpc("rollback_attendance", {
      p_rollback_id: recordId,
      p_admin_uuid: currentUser.id,
    });

    if (error) {
      showToast("Rollback failed", "error");
      console.error(error);
    } else {
      showToast("Attendance restored successfully", "success");
      fetchRollbackRecords();
    }
    setLoading(false);
  };

  if (loading) return <div>Loading rollback records...</div>;

  if (!rollbackRecords.length) {
    return <div style={{ padding: 20, color: "#6b7280" }}>No attendance rollback records</div>;
  }

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: "10px 16px",
          borderRadius: 6,
          border: "1px solid #d1d5db",
          background: "#f3f4f6",
          color: "#1f2937",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          transition: "all 0.2s ease",
        }}
      >
        <span>{isExpanded ? "▼" : "▶"}</span>
        Attendance Rollback Review ({rollbackRecords.length})
      </button>

      {isExpanded && (
        <div style={{ maxHeight: 600, overflowY: "auto" }}>
      {rollbackRecords.map((r) => (
        <div
          key={r.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            marginBottom: 8,
            background: "#fff",
          }}
        >
          <div style={{ width: 48, height: 48, borderRadius: 6, overflow: "hidden", position: "relative" }}>
            <Photos bucketName="worker-uploads" folderName="workers" id={r.worker_id} photoCount={1} />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {r.workers.name} {r.workers.last_name || ""}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {r.workers.school_name} • {r.date} • Reason: {r.reason}
            </div>
            {r.cleared_by && (
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                Cleared by: {r.cleared_by} at {new Date(r.cleared_at).toLocaleString()}
              </div>
            )}
          </div>

          <div>
            <button
              onClick={() => handleRollback(r.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #3b82f6",
                background: "#3b82f6",
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Restore
            </button>
          </div>
        </div>
      ))}
        </div>
      )}
    </div>
  );
}
