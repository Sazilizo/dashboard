import React, { useEffect, useState } from "react";
import api from "../api/client";
import {
  cacheTable,
  getTable,
  queueMutation,
  syncMutations,
} from "../utils/tableCache";

export default function useOfflineTable(tableName, filter = {}, select = "*", pageSize = 20, sortBy= "id", sortOrder = "asc") {
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
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
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
      await api.from(tableName).insert(payload);
      fetchTable();
    } else {
      await queueMutation(tableName, "insert", payload);
      setRows((prev) => [...prev, payload]);
    }
  }

  async function updateRow(id, data) {
    if (isOnline) {
      await api.from(tableName).update(data).eq("id", id);
      fetchTable();
    } else {
      await queueMutation(tableName, "update", { id, data });
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...data } : row))
      );
    }
  }

  async function deleteRow(id) {
    if (isOnline) {
      await api.from(tableName).delete().eq("id", id);
      fetchTable();
    } else {
      await queueMutation(tableName, "delete", { id });
      setRows((prev) => prev.filter((row) => row.id !== id));
    }
  }

  return { rows, loading, error, addRow, updateRow, deleteRow, isOnline, page, hasMore, loadMore, sortBy, sortOrder };
}