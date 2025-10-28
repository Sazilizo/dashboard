import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client"; // Supabase client
import { useFilters } from "./FiltersContext";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { openDB, deleteDB } from "idb";

const SchoolsContext = createContext();

const DB_NAME = "GCU_Schools_offline";
const DB_VERSION = 2;
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
  const lastFetchTime = React.useRef(0);
  const FETCH_DEBOUNCE_MS = 10000; // 10 seconds debounce

  const refreshSchools = async (forceRefresh = false) => {
    const now = Date.now();
    
    // Debounce rapid refreshes unless forced
    if (!forceRefresh && now - lastFetchTime.current < FETCH_DEBOUNCE_MS) {
      console.log('[SchoolsContext] Skipping refresh - too soon since last fetch');
      return;
    }

    // Load cached data immediately for instant display
    const cached = await loadCachedSchoolsSafe();
    if (cached && cached.length > 0) {
      console.log('[SchoolsContext] Loaded', cached.length, 'schools from cache');
      setSchools(cached);
      setLoading(false);
    }

    if (!isOnline) {
      console.log('[SchoolsContext] Offline - using cached schools only');
      setLoading(false);
      return;
    }

    // Fetch fresh data in background if online
    try {
      console.log('[SchoolsContext] Fetching schools from Supabase');
      
      // Simplified query without aggregates for faster loading
      let query = api
        .from("schools")
        .select("*")
        .order("name", { ascending: true });

      console.log('[SchoolsContext] Executing query...');

      const { data, error } = await query;
      
      console.log('[SchoolsContext] Query response:', { dataCount: data?.length || 0, error: error?.message });
      
      if (error) throw error;

      const dataArr = data || [];

      // Simple mapping without complex counts for now
      const schoolsData = dataArr.map((school) => ({
        ...school,
        workers_count: 0, // Can be populated later if needed
        students_count: 0,
        users_count: 0,
        meals_count: 0,
      }));

      console.log('[SchoolsContext] Fetched', schoolsData.length, 'schools from Supabase');
      setSchools(schoolsData);
      setError(null);
      lastFetchTime.current = now;

      // Cache for offline use
      await cacheSchoolsOffline(schoolsData);
    } catch (err) {
      console.error('[SchoolsContext] Failed to load schools from Supabase:', err);
      setError(err);
      
      // Keep showing cached data even on error
      if (!cached || cached.length === 0) {
        const fallbackCached = await loadCachedSchoolsSafe();
        if (fallbackCached.length > 0) {
          console.log('[SchoolsContext] Using cached schools after fetch error');
          setSchools(fallbackCached);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    console.log('[SchoolsContext] Initial mount - loading schools');
    refreshSchools(true);
  }, []);

  // Refresh when filters change
  useEffect(() => {
    if (Object.keys(filters).length > 0) {
      refreshSchools(false);
    }
  }, [filters]);

  // Refresh when coming back online
  useEffect(() => {
    if (isOnline) {
      console.log('[SchoolsContext] Back online - refreshing schools');
      refreshSchools(true);
    }
  }, [isOnline]);

  // Listen for connectivity restored event
  useEffect(() => {
    const handleConnectivityRestored = () => {
      console.log('[SchoolsContext] Connectivity restored - refreshing schools');
      refreshSchools(true);
    };

    window.addEventListener('connectivity-restored', handleConnectivityRestored);
    
    return () => {
      window.removeEventListener('connectivity-restored', handleConnectivityRestored);
    };
  }, []);

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
