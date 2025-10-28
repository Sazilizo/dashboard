import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { onlineApi } from "../api/client";
import tableCache from "../utils/tableCache";
import { cachedFetch, LONG_TTL } from "../utils/requestCache";

const FilterContext = createContext();

/**
 * FilterProvider
 * - exposes: filters, setFilters
 * - exposes: options: { gradeOptions, sessionTypeOptions, trainingOptions, typeOptions, dayOptions, monthOptions, groupByOptions }
 * - loads options using onlineApi when navigator.onLine, otherwise falls back to tableCache
 */
export function FilterProvider({ children }) {
  const [filters, setFilters] = useState({
    school_id: [],  // Changed from null to empty array
    grade: [],
    category: [],
  });

  const [options, setOptions] = useState({
    gradeOptions: [],
    sessionTypeOptions: [],
    trainingOptions: [],
    typeOptions: [],
    dayOptions: [],
    monthOptions: [],
    groupByOptions: [],
  });

  const [loadingOptions, setLoadingOptions] = useState(false);
  const lastLoadTime = useRef(0);
  const DEBOUNCE_MS = 60000; // Only reload options every 60 seconds

  const getDistinctLocal = useCallback(async (table, field) => {
    try {
      const rows = await tableCache.getTable(table);
      const set = new Set();
      (rows || []).forEach(r => {
        const v = r?.[field];
        if (v !== undefined && v !== null) set.add(v);
      });
      return Array.from(set).filter(Boolean).sort();
    } catch (err) {
      return [];
    }
  }, []);

  const getDistinctRemote = useCallback(async (table, field) => {
    const cacheKey = `filters_${table}_${field}`;
    
    return cachedFetch(
      cacheKey,
      async () => {
        try {
          // fetch up to 2000 rows and derive distinct values (safe for small tables)
          const { data, error } = await onlineApi.from(table).select(field).limit(2000);
          if (error) {
            console.warn(`[FiltersContext] Error fetching ${table}.${field}:`, error.message);
            return [];
          }
          const set = new Set();
          (data || []).forEach(d => {
            const v = d?.[field];
            if (v !== undefined && v !== null) set.add(v);
          });
          return Array.from(set).filter(Boolean).sort();
        } catch (err) {
          console.warn(`[FiltersContext] Exception fetching ${table}.${field}:`, err);
          return [];
        }
      },
      LONG_TTL // 5 minute cache for filter options
    );
  }, []);

  async function loadOptionsForResource(resource) {
    const now = Date.now();
    
    // Debounce rapid reloads
    if (now - lastLoadTime.current < DEBOUNCE_MS) {
      console.log('[FiltersContext] Skipping options load - too soon');
      return;
    }
    
    lastLoadTime.current = now;
    setLoadingOptions(true);
    
    try {
      const online = typeof navigator !== 'undefined' ? navigator.onLine : false;
      console.log('[FiltersContext] Loading filter options...', { resource, online });

      // default grade options used in various lists
      const gradeOptions = [
        "R1", "R2", "R3",
        ...Array.from({ length: 7 }, (_, i) => {
          const grade = i + 1;
          return ["A", "B", "C", "D"].map(section => `${grade}${section}`);
        }).flat()
      ];

      // groupBy defaults
      const groupByOptions = ["ww", "pr", "un"];

      // Prepare containers
      let sessionTypeOptions = [];
      let trainingOptions = [];
      let typeOptions = [];
      let dayOptions = [];
      let monthOptions = [];

      // Students: session types (derive from academic_sessions and pe_sessions)
      if (resource === "students" || !resource) {
        // Instead of querying non-existent "sessions" table, use hardcoded options
        // Or query academic_sessions and pe_sessions separately if needed
        sessionTypeOptions = [
          { value: "academic_sessions", label: "Academic" },
          { value: "pe_sessions", label: "PE" }
        ];
      }

      // Workers: training options - DISABLED (no training column in workers table)
      // Training data is in separate training_sessions/worker_trainings table
      if (resource === "workers" || !resource) {
        // TODO: Fetch from correct table when training filter is needed
        trainingOptions = [];
      }

      // Meals: type, day, month (meals table uses distributed_at, not date)
      if (resource === "meals" || !resource) {
        if (online) {
          typeOptions = await getDistinctRemote("meals", "meal_type");
          const dates = await getDistinctRemote("meals", "distributed_at");
          // derive day/month from dates if they're ISO strings
          const dSet = new Set();
          const mSet = new Set();
          (dates || []).forEach(dt => {
            try {
              const dd = new Date(dt);
              if (!isNaN(dd)) {
                dSet.add(dd.getDate());
                mSet.add(dd.toLocaleString("default", { month: "long" }));
              }
            } catch (e) {}
          });
          dayOptions = Array.from(dSet).sort((a, b) => a - b).map(String);
          monthOptions = Array.from(mSet).sort();
        } else {
          typeOptions = await getDistinctLocal("meals", "meal_type");
          const rows = await tableCache.getTable("meals");
          const dSet = new Set();
          const mSet = new Set();
          (rows || []).forEach(r => {
            const dt = r?.distributed_at;
            if (!dt) return;
            const dd = new Date(dt);
            if (!isNaN(dd)) {
              dSet.add(dd.getDate());
              mSet.add(dd.toLocaleString("default", { month: "long" }));
            }
          });
          dayOptions = Array.from(dSet).sort((a, b) => a - b).map(String);
          monthOptions = Array.from(mSet).sort();
        }
      }

      setOptions({
        gradeOptions,
        sessionTypeOptions,
        trainingOptions,
        typeOptions,
        dayOptions,
        monthOptions,
        groupByOptions,
      });
    } catch (err) {
      console.warn("FiltersContext: loadOptions error", err);
    } finally {
      setLoadingOptions(false);
    }
  }

  // Load options on mount (and whenever online status changes)
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!mounted) return;
      await loadOptionsForResource();
    }
    load();
    // re-load when online state changes
    function onOnline() { loadOptionsForResource(); }
    window.addEventListener("online", onOnline);
    return () => { mounted = false; window.removeEventListener("online", onOnline); };
  }, [loadOptionsForResource]);

  const value = {
    filters,
    setFilters,
    options,
    loadingOptions,
    // convenience loader for pages to call with a specific resource
    loadOptionsForResource,
  };

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  return useContext(FilterContext);
}
