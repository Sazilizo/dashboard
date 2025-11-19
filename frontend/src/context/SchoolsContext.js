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
  // useFilters may be undefined if FiltersProvider is not mounted yet. Be defensive.
  const filtersCtx = useFilters();
  const filters = (filtersCtx && filtersCtx.filters) || {};
  const { isOnline } = useOnlineStatus();
  const lastFetchTime = React.useRef(0);
  const FETCH_DEBOUNCE_MS = 10000; // 10 seconds debounce

  const refreshSchools = async (forceRefresh = false, skipLoading = false) => {
    const now = Date.now();
    
    // Debounce rapid refreshes unless forced
    if (!forceRefresh && now - lastFetchTime.current < FETCH_DEBOUNCE_MS) {
      console.log('[SchoolsContext] Skipping refresh - too soon since last fetch');
      return;
    }

    console.log('[SchoolsContext] Starting school refresh, isOnline:', isOnline, 'skipLoading:', skipLoading);

    // CRITICAL: ALWAYS load cache first and set it immediately
    let cached = [];
    try {
      cached = await loadCachedSchoolsSafe();
      console.log('[SchoolsContext] Cache loaded:', cached?.length || 0, 'schools');
      
      if (cached && cached.length > 0) {
        console.log('[SchoolsContext] Setting schools from cache immediately');
        setSchools(cached);
        if (!skipLoading) setLoading(false);
        setError(null); // Clear any previous errors
      } else {
        console.warn('[SchoolsContext] No cached schools found - IndexedDB may be empty');
        if (!skipLoading) setLoading(false); // Still stop loading even if cache is empty
      }
    } catch (cacheErr) {
      console.error('[SchoolsContext] Critical: Failed to load from cache:', cacheErr);
      setLoading(false);
      setError(cacheErr);
      // Continue anyway - maybe API will work
    }

    // If offline, stop here - we've already loaded cache
    if (!isOnline) {
      console.log('[SchoolsContext] Offline mode - using cached schools only');
      return;
    }

    // Online: try to fetch fresh data in background (non-blocking)
    console.log('[SchoolsContext] Online - attempting background refresh from API');
    
    try {
      const { data, error } = await api
        .from("schools")
        .select("*")
        .order("name", { ascending: true });
      
      console.log('[SchoolsContext] API response:', { 
        dataCount: data?.length || 0, 
        hasError: !!error,
        errorMessage: error?.message 
      });
      
      if (error) {
        console.warn('[SchoolsContext] API error - keeping cached data:', error.message);
        // Don't throw - just keep using cached data
        return;
      }

      const dataArr = data || [];

      if (dataArr.length === 0) {
        console.warn('[SchoolsContext] API returned 0 schools - keeping cached data');
        return;
      }

      // Map to consistent format
      const schoolsData = dataArr.map((school) => ({
        ...school,
        workers_count: 0,
        students_count: 0,
        users_count: 0,
        meals_count: 0,
      }));

      console.log('[SchoolsContext] Successfully fetched', schoolsData.length, 'schools from API');
      
      // Update state with fresh data
      setSchools(schoolsData);
      setError(null);
      lastFetchTime.current = now;

      if (!skipLoading) setLoading(false);

      // Cache for offline use
      try {
        await cacheSchoolsOffline(schoolsData);
        console.log('[SchoolsContext] Cached', schoolsData.length, 'schools to IndexedDB');
      } catch (cacheErr) {
        console.warn('[SchoolsContext] Failed to cache schools (non-critical):', cacheErr);
      }
      
    } catch (err) {
      console.error('[SchoolsContext] API fetch failed - keeping cached data:', err);
      // Don't set error state if we have cached data
      if (!cached || cached.length === 0) {
        setError(err);
      }
      // Keep using cached data that we loaded earlier
    }
  };

  // Initial load - ALWAYS load on mount
  useEffect(() => {
    console.log('[SchoolsContext] Initial mount - loading schools from cache/API');
    // Initial load should show loading UI
    refreshSchools(true, false);
  }, []);

  // Don't refresh on filter changes - filters consume schools, not trigger refresh
  // useEffect(() => {
  //   if (Object.keys(filters).length > 0) {
  //     refreshSchools(false);
  //   }
  // }, [filters]);

  // Refresh when coming back online
  useEffect(() => {
    if (isOnline) {
      console.log('[SchoolsContext] Back online - refreshing schools from API');
      // background refresh to avoid disrupting user's current view
      refreshSchools(true, true);
    }
  }, [isOnline]);

  // Listen for connectivity restored event
  useEffect(() => {
    const handleConnectivityRestored = () => {
      console.log('[SchoolsContext] Connectivity restored - refreshing schools (background)');
      refreshSchools(true, true);
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
