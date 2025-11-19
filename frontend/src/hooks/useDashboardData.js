import { useEffect, useState, useRef } from "react";
import api from "../api/client";
import { cacheTable, getTable } from "../utils/tableCache";
import { cachedFetch, invalidateCache, LONG_TTL } from "../utils/requestCache";
import useOnlineStatus from "./useOnlineStatus";

/**
 * Optimized dashboard data hook - fetches all dashboard data in ONE batch request
 * Prevents multiple parallel queries and uses aggressive caching
 */
export default function useDashboardData(schoolIds = []) {
  const [data, setData] = useState({
    workers: [],
    students: [],
    meals: [],
    schools: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isOnline } = useOnlineStatus();
  const isMounted = useRef(true);
  const lastFetchRef = useRef(0);
  const DEBOUNCE_MS = 5000; // Only refetch if 5+ seconds since last fetch

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchDashboardData = async (forceRefresh = false) => {
    const now = Date.now();
    
    // Debounce rapid refetches
    if (!forceRefresh && now - lastFetchRef.current < DEBOUNCE_MS) {
      console.log('[useDashboardData] Skipping fetch - too soon');
      return;
    }

    lastFetchRef.current = now;
    setError(null);
    // Only toggle the loading indicator for user-initiated or initial fetches.
    // When called as a background refresh (e.g. on connectivity restore), callers
    // can pass `skipLoading=true` to avoid showing the global loading UI.
    const skipLoading = arguments.length > 1 ? arguments[1] === true : false;
    if (!skipLoading) setLoading(true);

    try {
      // Load cached data first for instant display
      const cachedData = {
        workers: await getTable("workers"),
        students: await getTable("students"),
        meals: await getTable("meals"),
        schools: await getTable("schools"),
      };

      // Filter cached data by school IDs
      const filterBySchool = (rows) => {
        if (!schoolIds || schoolIds.length === 0) return rows || [];
        return (rows || []).filter(row => schoolIds.includes(row.school_id));
      };

      if (cachedData.workers || cachedData.students || cachedData.meals || cachedData.schools) {
        const filteredCache = {
          workers: filterBySchool(cachedData.workers),
          students: filterBySchool(cachedData.students),
          meals: filterBySchool(cachedData.meals),
          schools: cachedData.schools || [],
        };

        if (isMounted.current) {
          setData(filteredCache);
          setLoading(false);
        }
      }

      // If offline, use cached data only
      if (!isOnline) {
        console.log('[useDashboardData] Offline - using cached data');
        return;
      }

      // Online: Fetch fresh data in a SINGLE batched request using Promise.all
      console.log('[useDashboardData] Fetching dashboard data...', { schoolIds });

      const cacheKey = `dashboard_${JSON.stringify(schoolIds)}`;

      const fetchFn = async () => {
        const queries = [];
        const queryNames = [];

        // Workers query
        let workersQuery = api.from("workers").select("*, roles:roles(name)");
        if (schoolIds && schoolIds.length > 0) {
          workersQuery = workersQuery.in("school_id", schoolIds);
        }
        queries.push(workersQuery);
        queryNames.push('workers');

        // Students query
        let studentsQuery = api.from("students").select("*");
        if (schoolIds && schoolIds.length > 0) {
          studentsQuery = studentsQuery.in("school_id", schoolIds);
        }
        queries.push(studentsQuery);
        queryNames.push('students');

        // Meals query
        let mealsQuery = api.from("meals").select("*");
        if (schoolIds && schoolIds.length > 0) {
          mealsQuery = mealsQuery.in("school_id", schoolIds);
        }
        queries.push(mealsQuery);
        queryNames.push('meals');

        // Schools query
        const schoolsQuery = api.from("schools").select("*");
        queries.push(schoolsQuery);
        queryNames.push('schools');

        // Execute all queries in parallel
        const results = await Promise.all(queries);

        // Process results
        const dashboardData = {
          workers: results[0]?.data || [],
          students: results[1]?.data || [],
          meals: results[2]?.data || [],
          schools: results[3]?.data || [],
        };

        // Check for errors
        results.forEach((result, idx) => {
          if (result.error) {
            console.error(`[useDashboardData] Error fetching ${queryNames[idx]}:`, result.error);
          }
        });

        // Cache each table separately for offline use
        await Promise.all([
          cacheTable("workers", dashboardData.workers),
          cacheTable("students", dashboardData.students),
          cacheTable("meals", dashboardData.meals),
          cacheTable("schools", dashboardData.schools),
        ]);

        return dashboardData;
      };

      // Use request cache to deduplicate
      const freshData = await cachedFetch(cacheKey, fetchFn, LONG_TTL);

      if (isMounted.current) {
        setData(freshData);
        if (!skipLoading) setLoading(false);
      }

      console.log('[useDashboardData] ✅ Dashboard data loaded:', {
        workers: freshData.workers.length,
        students: freshData.students.length,
        meals: freshData.meals.length,
        schools: freshData.schools.length,
      });

    } catch (err) {
      console.error('[useDashboardData] Error fetching dashboard data:', err);
      if (isMounted.current) {
        setError(err);
        setLoading(false);
      }
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchDashboardData(true);
  }, []);

  // Refetch when school IDs change
  useEffect(() => {
    if (schoolIds && schoolIds.length > 0) {
      fetchDashboardData(false);
    }
  }, [JSON.stringify(schoolIds)]);

  // Refetch when coming back online
  useEffect(() => {
    if (isOnline) {
      console.log('[useDashboardData] Back online - refreshing');
      // Refresh in background so we don't interrupt the user's current work
      fetchDashboardData(true, true);
    }
  }, [isOnline]);

  // Listen for connectivity restored event
  useEffect(() => {
    const handleConnectivityRestored = () => {
      console.log('[useDashboardData] Connectivity restored');
      invalidateCache('dashboard');
      // Background refresh on connectivity restore to avoid flipping global `loading`
      fetchDashboardData(true, true);
    };

    window.addEventListener('connectivity-restored', handleConnectivityRestored);
    
    return () => {
      window.removeEventListener('connectivity-restored', handleConnectivityRestored);
    };
  }, []);

  return {
    workers: data.workers,
    students: data.students,
    meals: data.meals,
    schools: data.schools,
    loading,
    error,
    refresh: () => fetchDashboardData(true),
  };
}
