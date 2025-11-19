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
  const [manualRefreshLoading, setManualRefreshLoading] = useState(false);
  const [panelHovered, setPanelHovered] = useState(false);

  useEffect(() => {
    const onComplete = () => setManualRefreshLoading(false);
    const onFail = () => setManualRefreshLoading(false);
    window.addEventListener && window.addEventListener('soft-refresh-complete', onComplete);
    window.addEventListener && window.addEventListener('soft-refresh-failed', onFail);
    return () => {
      window.removeEventListener && window.removeEventListener('soft-refresh-complete', onComplete);
      window.removeEventListener && window.removeEventListener('soft-refresh-failed', onFail);
    };
  }, []);

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
    <div
      style={{ border: "1px solid #eee", padding: 16, marginBottom: 16, position: 'relative' }}
      onMouseEnter={() => setPanelHovered(true)}
      onMouseLeave={() => setPanelHovered(false)}
    >
      {/* Absolutely positioned refresh button when schools aren't loaded yet */}
      {Array.isArray(schools) && schools.length === 0 && (
        <button
          aria-label="Refresh schools"
          title={manualRefreshLoading ? 'Refreshing…' : 'Refresh schools'}
          onClick={async () => {
            try {
              setManualRefreshLoading(true);
              if (typeof window !== 'undefined' && typeof window.softRefresh === 'function') {
                await window.softRefresh();
              } else if (typeof window !== 'undefined' && typeof window.refreshCache === 'function') {
                await window.refreshCache();
              } else {
                window.location.reload();
              }
            } catch (err) {
              console.warn('Manual soft refresh failed', err);
            } finally {
              setManualRefreshLoading(false);
            }
          }}
          disabled={manualRefreshLoading}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 20,
            width: 36,
            height: 36,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: manualRefreshLoading ? '#2563eb' : '#ffffff',
            color: manualRefreshLoading ? '#fff' : '#111827',
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            cursor: manualRefreshLoading ? 'default' : 'pointer',
            opacity: panelHovered || manualRefreshLoading ? 1 : 0,
            transition: 'opacity 150ms ease, background 150ms ease',
          }}
        >
          {manualRefreshLoading ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12a9 9 0 11-3-6.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 12a9 9 0 11-3-6.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      )}

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
