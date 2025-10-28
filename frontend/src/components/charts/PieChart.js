import React from "react";
import {
  PieChart,
  Pie,
  Tooltip,
  Cell,
  Legend,
  ResponsiveContainer
} from "recharts";
const RADIAN = Math.PI / 180;

const COLORS = [
  "#ea333f", // red
  "#0077be", // blue
  "#169a59", // green
  "#f1c40f", // yellow
];

const PieChartStats = ({ title, data, dataKey = 'value', labelKey = 'label', height = 300 }) => {
  if (!data || data.length === 0) return null;

  // Custom label to display value inside each slice
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, value }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    // show integer or percent-friendly value
    const label = typeof value === 'number' ? String(value) : value;
    return (
      <text x={x} y={y} fill="#fff" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" style={{ fontWeight: 700, fontSize: 12 }}>
        {label}
      </text>
    );
  };

  return (
    <div className="graphs">
      <h3 className="chart-title">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey={dataKey}
            nameKey={labelKey}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={80}
            fill="#8884d8"
            labelLine={false}
            label={renderCustomizedLabel}
            stroke="none"
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
