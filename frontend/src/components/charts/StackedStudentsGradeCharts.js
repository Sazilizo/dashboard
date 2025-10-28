import React, { useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const COLORS = {
  A: "#ea333f", // red
  B: "#0077be", // blue
  C: "#169a59", // green
  D: "#f1c40f", // yellow
  E: "#9b59b6", // purple
  F: "#e67e22", // orange
};

// Custom Legend placed below chart
function LetterLegend({ letters }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: "1rem",
        flexWrap: "wrap",
        marginTop: "12px",
      }}
    >
      {letters.map((letter) => (
        <div
          key={letter}
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              backgroundColor: COLORS[letter] || "#8884d8",
              borderRadius: 2,
            }}
          ></span>
          <span style={{ fontSize: "0.9rem" }}>{letter}</span>
        </div>
      ))}
    </div>
  );
}

export default React.memo(function StackedStudentsGradeChart({ students, height = 300 }) {
  const data = useMemo(() => {
    if (!students?.length) return [];

    // Extract all subgrades like "2A", "3B", etc.
    const allGrades = Array.from(
      new Set(students.map((s) => s.grade || "Unknown"))
    ).sort((a, b) => {
      const [numA, letterA] = [parseInt(a), a.replace(/^\d+/, "")];
      const [numB, letterB] = [parseInt(b), b.replace(/^\d+/, "")];
      if (numA === numB) return letterA.localeCompare(letterB);
      return numA - numB;
    });

    // Extract base grade levels (numeric part only)
    const gradeLevels = Array.from(
      new Set(
        allGrades.map((g) => {
          const match = g.match(/^(\d+)/);
          return match ? match[1] : "Unknown";
        })
      )
    ).sort((a, b) => parseInt(a) - parseInt(b));

    // Aggregate counts: level → subgrade → count
    const counts = students.reduce((acc, student) => {
      const grade = student.grade || "Unknown";
      const levelMatch = grade.match(/^(\d+)/);
      const level = levelMatch ? levelMatch[1] : "Unknown";

      if (!acc[level]) acc[level] = {};
      acc[level][grade] = (acc[level][grade] || 0) + 1;
      return acc;
    }, {});

    // Build chart data
    return gradeLevels.map((level) => {
      const subgrades = allGrades.filter((g) => g.startsWith(level));
      const entry = { grade: level };
      subgrades.forEach((sg) => {
        entry[sg] = counts[level]?.[sg] || 0;
      });
      return entry;
    });
  }, [students]);

  useEffect(() => {
    // kept for debugging; can be removed in production
    console.log("StackedStudentsGradeChart data:", data);
  }, [data]);

  if (!students?.length) {
    return <div className="graphs">No data available</div>;
  }

  // Determine unique subgrades (2A, 3B, etc.)
  const subgradeKeys = Array.from(
    new Set(students.map((s) => s.grade || "Unknown"))
  ).sort((a, b) => {
    const [numA, letterA] = [parseInt(a), a.replace(/^\d+/, "")];
    const [numB, letterB] = [parseInt(b), b.replace(/^\d+/, "")];
    if (numA === numB) return letterA.localeCompare(letterB);
    return numA - numB;
  });

  // Color by subgrade letter
  const getColorForSubgrade = (subgrade) => {
    const letter = subgrade.replace(/^\d+/, "") || "Unknown";
    return COLORS[letter] || "#8884d8";
  };

  // Unique subgrade letters for legend
  const subgradeLetters = Array.from(
    new Set(
      subgradeKeys.map((sg) => sg.replace(/^\d+/, "") || "Unknown")
    )
  ).sort();

  return (
    <div className="graphs">
      <h3 className="chart-title">Student Count per Grade</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 6" />
          <XAxis
            dataKey="grade"
            label={{ value: "Grade", position: "bottom", dy: 10 }}
          />
          <YAxis allowDecimals={false} />
          <Tooltip />
          {/* Disable built-in legend to avoid duplicates */}
          <Legend verticalAlign="bottom" height={36} />
          {subgradeKeys.map((subgrade) => (
            <Bar
              key={subgrade}
              dataKey={subgrade}
              stackId="a"
              fill={getColorForSubgrade(subgrade)}
              radius={[6, 6, 0, 0]}
              name={subgrade}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <LetterLegend letters={subgradeLetters} />
    </div>
  );
});
