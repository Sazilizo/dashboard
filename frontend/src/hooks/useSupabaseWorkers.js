import { useState, useEffect } from "react";
import api from "../api/client";
import { useFilters } from "../context/FiltersContext";

export function useSupabaseWorkers() {
  const { filters } = useFilters();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // normalize filters for stable deps
  const normalizedFilters = {
    school_id: Array.isArray(filters.school_id) ? filters.school_id : (filters.school_id ? [filters.school_id] : []),
    // grade: Array.isArray(filters.grade) ? filters.grade : (filters.grade ? [filters.grade] : []),
    // category: Array.isArray(filters.category) ? filters.category : (filters.category ? [filters.category] : []),
  };

  useEffect(() => {
    let isCancelled = false;
    async function fetchWorkers() {
      setLoading(true);
      setError(null);

      try {
        let query = api.from("workers").select(`
          id,
          name,
          last_name,
          id_number,
          contact_number,
          start_date,
          email,
          roles(name)
          id_copy_pdf,
          cv_pdf,
          clearance_pdf,
          child_protection_pdf,
          story
          school:schools(name)   -- example join to get school name (optional)
        `);

        if (normalizedFilters.school_id.length > 0) {
          // `.in()` expects array of values
          query = query.in("school_id", normalizedFilters.school_id.map(Number));
        }

        const { data, error } = await query;
        if (isCancelled) return;

        if (error) {
          setError(error.message || error);
          setWorkers([]);
        } else {
          setWorkers(data || []);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || err);
          setWorkers([]);
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    fetchWorkers();
    return () => { isCancelled = true; };
  }, [JSON.stringify(normalizedFilters)]); // trigger when filters change

  return { workers, loading, error };
}
