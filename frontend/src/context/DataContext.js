import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { cachedFetch, LONG_TTL } from "../utils/requestCache";
import api from "../api/client";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { getTable, cacheTable } from "../utils/tableCache";

const DataContext = createContext();

export function DataProvider({ children }) {
  const [workers, setWorkers] = useState([]);
  const [students, setStudents] = useState([]);
  const [meals, setMeals] = useState([]);
  const [schools, setSchools] = useState([]);
  const [roles, setRoles] = useState([]);
  const [photoCache, setPhotoCache] = useState(new Map()); // Cache photo URLs
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isOnline } = useOnlineStatus();
  const lastFetchTime = useRef(0);
  const FETCH_DEBOUNCE_MS = 30000; // 30 seconds

  // Fetch roles immediately on mount (not dependent on school selection)
  useEffect(() => {
    async function fetchRoles() {
      try {
        console.log('[DataContext] Fetching roles...');
        
        if (!isOnline) {
          // Offline: load from cache
          const cachedRoles = await getTable("roles");
          setRoles(cachedRoles || []);
          console.log('[DataContext] Loaded roles from cache:', cachedRoles?.length || 0);
        } else {
          // Online: fetch from Supabase
          const { data, error } = await api.from("roles").select("*");
          if (error) throw error;
          
          setRoles(data || []);
          console.log('[DataContext] Fetched roles from API:', data?.length || 0);
          
          // Cache for offline use
          if (data) {
            await cacheTable("roles", data);
          }
        }
      } catch (err) {
        console.error('[DataContext] Failed to fetch roles:', err);
        // Try cache as fallback
        try {
          const cachedRoles = await getTable("roles");
          setRoles(cachedRoles || []);
          console.log('[DataContext] Recovered roles from cache:', cachedRoles?.length || 0);
        } catch (cacheErr) {
          console.error('[DataContext] Cache fallback failed:', cacheErr);
        }
      }
    }
    
    fetchRoles();
  }, [isOnline]);

  // Helper function to get photo URL from cache or fetch
  const getPhotoUrl = useCallback((bucketName, folder, id) => {
    const cacheKey = `${bucketName}/${folder}/${id}`;
    if (photoCache.has(cacheKey)) {
      return photoCache.get(cacheKey);
    }
    return null;
  }, [photoCache]);

  // Batch fetch photo URLs for a list of items
  const prefetchPhotos = useCallback(async (items, bucketName, folderName) => {
    if (!items || items.length === 0) return;
    
    try {
      const storage = api.storage.from(bucketName);
      const newPhotoCache = new Map(photoCache);
      
      // Fetch photos in batches of 50 to avoid overwhelming the storage API
      const batchSize = 50;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (item) => {
            const cacheKey = `${bucketName}/${folderName}/${item.id}`;
            
            // Skip if already cached
            if (newPhotoCache.has(cacheKey)) return;
            
            try {
              // List files in the profile-picture folder
              const { data, error } = await storage.list(`${folderName}/${item.id}/profile-picture`, {
                limit: 1,
                sortBy: { column: 'created_at', order: 'desc' }
              });
              
              if (!error && data && data.length > 0) {
                // Get public URL for the first photo
                const { data: urlData } = storage.getPublicUrl(`${folderName}/${item.id}/profile-picture/${data[0].name}`);
                newPhotoCache.set(cacheKey, urlData.publicUrl);
              } else {
                // No photo found, cache null to avoid refetching
                newPhotoCache.set(cacheKey, null);
              }
            } catch (err) {
              console.warn(`[DataContext] Failed to fetch photo for ${cacheKey}:`, err);
              newPhotoCache.set(cacheKey, null);
            }
          })
        );
      }
      
      setPhotoCache(newPhotoCache);
      console.log('[DataContext] Prefetched', newPhotoCache.size, 'photo URLs');
    } catch (err) {
      console.error('[DataContext] Photo prefetch failed:', err);
    }
  }, [api, photoCache]);

  const fetchData = useCallback(async (schoolIds = [], forceRefresh = false) => {
    const now = Date.now();
    
    // Debounce rapid refreshes
    if (!forceRefresh && now - lastFetchTime.current < FETCH_DEBOUNCE_MS) {
      console.log('[DataContext] Skipping fetch - too soon since last fetch');
      return;
    }

    const allSchoolsRequested = Array.isArray(schoolIds) && schoolIds.includes(-1);
    console.log('[DataContext] Fetching data for schools:', schoolIds, 'allSchoolsRequested:', allSchoolsRequested);
    setLoading(true);

    try {
      if (!schoolIds || schoolIds.length === 0) {
        console.log('[DataContext] No school IDs provided, clearing data');
        setWorkers([]);
        setStudents([]);
        setMeals([]);
        setSchools([]);
        setRoles([]);
        setLoading(false);
        return;
      }

      // Don't use cachedFetch - fetch directly to avoid caching issues
      let workersData = [];
      let studentsData = [];
      let mealsData = [];
      let schoolsData = [];
      let rolesData = [];

      if (!isOnline) {
        // Offline: load from IndexedDB
        console.log('[DataContext] Offline - loading from cache');
        let cachedWorkers, cachedStudents, cachedMeals, cachedSchools, cachedRoles;
        
        try {
          [cachedWorkers, cachedStudents, cachedMeals, cachedSchools, cachedRoles] = await Promise.all([
            getTable("workers"),
            getTable("students"),
            getTable("meals"),
            getTable("schools"),
            getTable("roles"),
          ]);
          
          console.log('[DataContext] Raw cache results:', {
            workers: cachedWorkers?.length || 0,
            students: cachedStudents?.length || 0,
            meals: cachedMeals?.length || 0,
            schools: cachedSchools?.length || 0,
            roles: cachedRoles?.length || 0,
          });
        } catch (cacheErr) {
          console.error('[DataContext] Failed to load from cache:', cacheErr);
          cachedWorkers = [];
          cachedStudents = [];
          cachedMeals = [];
          cachedSchools = [];
          cachedRoles = [];
        }

        // Filter by school IDs unless "All Schools" sentinel present
        if (allSchoolsRequested) {
          workersData = cachedWorkers || [];
          studentsData = cachedStudents || [];
          mealsData = cachedMeals || [];
          schoolsData = cachedSchools || [];
        } else {
          workersData = (cachedWorkers || []).filter(w => schoolIds.includes(w.school_id));
          studentsData = (cachedStudents || []).filter(s => schoolIds.includes(s.school_id));
          mealsData = (cachedMeals || []).filter(m => schoolIds.includes(m.school_id));
          schoolsData = (cachedSchools || []).filter(s => schoolIds.includes(s.id));
        }
        rolesData = cachedRoles || []; // Roles are not school-specific

        console.log('[DataContext] Filtered data from cache:', {
          workers: workersData.length,
          students: studentsData.length,
          meals: mealsData.length,
          schools: schoolsData.length,
          roles: rolesData.length,
        });
      } else {
        // Online: fetch from Supabase in parallel
        console.log('[DataContext] Online - fetching from Supabase');
        
        try {
          const workersQuery = api.from("workers").select("*, roles:role_id(name)").limit(2000);
          const studentsQuery = api.from("students").select("*").limit(2000);
          const mealsQuery = api.from("meals").select("*").limit(2000);
          const schoolsQuery = api.from("schools").select("*");

          const [workersRes, studentsRes, mealsRes, schoolsRes, rolesRes] = await Promise.all([
            allSchoolsRequested ? workersQuery : workersQuery.in("school_id", schoolIds),
            allSchoolsRequested ? studentsQuery : studentsQuery.in("school_id", schoolIds),
            allSchoolsRequested ? mealsQuery : mealsQuery.in("school_id", schoolIds),
            allSchoolsRequested ? schoolsQuery : schoolsQuery.in("id", schoolIds),
            api.from("roles").select("*"),
          ]);

          console.log('[DataContext] API responses:', {
            workersError: workersRes.error?.message,
            studentsError: studentsRes.error?.message,
            mealsError: mealsRes.error?.message,
            schoolsError: schoolsRes.error?.message,
            rolesError: rolesRes.error?.message,
          });

          if (workersRes.error) throw workersRes.error;
          if (studentsRes.error) throw studentsRes.error;
          if (mealsRes.error) throw mealsRes.error;
          if (schoolsRes.error) throw schoolsRes.error;
          if (rolesRes.error) throw rolesRes.error;

          workersData = workersRes.data || [];
          studentsData = studentsRes.data || [];
          mealsData = mealsRes.data || [];
          schoolsData = schoolsRes.data || [];
          rolesData = rolesRes.data || [];

          console.log('[DataContext] API data counts:', {
            workers: workersData.length,
            students: studentsData.length,
            meals: mealsData.length,
            schools: schoolsData.length,
            roles: rolesData.length,
          });

          // Cache for offline use
          try {
            await Promise.all([
              cacheTable("workers", workersData),
              cacheTable("students", studentsData),
              cacheTable("meals", mealsData),
              cacheTable("schools", schoolsData),
              cacheTable("roles", rolesData),
            ]);
            console.log('[DataContext] Successfully cached all data to IndexedDB');
          } catch (cacheErr) {
            console.warn('[DataContext] Failed to cache data (non-critical):', cacheErr);
          }
        } catch (apiErr) {
          console.error('[DataContext] API fetch failed, falling back to cache:', apiErr);
          
          // Fallback to cache if API fails
          try {
            const [cachedWorkers, cachedStudents, cachedMeals, cachedSchools, cachedRoles] = await Promise.all([
              getTable("workers"),
              getTable("students"),
              getTable("meals"),
              getTable("schools"),
              getTable("roles"),
            ]);

            if (allSchoolsRequested) {
              workersData = cachedWorkers || [];
              studentsData = cachedStudents || [];
              mealsData = cachedMeals || [];
              schoolsData = cachedSchools || [];
            } else {
              workersData = (cachedWorkers || []).filter(w => schoolIds.includes(w.school_id));
              studentsData = (cachedStudents || []).filter(s => schoolIds.includes(s.school_id));
              mealsData = (cachedMeals || []).filter(m => schoolIds.includes(m.school_id));
              schoolsData = (cachedSchools || []).filter(s => schoolIds.includes(s.id));
            }
            rolesData = cachedRoles || [];
            
            console.log('[DataContext] Recovered from cache after API failure:', {
              workers: workersData.length,
              students: studentsData.length,
              meals: mealsData.length,
              schools: schoolsData.length,
              roles: rolesData.length,
            });
          } catch (fallbackErr) {
            console.error('[DataContext] Cache fallback also failed:', fallbackErr);
            throw apiErr; // Re-throw original API error
          }
        }
      }

      console.log('[DataContext] Data loaded:', {
        workers: workersData.length,
        students: studentsData.length,
        meals: mealsData.length,
        schools: schoolsData.length,
        roles: rolesData.length,
      });

      // Log sample worker to verify data structure
      if (workersData.length > 0) {
        console.log('[DataContext] Sample worker:', workersData[0]);
      }

      setWorkers(workersData);
      setStudents(studentsData);
      setMeals(mealsData);
      setSchools(schoolsData);
      setRoles(rolesData);
      setError(null);
      lastFetchTime.current = now;

      // Prefetch student and worker photos in background (non-blocking)
      if (isOnline) {
        setTimeout(() => {
          prefetchPhotos(studentsData.slice(0, 100), 'student-uploads', 'students');
          prefetchPhotos(workersData.slice(0, 50), 'worker-uploads', 'workers');
        }, 1000); // Wait 1 second after data loads, then prefetch photos
      }
    } catch (err) {
      console.error('[DataContext] Failed to fetch data:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  // Expose method to refresh specific table
  const refreshTable = useCallback(async (tableName) => {
    console.log('[DataContext] Refreshing table:', tableName);
    // Force a refresh on next fetchData call
    lastFetchTime.current = 0;
  }, []);

  return (
    <DataContext.Provider
      value={{
        workers,
        students,
        meals,
        schools,
        roles,
        photoCache,
        getPhotoUrl,
        loading,
        error,
        fetchData,
        refreshTable,
        isOnline,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within DataProvider');
  }
  return context;
};
