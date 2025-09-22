import React, { useMemo } from "react";
import PieChartStats from "../charts/PieChart";
import GradeDistributionBarChart from "../charts/DashboardSummary";
import StackedCategoryGradeChart from "../charts/StackedChart";
import "../../styles/main.css";
 // Assuming you have styles for the charts
const StudentStats = ({ students, loading }) => {
  // Pie Chart Data: category breakdown
  const pieChartData = useMemo(() => {
    if (!students?.length) return [];
    const counts = students.reduce((acc, student) => {
      const category = student.category || "Uncategorized";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [students]);

  // Bar Chart Data: category count per grade
  const barChartData = useMemo(() => {
    if (!students?.length) return [];
    const counts = students.reduce((acc, student) => {
      const grade = student.grade || "Unknown Grade";
      const category = student.category || "Uncategorized";
      acc[grade] = acc[grade] || {};
      acc[grade][category] = (acc[grade][category] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).map(([grade, categories]) => ({
      grade,
      ...categories,
    }));
  }, [students]);

  if (loading) {
    return (
      <div className="page-stats">
        <div className="stats-header">
          <h3 className="text-xl font-semibold mb-4">Statistics</h3>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stacked Chart */}
        <div className="stacked-chart-stats">
          {barChartData.length > 0 && (
            <div className="bar-chart-stats">
              <GradeDistributionBarChart
                title="Categories per Grade"
                students={students}
                data={barChartData}
                dataKey="count"
                labelKey="grade"
                height={300}
              />
            </div>
          )}
        </div>

        <div className="bar-charts">
          <StackedCategoryGradeChart
            title="Categories per Grade"
            students={students}
          />
          {pieChartData.length > 0 && (
            <div className="pie-chart-stats">
              <PieChartStats
                title="Stdnt Cat Breakdown"
                data={pieChartData}
                dataKey="value"
                labelKey="label"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentStats;
