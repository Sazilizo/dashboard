import React, { useMemo, useEffect } from "react";
import DashboardSummary from "../components/charts/DashboardSummary";
import { Outlet } from "react-router-dom";
import FiltersPanel from "../components/filters/FiltersPanel";
import { useAuth } from "../context/AuthProvider";
import { useSchools } from "../context/SchoolsContext";
import { useFilters } from "../context/FiltersContext";
import { useData } from "../context/DataContext";
import PieChartStats from "../components/charts/PieChart";
import StackedCategoryGradeChart from "../components/charts/StackedChart";
import StackedStudentsGradeChart from "../components/charts/StackedStudentsGradeCharts";
import SkeletonList from "../components/widgets/SkeletonList";


export default function DashboardHome() {
  const {user} = useAuth();
  const {schools, loading: schoolsLoading} = useSchools();
  const {filters, setFilters} = useFilters();
  const { workers, students, meals, schools: schoolsData, loading, fetchData } = useData();

  console.log('[DashboardHome] Schools:', schools?.length || 0, 'schools loaded');

  const isAllSchoolRole = ["superuser", "admin", "hr", "viewer"].includes(user?.profile?.roles.name);
  const schoolIds = useMemo(() => (isAllSchoolRole ? schools.map((s) => s.id) : [user?.profile?.school_id]).filter(Boolean), [isAllSchoolRole, schools, user]);

  console.log('[DashboardHome] School IDs for query:', schoolIds);

  // Fetch data when schoolIds change
  useEffect(() => {
    console.log('[DashboardHome] useEffect triggered, schoolIds:', schoolIds);
    if (schoolIds.length > 0) {
      fetchData(schoolIds);
    }
  }, [schoolIds, fetchData]);

  // Debug log to see what data we have
  useEffect(() => {
    console.log('[DashboardHome] Data state:', {
      workers: workers?.length || 0,
      students: students?.length || 0,
      meals: meals?.length || 0,
      schoolsData: schoolsData?.length || 0,
      loading
    });
  }, [workers, students, meals, schoolsData, loading]);

  // Prepare chart data
  const rolePieData = useMemo(() => {
      if (!workers?.length) return [];
      const counts = workers.reduce((acc, worker) => {
        const role = worker.roles?.name || "Unassigned";
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [workers]);

  const studentCategoryData = useMemo(() => {
    const counts = {};
    (students || []).forEach(s => {
      const cat = s?.category || "Uncategorized";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [students]);

  const studentGradeData = useMemo(() => {
    const counts = {};
    (students || []).forEach(s => {
      const grade = s?.grade || "Unknown";
      counts[grade] = (counts[grade] || 0) + 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [students]);

  const totalWorkers = workers?.length || 0;
  const totalStudents = students?.length || 0;
  const totalSchools = (schoolIds && schoolIds.length) ? schoolIds.length : (schoolsData?.length || 0);
  const totalMeals = meals?.length || 0;
  return (
    <div>
      <h2>School Overview</h2>
      <div className="app-list-filters">
          <FiltersPanel
            user={user}
            schools={schools}
            filters={filters}
            setFilters={setFilters}
            resource="workers"
            // groupByOptions={groupByOptions}
            showDeletedOption={isAllSchoolRole}
          />
      </div>
      {/* 
      <div className="list-items grid-item app-list-panel">
          {loading && <SkeletonList count={10} />}
          {!loading && error && <div style={{color:"red"}}>{error.message || error}</div>}
          {!loading && !error && <ListItems schools={schools} />}
      </div> */}
      <div className="dashboard-home-container">
        <div className="dashboard-cards-grid" style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div className="card" style={{ padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
            <div className="card-title">Students</div>
            <div className="card-value" style={{ fontSize: 24, fontWeight: 700 }}>{totalStudents}</div>
          </div>
          <div className="card" style={{ padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
            <div className="card-title">Workers</div>
            <div className="card-value" style={{ fontSize: 24, fontWeight: 700 }}>{totalWorkers}</div>
          </div>
          <div className="card" style={{ padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
            <div className="card-title">Schools</div>
            <div className="card-value" style={{ fontSize: 24, fontWeight: 700 }}>{totalSchools}</div>
          </div>
          <div className="card" style={{ padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
            <div className="card-title">Meals</div>
            <div className="card-value" style={{ fontSize: 24, fontWeight: 700 }}>{totalMeals}</div>
          </div>
        </div>

        <div className="dashboard-graphs-grid">
          <div style={{ flex: 1 }}>
            {rolePieData.length > 0 && (
                <PieChartStats
                  title="Worker Roles Breakdown"
                  data={rolePieData}
                  dataKey="value"
                  labelKey="label"
                />
              )}
          </div>
          <div style={{ flex: 1 }}>
            <PieChartStats title="Students by Category" data={studentCategoryData} />
          </div>
          <div style={{ flex: 1 }}>
            <StackedCategoryGradeChart students={students} />
          </div>
          <div style={{ flex: 1 }}>
            <StackedStudentsGradeChart students={students} />
          </div>
          </div>
        </div>

    </div>
  );
}
