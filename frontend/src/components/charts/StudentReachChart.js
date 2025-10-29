import React, { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";

const COLORS = [
  "#0077BE", // blue
  "#169A59", // green
  "#EA333F", // red
  "#F1C40F", // yellow
  "#9B59B6", // purple
  "#E67E22", // orange
  "#1ABC9C", // turquoise
  "#34495E", // dark gray
];

const RADIAN = Math.PI / 180;

/**
 * Shows how many students a worker has impacted
 * Breaks down by grade or category
 */
export default function StudentReachChart({ joinedSessions, sessionParticipants, displayType = "grade", className }) {
  const { pieData, barData, totalStudents } = useMemo(() => {
    if (!joinedSessions?.length || !sessionParticipants?.length) {
      return { pieData: [], barData: [], totalStudents: 0 };
    }
    
    // Get all session IDs this worker is involved in
    const workerSessionIds = joinedSessions.map(s => s.id);
    
    // Find all participants in those sessions
    const participants = sessionParticipants.filter(p => 
      workerSessionIds.includes(p.session_id)
    );
    
    // Get unique students
    const uniqueStudentIds = [...new Set(participants.map(p => p.student_id))];
    
    // Count by grade or category
    const counts = participants.reduce((acc, participant) => {
      const key = displayType === "grade" 
        ? participant.student?.grade || "Unknown"
        : participant.student?.category || "Uncategorized";
      
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    
    // Pie chart data
    const pieChartData = Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    
    // Bar chart data (for grade distribution)
    const barChartData = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        // Sort grades naturally (R1, R2, 1A, 1B, etc.)
        const aNum = parseInt(a.name) || 0;
        const bNum = parseInt(b.name) || 0;
        return aNum - bNum || a.name.localeCompare(b.name);
      });
    
    return {
      pieData: pieChartData,
      barData: barChartData,
      totalStudents: uniqueStudentIds.length
    };
  }, [joinedSessions, sessionParticipants, displayType]);

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    
    if (percent < 0.05) return null; // Don't show label if less than 5%
    
    return (
      <text 
        x={x} 
        y={y} 
        fill="#fff" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        style={{ fontWeight: 700, fontSize: 13 }}
      >
        {value}
      </text>
    );
  };

  if (!pieData.length) {
    return (
      <div className={`graphs ${className || ''}`}>
        <h3 className="chart-title">Student Reach</h3>
        <p style={{ textAlign: 'center', color: '#888', padding: '40px 20px' }}>
          No student data available
        </p>
      </div>
    );
  }

  return (
    <div className={`graphs chart-card ${className || ''}`}>
      <h3 className="chart-title">Student Reach - {displayType === "grade" ? "By Grade" : "By Category"}</h3>
      
      {/* Summary Stat */}
      <div style={{ 
        textAlign: 'center',
        marginBottom: 16,
        padding: '12px',
        background: 'rgba(249, 250, 251, 0.5)',
        borderRadius: 8
      }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#0077BE' }}>{totalStudents}</div>
        <div style={{ fontSize: 14, color: '#666' }}>Total Students Impacted</div>
      </div>

      {displayType === "grade" && barData.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={barData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 12 }}
              label={{ value: 'Grade', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              allowDecimals={false}
              label={{ value: 'Students', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
            />
            <Tooltip 
              contentStyle={{ 
                borderRadius: 8, 
                border: '1px solid rgba(0,0,0,0.1)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              formatter={(value) => [value, 'Students']}
            />
            <Bar 
              dataKey="count" 
              fill="#0077BE"
              radius={[6, 6, 0, 0]}
            >
              {barData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomizedLabel}
              outerRadius={90}
              fill="#8884d8"
              dataKey="value"
              nameKey="label"
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                borderRadius: 8, 
                border: '1px solid rgba(0,0,0,0.1)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            />
            <Legend 
              wrapperStyle={{ fontSize: 13 }}
              formatter={(value, entry) => `${value}: ${entry.value}`}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
