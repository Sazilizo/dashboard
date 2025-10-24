// src/hooks/useOfflineTable.js
import React, { useEffect, useState, useRef } from "react";
import api from "../api/client";
import {
  cacheTable,
  getTable,
  queueMutation,
  syncMutations,
} from "../utils/tableCache";

/**
 * useOfflineTable
 * ----------------
 * Provides online/offline-aware data fetching with local caching, pagination,
 * sorting, and queued mutations for Supabase-like tables.
 */
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
        let query = api
          .from(tableName)
          .select(select)
          .order(sortBy, { ascending: sortOrder === "asc" })
          .range((pageNum - 1) * pageSize, pageNum * pageSize - 1);

        // Apply filters
        Object.entries(filter).forEach(([key, value]) => {
          if (Array.isArray(value) && value.length > 0) {
            query = query.in(key, value);
          } else if (
            value !== undefined &&
            value !== null &&
            value !== "" &&
            (!Array.isArray(value) || value.length > 0)
          ) {
            query = query.eq(key, value);
          }
        });

        const { data, error } = await query;

        if (error) throw error;

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
      console.error("Fetch error:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  /** 🎯 Refetch when dependencies change */
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

  /** ✳️ Add row (online/offline aware) */
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
      setError(err);
      return null;
    }
  }

  /** ♻️ Update row */
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
      setError(err);
      return null;
    }
  }

  /** 🗑 Delete row */
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
      setError(err);
      return null;
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
