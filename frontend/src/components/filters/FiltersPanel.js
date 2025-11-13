import React, { useEffect, useState, useCallback } from "react";
import SchoolFilter from "./SchoolFilter";
import StudentFilters from "./StudentFilters";
import WorkerFilters from "./WorkerFilters";
import MealFilters from "./MealFilters";
import FiltersPanelSkeleton from "./FiltersPanelSkeleton";
import { useFilters } from "../../context/FiltersContext";

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
  // ✅ MUST call useFilters hook FIRST before any conditional hooks
  const ctx = useFilters();
  const ctxOpts = ctx?.options || {};
  
  const [loading, setIsLoading] = useState(false); // Start false to prevent flash

  useEffect(() => {
    console.log('[FiltersPanel] Schools updated:', schools?.length || 0);
  }, [schools]);

  useEffect(() => {console.log("Schools changed:", schools, "user", user);}, [schools, user]);
  // ✅ Wrap setFilters here so children don't cause infinite updates
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

  // Allow consuming context options by default when parent does not provide specific ones
  const finalGradeOptions = (gradeOptions && gradeOptions.length) ? gradeOptions : (ctxOpts.gradeOptions || []);
  const finalSessionTypeOptions = (sessionTypeOptions && sessionTypeOptions.length) ? sessionTypeOptions : (ctxOpts.sessionTypeOptions || []);
  const finalGroupByOptions = (groupByOptions && groupByOptions.length) ? groupByOptions : (ctxOpts.groupByOptions || []);
  const finalTrainingOptions = (trainingOptions && trainingOptions.length) ? trainingOptions : (ctxOpts.trainingOptions || []);
  const finalTypeOptions = (typeOptions && typeOptions.length) ? typeOptions : (ctxOpts.typeOptions || []);
  const finalDayOptions = (dayOptions && dayOptions.length) ? dayOptions : (ctxOpts.dayOptions || []);
  const finalMonthOptions = (monthOptions && monthOptions.length) ? monthOptions : (ctxOpts.monthOptions || []);

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
          gradeOptions={finalGradeOptions}
          sessionTypeOptions={finalSessionTypeOptions}
          groupByOptions={finalGroupByOptions}
          showDeletedOption={showDeletedOption}
        />
      )}
      {resource === "workers" && (
        <WorkerFilters
          filters={filters}
          setFilters={safeSetFilters}
          trainingOptions={finalTrainingOptions}
          showDeletedOption={showDeletedOption}
        />
      )}
      {resource === "meals" && (
        <MealFilters
          filters={filters}
          setFilters={safeSetFilters}
          typeOptions={finalTypeOptions}
          dayOptions={finalDayOptions}
          monthOptions={finalMonthOptions}
        />
      )}
    </div>
  );
}
