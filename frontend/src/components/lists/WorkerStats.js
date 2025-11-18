import React, { useEffect, useMemo } from "react";
import PieChartStats from "../charts/PieChart";
import GradeDistributionBarChart from "../charts/DashboardSummary"; // rename this later for workers?
import StackedCategoryGradeChart from "../charts/StackedChart"; // rename this later for workers?
import "../../styles/main.css";
import { useData } from "../../context/DataContext";

const WorkerStats = ({ workers, loading, singleWorker }) => {
  /**
   * If we’re in WorkerProfile (singleWorker passed in),
   * show attendance breakdown for that worker.
   * Otherwise, show global role/attendance stats.
   */

  // Pie Chart Data: roles breakdown
  const { roles: allRoles = [] } = useData();

  const rolePieData = useMemo(() => {
    if (!workers?.length) return [];
    const counts = workers.reduce((acc, worker) => {
      const role = worker.roles?.name || allRoles.find(r => String(r.id) === String(worker.role_id))?.name || "Unassigned";
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [workers, allRoles]);

  // Bar Chart Data: attendance per role
  const roleAttendanceData = useMemo(() => {
    if (!workers?.length) return [];
    const counts = workers.reduce((acc, worker) => {
      const role = worker.roles?.name || allRoles.find(r => String(r.id) === String(worker.role_id))?.name || "Unassigned";
      const attendance = worker.attendanceStatus || "Unknown"; 
      // e.g. "Present", "Absent", "Late"
      acc[role] = acc[role] || {};
      acc[role][attendance] = (acc[role][attendance] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([role, statuses]) => ({
      role,
      ...statuses,
    }));
  }, [workers, allRoles]);

  // Single worker attendance breakdown
  const singleWorkerAttendanceData = useMemo(() => {
    if (!singleWorker?.attendance) return [];
    const counts = singleWorker.attendance.reduce((acc, record) => {
      const status = record.status || "Unknown"; 
      // record could look like { date: "2025-09-01", status: "Present" }
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [singleWorker]);

  if (loading) {
    return (
      <div className="page-stats">
        <div className="stats-header">
          <h3 className="text-xl font-semibold mb-4">Worker Statistics</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="stacked-chart-stats skeleton-chart"></div>
          <div className="bar-charts">
            <div className="bar-chart-stats skeleton-chart mb-4"></div>
            <div className="pie-chart-stats skeleton-chart"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stats">
      {singleWorker ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* {singleWorkerAttendanceData.length > 0 && (
            <PieChartStats
              title={`${singleWorker.name}'s Attendance Breakdown`}
              data={singleWorkerAttendanceData}
              dataKey="value"
              labelKey="label"
            />
          )} */}
        </div>
      ) : (
        <>
          {roleAttendanceData.length > 0 && (
            <div className="grid-item page-stats-grid-items grade-distribution-chart">
              <GradeDistributionBarChart
                title="Role Attendance Distribution"
                workers={workers}
                data={roleAttendanceData}
                dataKey="count"
                labelKey="role"
                height={300}
              />
            </div>
          )}

          <div className="grid-item page-stats-grid-items grade-category-chart">
            <StackedCategoryGradeChart
              title="Attendance per Role"
              workers={workers}
            />
          </div>

          {rolePieData.length > 0 && (
            <div className="grid-item page-stats-grid-items breakdown-pie-chart">
              <PieChartStats
                title="Worker Roles Breakdown"
                data={rolePieData}
                dataKey="value"
                labelKey="label"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WorkerStats;
