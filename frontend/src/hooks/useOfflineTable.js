// src/hooks/useOfflineTable.js
import React, { useEffect, useState, useRef } from "react";
import api from "../api/client";
import {
  cacheTable,
  getTable,
  queueMutation,
  syncMutations,
} from "../utils/tableCache";


export default function useOfflineTable(
  tableName,
  filter = {},
  select = "*",
  pageSize = 40,
  sortBy = "id",
  sortOrder = "asc"
) {
  const [rows, setRows] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const allRowsRef = useRef([]);

  /** 🔌 Sync event handlers */
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      syncMutations();
      setPage(1);
      fetchTable(1, true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // BroadcastChannel ensures sync updates propagate across open tabs
    const bc =
      typeof window !== "undefined" && "BroadcastChannel" in window
        ? new BroadcastChannel("offline-sync")
        : null;

    const onMsg = (ev) => {
      if (!ev?.data) return;
      if (ev.data.type === "synced") {
        setPage(1);
        fetchTable(1, true);
      }
    };

    if (bc) bc.addEventListener("message", onMsg);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (bc) bc.removeEventListener("message", onMsg);
    };
  }, []);

  /** 📦 Fetch table data */
  async function fetchTable(pageNum = 1, reset = false) {
    setLoading(true);
    setError(null);

    try {
      if (isOnline) {
        // Build query with timeout protection
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        console.log(`[useOfflineTable] ${tableName}: Calling api.from() for online fetch`);
        
        let query = api
          .from(tableName)
          .select(select)
          .order(sortBy, { ascending: sortOrder === "asc" })
          .range((pageNum - 1) * pageSize, pageNum * pageSize - 1);

        console.log(`[useOfflineTable] ${tableName}: Built base query object`);

        // Add abort signal if supported
        if (typeof query.abortSignal === 'function') {
          query = query.abortSignal(controller.signal);
        }

        // Apply filters
        Object.entries(filter).forEach(([key, value]) => {
          // Skip meta keys (e.g., _refresh) used only to force re-fetch
          if (key.startsWith("_")) {
            console.log(`[useOfflineTable] Skipping meta key: ${key}`);
            return;
          }
          if (Array.isArray(value) && value.length > 0) {
            console.log(`[useOfflineTable] Adding IN filter: ${key} in [${value.join(", ")}]`);
            query = query.in(key, value);
          } else if (
            value !== undefined &&
            value !== null &&
            value !== "" &&
            (!Array.isArray(value) || value.length > 0)
          ) {
            console.log(`[useOfflineTable] Adding EQ filter: ${key} = ${value}`);
            query = query.eq(key, value);
          }
        });

        try {
          const { data, error } = await query;
          clearTimeout(timeoutId);

          if (error) {
            console.error(`[useOfflineTable] Query error for ${tableName}:`, error);
            console.error(`[useOfflineTable] Error message:`, error.message);
            console.error(`[useOfflineTable] Error details:`, error.details);
            console.error(`[useOfflineTable] Error hint:`, error.hint);
            console.error(`[useOfflineTable] Full error object:`, error);
            throw error;
          }

          if (data) {
            allRowsRef.current = reset
              ? data
              : [...allRowsRef.current, ...data];

            setRows([...allRowsRef.current]);
            await cacheTable(tableName, allRowsRef.current);
            setHasMore(data.length === pageSize);
          } else {
            setHasMore(false);
          }
        } catch (queryError) {
          clearTimeout(timeoutId);
          
          console.error(`[useOfflineTable] Exception during query for ${tableName}:`);
          console.error(`[useOfflineTable] Error message:`, queryError.message);
          console.error(`[useOfflineTable] Error stack:`, queryError.stack);
          console.error(`[useOfflineTable] Full error:`, queryError);
          
          // If query failed (timeout or network), use cached data
          if (queryError.name === 'AbortError') {
            console.warn(`[useOfflineTable] ${tableName} query timed out - using cache`);
          } else {
            console.warn(`[useOfflineTable] ${tableName} query failed:`, queryError.message);
          }
          
          // Fall through to offline mode
          throw queryError;
        }
      } else {
        // Offline mode → read cached data
        const cached = (await getTable(tableName)) || [];

        let sorted = [...cached].sort((a, b) => {
          if (sortOrder === "asc") return a[sortBy] > b[sortBy] ? 1 : -1;
          else return a[sortBy] < b[sortBy] ? 1 : -1;
        });

        const paginated = sorted.slice(0, pageNum * pageSize);
        setRows(paginated);
        setHasMore(sorted.length > pageNum * pageSize);
      }
    } catch (err) {
      console.warn(`[useOfflineTable] Falling back to cache for ${tableName}:`, err.message);
      
      // Always try to load from cache on any error
      try {
        const cached = (await getTable(tableName)) || [];

        let sorted = [...cached].sort((a, b) => {
          if (sortOrder === "asc") return a[sortBy] > b[sortBy] ? 1 : -1;
          else return a[sortBy] < b[sortBy] ? 1 : -1;
        });

        const paginated = sorted.slice(0, pageNum * pageSize);
        setRows(paginated);
        setHasMore(sorted.length > pageNum * pageSize);
      } catch (cacheErr) {
        console.error(`[useOfflineTable] Cache read failed for ${tableName}:`, cacheErr);
        setError(cacheErr);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    fetchTable(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, isOnline, JSON.stringify(filter), select, sortBy, sortOrder]);

  /** ➕ Load more pages */
  const loadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchTable(nextPage);
    }
  };

  /** Add row (online/offline aware) */
  async function addRow(payload) {
    try {
      if (isOnline) {
        const { data, error } = await api
          .from(tableName)
          .insert(payload)
          .select();

        if (error) throw error;
        fetchTable(1, true);

        return Array.isArray(data) && data.length ? data[0] : null;
      } else {
        const tempId = `__tmp_${Date.now()}`;
        const payloadWithTemp = { ...payload, id: tempId };
        const mutationKey = await queueMutation(
          tableName,
          "insert",
          payloadWithTemp
        );

        const queuedRow = {
          ...payloadWithTemp,
          __queued: true,
          __mutationKey: mutationKey,
        };

        setRows((prev) => [...prev, queuedRow]);
        return { tempId, mutationKey };
      }
    } catch (err) {
      // Log detailed context for easier debugging (400 responses often include details/hint)
      try {
        console.error(`[useOfflineTable] addRow failed for ${tableName}`);
        console.error({ payload });
        console.error({ message: err?.message, details: err?.details, hint: err?.hint, code: err?.code, status: err?.status });
        // Also dump the original error object to capture any extra properties
        console.error({ rawError: err });
      } catch (logErr) {
        console.error(`[useOfflineTable] addRow logging failed`, logErr);
      }

      setError(err);
      // Return object with error for callers to inspect and surface in UI/console
      return { __error: true, error: err };
    }
  }

  /** Update row */
  async function updateRow(id, data) {
    try {
      if (isOnline) {
        const { error } = await api.from(tableName).update(data).eq("id", id);
        if (error) throw error;
        fetchTable();
        return null;
      } else {
        const mutationKey = await queueMutation(tableName, "update", {
          id,
          data,
        });

        setRows((prev) =>
          prev.map((row) =>
            row.id === id
              ? { ...row, ...data, __queued: true, __mutationKey: mutationKey }
              : row
          )
        );

        return { mutationKey };
      }
    } catch (err) {
        try {
          console.error(`[useOfflineTable] updateRow failed for ${tableName} id=${id}`);
          console.error({ id, data });
          console.error({ message: err?.message, details: err?.details, hint: err?.hint, code: err?.code, status: err?.status });
          console.error({ rawError: err });
        } catch (logErr) {
          console.error(`[useOfflineTable] updateRow logging failed`, logErr);
        }

        setError(err);
        return { __error: true, error: err };
    }
  }

  /**  Delete row */
  async function deleteRow(id) {
    try {
      if (isOnline) {
        const { error } = await api.from(tableName).delete().eq("id", id);
        if (error) throw error;
        fetchTable();
        return null;
      } else {
        const mutationKey = await queueMutation(tableName, "delete", { id });
        setRows((prev) => prev.filter((row) => row.id !== id));
        return { mutationKey };
      }
    } catch (err) {
        try {
          console.error(`[useOfflineTable] deleteRow failed for ${tableName} id=${id}`);
          console.error({ id });
          console.error({ message: err?.message, details: err?.details, hint: err?.hint, code: err?.code, status: err?.status });
          console.error({ rawError: err });
        } catch (logErr) {
          console.error(`[useOfflineTable] deleteRow logging failed`, logErr);
        }

        setError(err);
        return { __error: true, error: err };
    }
  }

  return {
    rows,
    loading,
    error,
    addRow,
    updateRow,
    deleteRow,
    isOnline,
    page,
    hasMore,
    loadMore,
    sortBy,
    sortOrder,
  };
}
