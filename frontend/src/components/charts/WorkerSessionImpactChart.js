import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from "recharts";

const COLORS = {
  academic: "#0077BE",
  pe: "#169A59",
  total: "#EA333F"
};

/**
 * Shows sessions led by worker over time (monthly breakdown)
 * For tutors/coaches to see their teaching activity
 */
export default function WorkerSessionImpactChart({ joinedSessions, roleName, className }) {
  const chartData = useMemo(() => {
    if (!joinedSessions?.length) return [];
    
    // Group sessions by month
    const monthlyData = joinedSessions.reduce((acc, session) => {
      const date = new Date(session.date || session.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!acc[monthKey]) {
        acc[monthKey] = {
          month: monthLabel,
          academic: 0,
          pe: 0,
          total: 0,
          sortKey: monthKey
        };
      }
      
      // Determine session type from category or table name
      const isAcademic = session.category?.toLowerCase().includes('academic') || 
                         session.session_name?.toLowerCase().includes('academic');
      
      if (isAcademic) {
        acc[monthKey].academic += 1;
      } else {
        acc[monthKey].pe += 1;
      }
      acc[monthKey].total += 1;
      
      return acc;
    }, {});
    
    // Convert to array and sort by date
    return Object.values(monthlyData)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-6); // Last 6 months
  }, [joinedSessions]);

  const totalSessions = joinedSessions?.length || 0;
  const academicCount = joinedSessions?.filter(s => 
    s.category?.toLowerCase().includes('academic') || 
    s.session_name?.toLowerCase().includes('academic')
  ).length || 0;
  const peCount = totalSessions - academicCount;

  if (!chartData.length) {
    return (
      <div className={`graphs ${className || ''}`}>
        <h3 className="chart-title">Session Impact</h3>
        <p style={{ textAlign: 'center', color: '#888', padding: '40px 20px' }}>
          No sessions assigned yet
        </p>
      </div>
    );
  }

  return (
    <div className={`graphs chart-card ${className || ''}`}>
      <h3 className="chart-title">Session Impact - Last 6 Months</h3>
      
      {/* Summary Stats */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-around', 
        marginBottom: 16,
        padding: '12px',
        background: 'rgba(249, 250, 251, 0.5)',
        borderRadius: 8
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.total }}>{totalSessions}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Total Sessions</div>
        </div>
        {academicCount > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.academic }}>{academicCount}</div>
            <div style={{ fontSize: 12, color: '#666' }}>Academic</div>
          </div>
        )}
        {peCount > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.pe }}>{peCount}</div>
            <div style={{ fontSize: 12, color: '#666' }}>PE</div>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis 
            dataKey="month" 
            tick={{ fontSize: 12 }}
            angle={-15}
            textAnchor="end"
            height={60}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            allowDecimals={false}
          />
          <Tooltip 
            contentStyle={{ 
              borderRadius: 8, 
              border: '1px solid rgba(0,0,0,0.1)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          />
          <Legend 
            wrapperStyle={{ fontSize: 13, paddingTop: 10 }}
          />
          {academicCount > 0 && (
            <Bar 
              dataKey="academic" 
              fill={COLORS.academic} 
              name="Academic Sessions"
              radius={[6, 6, 0, 0]}
            />
          )}
          {peCount > 0 && (
            <Bar 
              dataKey="pe" 
              fill={COLORS.pe} 
              name="PE Sessions"
              radius={[6, 6, 0, 0]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
