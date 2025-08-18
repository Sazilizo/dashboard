import { useState, useEffect } from "react";
import api from "../api/client";
import { useFilters } from "../context/FiltersContext";

export function useSupabaseStudents() {
  const { filters } = useFilters();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // normalize filters for stable deps
  const normalizedFilters = {
    school_id: Array.isArray(filters.school_id) ? filters.school_id : (filters.school_id ? [filters.school_id] : []),
    grade: Array.isArray(filters.grade) ? filters.grade : (filters.grade ? [filters.grade] : []),
    category: Array.isArray(filters.category) ? filters.category : (filters.category ? [filters.category] : []),
  };

  useEffect(() => {
    let isCancelled = false;
    async function fetchStudents() {
      setLoading(true);
      setError(null);

      try {
        let query = api.from("students").select(`
          id,
          full_name,
          grade,
          category,
          school:schools(name)   -- example join to get school name (optional)
        `);

        if (normalizedFilters.school_id.length > 0) {
          // `.in()` expects array of values
          query = query.in("school_id", normalizedFilters.school_id.map(Number));
        }

        if (normalizedFilters.grade.length > 0) {
          query = query.in("grade", normalizedFilters.grade);
        }

        if (normalizedFilters.category.length > 0) {
          query = query.in("category", normalizedFilters.category);
        }

        const { data, error } = await query;
        if (isCancelled) return;

        if (error) {
          setError(error.message || error);
          setStudents([]);
        } else {
          setStudents(data || []);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || err);
          setStudents([]);
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    fetchStudents();
    return () => { isCancelled = true; };
  }, [JSON.stringify(normalizedFilters)]); // trigger when filters change

  return { students, loading, error };
}
