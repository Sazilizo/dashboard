import React, { useEffect, useState, useCallback } from "react";
import SchoolFilter from "./SchoolFilter";
import StudentFilters from "./StudentFilters";
import WorkerFilters from "./WorkerFilters";
import MealFilters from "./MealFilters";
import FiltersPanelSkeleton from "./FiltersPanelSkeleton";

export default function FiltersPanel({
  user,
  schools,
  filters,
  setFilters,
  resource,
  gradeOptions = [],
  sessionTypeOptions = [],
  groupByOptions = [],
  trainingOptions = [],
  typeOptions = [],
  dayOptions = [],
  monthOptions = [],
  showDeletedOption = false
}) {
  const [loading, setIsLoading] = useState(true);

  useEffect(() => {
    if (schools && schools.length > 0) {
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }, [schools]);

  // ✅ Wrap setFilters here so children don’t cause infinite updates
  const safeSetFilters = useCallback(
    (update) => {
      setFilters((prev) => {
        const next =
          typeof update === "function" ? update(prev) : update;

        if (JSON.stringify(prev) === JSON.stringify(next)) {
          return prev; // no state change if same
        }
        return next;
      });
    },
    [setFilters]
  );

  if (loading) {
    return <FiltersPanelSkeleton />;
  }

  return (
    <div style={{ border: "1px solid #eee", padding: 16, marginBottom: 16 }}>
      <SchoolFilter
        user={user}
        schools={schools || []}
        filters={filters}
        setFilters={safeSetFilters}
        onChange={(ids) =>
          safeSetFilters((f) => ({ ...f, school_id: ids }))
        }
      />
      {resource === "students" && (
        <StudentFilters
          filters={filters}
          setFilters={safeSetFilters}
          gradeOptions={gradeOptions}
          sessionTypeOptions={sessionTypeOptions}
          groupByOptions={groupByOptions}
          showDeletedOption={showDeletedOption}
        />
      )}
      {resource === "workers" && (
        <WorkerFilters
          filters={filters}
          setFilters={safeSetFilters}
          trainingOptions={trainingOptions}
          showDeletedOption={showDeletedOption}
        />
      )}
      {resource === "meals" && (
        <MealFilters
          filters={filters}
          setFilters={safeSetFilters}
          typeOptions={typeOptions}
          dayOptions={dayOptions}
          monthOptions={monthOptions}
        />
      )}
    </div>
  );
}
