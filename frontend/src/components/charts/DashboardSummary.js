
import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

const GradeDistributionBarChart = ({ title, students, height = 300 }) => {
  // Aggregate students into grade counts
  const data = useMemo(() => {
    if (!students || students.length === 0) return [];

    const gradeCounts = students.reduce((acc, student) => {
      const grade = student.grade || "Unknown";
      acc[grade] = (acc[grade] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(gradeCounts).map(([grade, count]) => ({
      grade,
      count
    }));
  }, [students]);

  if (data.length === 0) return null;

  return (
    <div className="graphs">
      <h3 className="chart-title">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data }>
          <CartesianGrid strokeDasharray="3 4" />
          <XAxis dataKey="grade" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="count" fill="#82ca9d" name="Number of Students" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default GradeDistributionBarChart;

