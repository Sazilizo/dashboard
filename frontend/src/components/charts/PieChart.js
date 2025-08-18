import React from "react";
import {
  PieChart,
  Pie,
  Tooltip,
  Cell,
  Legend,
  ResponsiveContainer
} from "recharts";

const COLORS = [
  "#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#8dd1e1", "#a4de6c",
  "#d0ed57", "#ffbb28", "#ff6666", "#99ccff"
];

const PieChartStats = ({ title, data, dataKey = "value", labelKey = "label", height = 300 }) => {
  if (!data || data.length === 0) return null;


  return (
    <div className="rounded-chart">
      <h3 className="chart-title">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey={dataKey}
            nameKey={labelKey}
            cx="50%"
            cy="50%"
            outerRadius={80}
            fill="#8884d8"
            label
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PieChartStats;
