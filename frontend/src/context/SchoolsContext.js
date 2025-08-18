// // src/context/SchoolsContext.js
// import React, { createContext, useContext, useEffect, useState } from "react";
// import api from "../api/client"; // Your supabase client instance

// const SchoolsContext = createContext();

// export function SchoolsProvider({ children }) {
//   const [schools, setSchools] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);

//   const refreshSchools = async () => {
//     setLoading(true);
//     try {
//       const { data, error } = await api
//         .from("schools")
//         .select("*")
//         .order("name", { ascending: true });
//       if (error) throw error;
//       setSchools(data);
//       setError(null);
//     } catch (err) {
//       console.error("Failed to load schools", err);
//       setError(err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     refreshSchools();
//   }, []);

//   useEffect(()=>{
//     console.log(schools)
//   },[schools])

//   return (
//     <SchoolsContext.Provider
//       value={{ schools, loading, error, refreshSchools }}
//     >
//       {children}
//     </SchoolsContext.Provider>
//   );
// }

// export const useSchools = () => useContext(SchoolsContext);

// src/context/SchoolsContext.js
import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client"; // supabase client
import { useFilters } from "./FiltersContext"; // assuming you already have this

const SchoolsContext = createContext();

export function SchoolsProvider({ children }) {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { filters } = useFilters(); 
  // filters example: { school_id: ['1', '2'], grade: null, category: null, role_id: null, id: null }

  const refreshSchools = async () => {
    setLoading(true);
    try {
      let query = api
        .from("schools")
        .select(`
          *,
          workers:workers(count),
          students:students(count),
          users:users(count),
          meals:meal_distributions(count)
        `)
        .order("name", { ascending: true });

      // Optional: Filter by role_id if needed
      if (filters.role_id) {
        query = query.eq("role_id", filters.role_id);
      }

      // Optional: Filter by worker id
      if (filters.id) {
        query = query.eq("worker_id", filters.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Flatten the counts
      const schoolsWithCounts = data.map((school) => ({
        ...school,
        workers_count: school.workers?.[0]?.count ?? 0,
        students_count: school.students?.[0]?.count ?? 0,
        users_count: school.users?.[0]?.count ?? 0,
        meals_count: school.meals?.[0]?.count ?? 0,
      }));

      setSchools(schoolsWithCounts);
      setError(null);
    } catch (err) {
      console.error("Failed to load schools", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Refetch every time filters change
  useEffect(() => {
    refreshSchools();
  }, [filters]);

  return (
    <SchoolsContext.Provider
      value={{ schools, loading, error, refreshSchools }}
    >
      {children}
    </SchoolsContext.Provider>
  );
}

export const useSchools = () => useContext(SchoolsContext);
