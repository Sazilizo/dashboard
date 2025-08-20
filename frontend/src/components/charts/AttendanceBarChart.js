import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from "recharts";
import StudentChartFilters from "../filters/StudentChartFilters";

export default function AttendanceBarChart({ student }) {
  const [filters, setFilters] = useState({
    year: new Date().getFullYear(),
    months: [new Date().toLocaleString("default", { month: "long" })],
    session: "all",
  });

  const monthColors = {
    January: "#6366F1",
    February: "#8B5CF6",
    March: "#A78BFA",
    April: "#C4B5FD",
    May: "#EDE9FE",
    June: "#FBBF24",
    July: "#F59E0B",
    August: "#EF4444",
    September: "#EC4899",
    October: "#10B981",
    November: "#3B82F6",
    December: "#6366F1",
  };

  const filteredData = useMemo(() => {
    if (!student?.attendance_records?.length) return [];

    return student.attendance_records
      .filter((rec) => {
        const date = new Date(rec.date);
        const monthName = date.toLocaleString("default", { month: "long" });
        return (
          date.getFullYear() === filters.year &&
          (!filters.months?.length || filters.months.includes(monthName)) &&
          (filters.session === "all" || rec.session_type === filters.session)
        );
      })
      .map((rec) => {
        const date = new Date(rec.date);
        return {
          date,
          label: `${date.getDate()} ${date.toLocaleString("default", { month: "short" })}`,
          present: rec.status === "present" ? 1 : 0,
          month: date.toLocaleString("default", { month: "long" }),
        };
      });
  }, [student, filters]);

  const dailyData = useMemo(() => {
    const agg = [];
    filteredData.forEach((cur) => {
      const existing = agg.find((a) => a.label === cur.label);
      if (existing) existing.present += cur.present;
      else agg.push(cur);
    });
    return agg.sort((a, b) => a.date - b.date);
  }, [filteredData]);

  return (
    <div className="p-4 bg-white rounded-2xl shadow">
      <h2 className="text-lg font-bold mb-2">Attendance Chart</h2>
      <StudentChartFilters filters={filters} onChange={setFilters} />

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={dailyData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis allowDecimals={false} />
          <Tooltip formatter={(value) => (value === 1 ? "Present" : "Absent")} />
          <Bar dataKey="present" isAnimationActive={false}>
            {dailyData.map((entry, index) => (
              <Cell key={index} fill={monthColors[entry.month] || "#4f46e5"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
