import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchResource } from "../api/endpoints/fetchResource";

export function useResourceFilters(resourcePath, initialFilters = {}) {
  const location = useLocation();
  const navigate = useNavigate();

  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync filters from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const newFilters = {};
    for (const [key, value] of params.entries()) {
      if (newFilters[key]) {
        newFilters[key].push(value);
      } else {
        newFilters[key] = [value];
      }
    }
    // If URL params exist, override initial filters
    if (Object.keys(newFilters).length > 0) {
      setFilters(newFilters);
    }
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
      } else if (value !== undefined && value !== null) {
        params.set(key, value);
      }
    });
    navigate({ search: params.toString() }, { replace: true });
  }, [filters, navigate]);

  // Fetch data when filters or resourcePath change
  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchResource(resourcePath, filters)
      .then(res => {
        setData(res);
      })
      .catch(err => {
        setError(err.message || "Failed to fetch data");
      })
      .finally(() => setLoading(false));
  }, [filters, resourcePath]);


  return { data, filters, setFilters,setLoading, loading, error, setError };
}
