import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const COLORS = [
  "#ea333f", // red
  "#0077be", // blue
  "#169a59"  // green
];

export default function StackedCategoryGradeChart({ students, height = 300 }) {
  // Process students to build data for stacked bars
  const data = useMemo(() => {
    if (!students?.length) return [];

    // Get all unique numeric grades
    const allGrades = Array.from(
      new Set(
        students.map((s) => {
          const match = s.grade?.match(/^\d+/);
          return match ? match[0] : "Unknown";
        })
      )
    ).sort((a, b) => Number(a) - Number(b));

    // Get all unique categories
    const allCategories = Array.from(
      new Set(students.map((s) => s.category || "Uncategorized"))
    );

    // Count by grade and category
    const counts = students.reduce((acc, student) => {
      const gradeMatch = student.grade?.match(/^\d+/);
      const grade = gradeMatch ? gradeMatch[0] : "Unknown";
      const category = student.category || "Uncategorized";

      if (!acc[grade]) acc[grade] = {};
      acc[grade][category] = (acc[grade][category] || 0) + 1;
      return acc;
    }, {});

    // Build final data array, zero fill missing categories
    return allGrades.map((grade) => {
      const countsPerCategory = {};
      allCategories.forEach((cat) => {
        countsPerCategory[cat] = counts[grade]?.[cat] || 0;
      });
      return {
        grade,
        ...countsPerCategory,
      };
    });
  }, [students]);

  if (!students?.length) {
    return <div>No data available</div>;
  }

  // Extract category keys for bars
  const categoryKeys = students
    ? Array.from(new Set(students.map((s) => s.category || "Uncategorized")))
    : [];

  return (
    <div className="graphs">
      <h3 className="chart-title">Student Cat. per Grade</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          // margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
        >
          <CartesianGrid strokeDasharray="3 6" />
          <XAxis dataKey="grade" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          {categoryKeys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="a"
              fill={COLORS[index % COLORS.length]}
              name={key.toUpperCase()}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
