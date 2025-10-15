import { useState, useEffect, useCallback, useMemo } from "react";
import useOnlineStatus from "./useOnlineStatus";
import { openDB } from "idb";
import api from "../api/client";
import { useFilters } from "../context/FiltersContext";
import { useAuth } from "../context/AuthProvider";

// IndexedDB setup
const dbPromise = openDB("offline-dashboard", 1, {
  upgrade(db) {
    ["students", "workers", "meals"].forEach((store) => {
      if (!db.objectStoreNames.contains(store)) {
        db.createObjectStore(store, { keyPath: "id" });
      }
    });
  },
});

const SUPABASE_RELATIONS = {
  students: {
    academic_sessions: "academic_sessions(*)",
    pe_sessions: "pe_sessions(*)",
    assessments: "assessments(*)",
    attendance_records: "attendance_records(*)",
    meal_distributions: "meal_distributions(*)",
    school: "school:schools(*)",
  },
  workers: {
    role: "role:roles(*)",
    school: "school:schools(*)",
  },
  meals: {
    school: "school:schools(*)",
  },
};

export function useOfflineSupabase(table, options = {}) {
  const {
    expand = [],
    lazyExpand = [],
    filters: hookFilters = {},
    singleId,
    pageSize = 10,
  } = options;

  const { filters: contextFilters } = useFilters();
  const { user } = useAuth();

  const [data, setData] = useState(singleId ? null : []);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true); // NEW
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const { isOnline } = useOnlineStatus();

  const normalizedFilters = useMemo(() => {
    const combined = { ...contextFilters, ...hookFilters };
    const normalized = {};
    Object.keys(combined).forEach((key) => {
      const val = combined[key];
      normalized[key] = Array.isArray(val) ? val : val ? [val] : [];
    });
    return normalized;
  }, [contextFilters, hookFilters]);

  const fetchFromCache = useCallback(
    async (cachePage = 0) => {
      try {
        const db = await dbPromise;
        let cached = singleId
          ? await db.get(table, singleId)
          : await db.getAll(table);

        if (!singleId && cached) {
          const from = cachePage * pageSize;
          const to = from + pageSize;
          cached = cached.slice(from, to);
          setHasMore(cached.length === pageSize);
        }

        if (singleId) setData(cached || null);
        else
          setData((prev) =>
            cachePage === 0 ? cached || [] : [...prev, ...(cached || [])]
          );
      } catch (err) {
        console.error("[useOfflineSupabase] Cache read failed", err);
      }
    },
    [table, singleId, pageSize]
  );

  const fetchFromSupabase = useCallback(
    async ({ lazyRelations = [], reset = false, silent = false, overridePage } = {}) => {
      const currentPage = overridePage ?? page;

      if (!isOnline) {
        await fetchFromCache(currentPage);
        setLoading(false);
        setInitialLoading(false);
        return;
      }

      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        let selectStr = "*";
        const allExpand = [...expand, ...lazyRelations];
        if (allExpand.length && SUPABASE_RELATIONS[table]) {
          const relations = allExpand
            .map((rel) => SUPABASE_RELATIONS[table][rel])
            .filter(Boolean)
            .join(",");
          if (relations) selectStr += `, ${relations}`;
        }

        let query = api.from(table).select(selectStr);
        if (singleId) query = query.eq("id", singleId).single();

        const role = user?.profile?.roles?.name;
        const schoolId = user?.profile?.school_id;
        if (["students", "workers"].includes(table)) {
          if (["head tutor", "head coach"].includes(role) && schoolId) {
            query = query.eq("school_id", schoolId);
          } else if (!["superuser", "admin", "hr", "viewer"].includes(role) && schoolId) {
            query = query.eq("school_id", schoolId);
          }
        }

        if (!singleId) {
          Object.entries(normalizedFilters).forEach(([key, val]) => {
            if (!val || val.length === 0) return;
            query = query.in(key, val);
          });
        }

        if (!singleId) {
          const from = currentPage * pageSize;
          const to = from + pageSize - 1;
          query = query.range(from, to);
        }

        const { data: supData, error: supError } = await query;
        if (supError) throw supError;

        setData((prev) => {
          if (reset || singleId) return supData || (singleId ? null : prev || []);
          return [...(prev || []), ...(supData || [])];
        });

        if (!singleId) setHasMore((supData?.length ?? 0) === pageSize);

        const db = await dbPromise;
        const tx = db.transaction(table, "readwrite");
        if (Array.isArray(supData)) supData.forEach((item) => tx.store.put(item));
        else if (supData && singleId) tx.store.put(supData);
        await tx.done;
      } catch (err) {
        console.warn("[useOfflineSupabase] fetch failed, using cache", err);
        await fetchFromCache(currentPage);
        setError(err);
        setHasMore(false);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setInitialLoading(false);
      }
    },
    [table, expand, normalizedFilters, singleId, user?.profile?.roles?.name, user?.profile?.school_id, page, pageSize, fetchFromCache]
  );

  useEffect(() => {
    fetchFromCache(0);
    fetchFromSupabase({ reset: true, silent: true });
  }, [fetchFromSupabase, fetchFromCache]);

  useEffect(() => {
    setPage(0);
    fetchFromSupabase({ reset: true });
  }, [normalizedFilters, fetchFromSupabase]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchFromSupabase({ overridePage: nextPage, silent: true });
  }, [hasMore, loading, page, fetchFromSupabase]);

  const refresh = useCallback(async () => {
    setPage(0);
    await fetchFromSupabase({ reset: true });
  }, [fetchFromSupabase]);

  const loadLazyRelations = async (relations = lazyExpand) => {
    if (!relations.length || !singleId) return;
    await fetchFromSupabase({ lazyRelations: relations, silent: true });
  };

  return { data, loading, initialLoading, refreshing, error, refresh, loadLazyRelations, loadMore, hasMore, page };
}
