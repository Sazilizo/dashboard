import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { onlineApi } from "../api/client";
import tableCache from "../utils/tableCache";

const FilterContext = createContext();

/**
 * FilterProvider
 * - exposes: filters, setFilters
 * - exposes: options: { gradeOptions, sessionTypeOptions, trainingOptions, typeOptions, dayOptions, monthOptions, groupByOptions }
 * - loads options using onlineApi when navigator.onLine, otherwise falls back to tableCache
 */
export function FilterProvider({ children }) {
  const [filters, setFilters] = useState({
    school_id: null,
    grade: null,
    category: null,
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
    try {
      // fetch up to 2000 rows and derive distinct values (safe for small tables)
      const { data, error } = await onlineApi.from(table).select(field).limit(2000);
      if (error) return [];
      const set = new Set();
      (data || []).forEach(d => {
        const v = d?.[field];
        if (v !== undefined && v !== null) set.add(v);
      });
      return Array.from(set).filter(Boolean).sort();
    } catch (err) {
      return [];
    }
  }, []);

  async function loadOptionsForResource(resource) {
    setLoadingOptions(true);
    try {
      const online = typeof navigator !== 'undefined' ? navigator.onLine : false;

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

      // Students: session types (derive from sessions / academic_sessions if available)
      if (resource === "students" || !resource) {
        if (online) {
          // try sessions table first
          sessionTypeOptions = await getDistinctRemote("sessions", "session_type");
          if (!sessionTypeOptions.length) {
            // fallback: common values
            sessionTypeOptions = ["academic", "pe"].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
          } else {
            // normalize to {value,label}
            sessionTypeOptions = sessionTypeOptions.map(s => ({ value: s, label: String(s).charAt(0).toUpperCase() + String(s).slice(1) }));
          }
        } else {
          const local = await getDistinctLocal("sessions", "session_type");
          if (local.length) {
            sessionTypeOptions = local.map(s => ({ value: s, label: String(s).charAt(0).toUpperCase() + String(s).slice(1) }));
          } else {
            sessionTypeOptions = ["academic", "pe"].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
          }
        }
      }

      // Workers: training options derived from training_records.name
      if (resource === "workers" || !resource) {
        if (online) {
          trainingOptions = await getDistinctRemote("training_records", "name");
        } else {
          trainingOptions = await getDistinctLocal("training_records", "name");
        }
      }

      // Meals: type, day, month
      if (resource === "meals" || !resource) {
        if (online) {
          typeOptions = await getDistinctRemote("meals", "type");
          const dates = await getDistinctRemote("meals", "date");
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
          typeOptions = await getDistinctLocal("meals", "type");
          const rows = await tableCache.getTable("meals");
          const dSet = new Set();
          const mSet = new Set();
          (rows || []).forEach(r => {
            const dt = r?.date;
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
