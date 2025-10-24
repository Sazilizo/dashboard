import React, { useEffect, useState } from "react";
import api from "../api/client";
import {
  cacheTable,
  getTable,
  queueMutation,
  syncMutations,
} from "../utils/tableCache";

export default function useOfflineTable(tableName, filter = {}, select = "*", pageSize = 40, sortBy= "id", sortOrder = "asc") {
  const [rows, setRows] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const allRowsRef = React.useRef([]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      syncMutations();
      setPage(1);
      fetchTable(1, true);
    }
    function handleOffline() { setIsOnline(false); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const bc = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("offline-sync") : null;
    const onMsg = (ev) => {
      if (!ev?.data) return;
      if (ev.data.type === "synced") {
        // refresh data after sync
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

  async function fetchTable(pageNum = 1, reset = false) {
    setLoading(true);
    setError(null);
    if (isOnline) {
      let query = api.
        from(tableName).select(select).order(sortBy, { ascending: sortOrder === "asc" }).range((pageNum - 1) * pageSize, pageNum * pageSize - 1);
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
        // Skip empty filters
      });
      const { data, error } = await query;
      if (error) setError(error);
      if (data) {
        if (reset) {
          allRowsRef.current = data;
        } else {
          allRowsRef.current = [...allRowsRef.current, ...data];
        }
        setRows([...allRowsRef.current]);
        await cacheTable(tableName, allRowsRef.current);
        setHasMore(data.length === pageSize);
      } else {
        setHasMore(false);
      }
    } else {
      const cached = await getTable(tableName);
      // Sort offline
      let sorted = [...cached];
      sorted.sort((a, b) => {
        if (sortOrder === "asc") return a[sortBy] > b[sortBy] ? 1 : -1;
        else return a[sortBy] < b[sortBy] ? 1 : -1;
      });
      setRows(sorted.slice(0, pageNum * pageSize));
      setHasMore(sorted.length > pageNum * pageSize);
    }
    setLoading(false);
  }

  useEffect(() => {
    setPage(1);
    fetchTable(1, true);
    // eslint-disable-next-line
  }, [tableName, isOnline, JSON.stringify(filter), select, sortBy, sortOrder]);

  const loadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchTable(nextPage);
    }
  };

  // Mutations
  async function addRow(payload) {
    if (isOnline) {
      // When online, perform insert and return the created record so callers can access the new id
      const { data, error } = await api.from(tableName).insert(payload).select();
      if (error) {
        setError(error);
        return null;
      }
      // refresh table
      fetchTable();
      // return first inserted record (most APIs return array)
      return Array.isArray(data) && data.length ? data[0] : null;
    } else {
      // create a client temporary id to show immediately in the UI
      const tempId = `__tmp_${Date.now()}`;
      const payloadWithTemp = { ...payload, id: tempId };
      // queue mutation and get back mutation key
      const mutationKey = await queueMutation(tableName, "insert", payloadWithTemp);
      // mark row as queued so UI can show status
      const queuedRow = { ...payloadWithTemp, __queued: true, __mutationKey: mutationKey };
      setRows((prev) => [...prev, queuedRow]);
      return { tempId, mutationKey };
    }
  }

  async function updateRow(id, data) {
    if (isOnline) {
      await api.from(tableName).update(data).eq("id", id);
      fetchTable();
      return null;
    } else {
      const mutationKey = await queueMutation(tableName, "update", { id, data });
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...data, __queued: true, __mutationKey: mutationKey } : row))
      );
      return { mutationKey };
    }
  }

  async function deleteRow(id) {
    if (isOnline) {
      await api.from(tableName).delete().eq("id", id);
      fetchTable();
      return null;
    } else {
      const mutationKey = await queueMutation(tableName, "delete", { id });
      // keep the row but mark as queued delete, or remove from UI — we'll remove
      setRows((prev) => prev.filter((row) => row.id !== id));
      return { mutationKey };
    }
  }

  return { rows, loading, error, addRow, updateRow, deleteRow, isOnline, page, hasMore, loadMore, sortBy, sortOrder };
}