import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client"; // Supabase client
import { useFilters } from "./FiltersContext";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { openDB, deleteDB } from "idb";

const SchoolsContext = createContext();

const DB_NAME = "offline-dashboard";
const DB_VERSION = 1;
const STORE_NAME = "schools";

// 🔹 Open (or create) IndexedDB store safely
async function getDB() {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(upgradeDb) {
        if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
          upgradeDb.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
    });
    return db;
  } catch (err) {
    console.warn("[offlineDB] Failed to open DB, resetting:", err);
    await deleteDB(DB_NAME);
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(upgradeDb) {
        upgradeDb.createObjectStore(STORE_NAME, { keyPath: "id" });
      },
    });
    return db;
  }
}

// 🔹 Safe wrapper to load cached schools
async function loadCachedSchoolsSafe() {
  try {
    const db = await getDB();
    return await db.getAll(STORE_NAME);
  } catch (err) {
    console.warn("Failed to load cached schools, resetting DB:", err);
    await deleteDB(DB_NAME);
    return [];
  }
}

// 🔹 Save schools to IndexedDB
async function cacheSchoolsOffline(schools) {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await tx.store.clear();
    for (const school of schools) {
      await tx.store.put(school);
    }
    await tx.done;
  } catch (err) {
    console.warn("Failed to cache schools:", err);
  }
}

export function SchoolsProvider({ children }) {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { filters } = useFilters();
  const { isOnline } = useOnlineStatus();

  const refreshSchools = async () => {
    setLoading(true);
    try {
      if (!isOnline) {
        console.log("Offline — loading schools from cache");
        const cached = await loadCachedSchoolsSafe();
        setSchools(cached || []);
        setLoading(false);
        return;
      }

      // Fetch online
      let query = api
        .from("schools")
        .select(`
          *,
          workers:workers(count),
          students:students(count),
          users:users(count),
          meals:meal_distributions(count)
        `)
        .order("name", { ascending: true });

      if (filters.role_id) query = query.eq("role_id", filters.role_id);
      if (filters.id) query = query.eq("worker_id", filters.id);

      const { data, error } = await query;
      if (error) throw error;

      const schoolsWithCounts = data.map((school) => ({
        ...school,
        workers_count: school.workers?.[0]?.count ?? 0,
        students_count: school.students?.[0]?.count ?? 0,
        users_count: school.users?.[0]?.count ?? 0,
        meals_count: school.meals?.[0]?.count ?? 0,
      }));

      setSchools(schoolsWithCounts);
      setError(null);

      // Cache for offline use
      await cacheSchoolsOffline(schoolsWithCounts);
    } catch (err) {
      console.error("Failed to load schools", err);
      setError(err);
      const cached = await loadCachedSchoolsSafe();
      if (cached.length > 0) {
        setSchools(cached);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSchools();
  }, [filters, isOnline]);

  return (
    <SchoolsContext.Provider
      value={{
        schools,
        loading,
        error,
        refreshSchools,
        isOnline,
      }}
    >
      {children}
    </SchoolsContext.Provider>
  );
}

export const useSchools = () => useContext(SchoolsContext);
