import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from "recharts";

const STATUS_COLORS = {
  present: "#169A59",
  absent: "#EA333F",
  late: "#F1C40F",
  rate: "#0077BE"
};

/**
 * Shows worker's attendance trend over time
 * Displays attendance rate and status breakdown
 */
export default function WorkerAttendanceTrendChart({ attendanceRecords, className }) {
  const { chartData, stats } = useMemo(() => {
    if (!attendanceRecords?.length) {
      return { chartData: [], stats: { present: 0, absent: 0, late: 0, rate: 0 } };
    }
    
    // Group by month
    const monthlyData = attendanceRecords.reduce((acc, record) => {
      const date = new Date(record.date || record.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!acc[monthKey]) {
        acc[monthKey] = {
          month: monthLabel,
          present: 0,
          absent: 0,
          late: 0,
          total: 0,
          sortKey: monthKey
        };
      }
      
      const status = (record.status || '').toLowerCase();
      if (status === 'present') acc[monthKey].present += 1;
      else if (status === 'absent') acc[monthKey].absent += 1;
      else if (status === 'late') acc[monthKey].late += 1;
      
      acc[monthKey].total += 1;
      
      return acc;
    }, {});
    
    // Calculate attendance rate for each month
    const data = Object.values(monthlyData)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-6) // Last 6 months
      .map(month => ({
        ...month,
        rate: month.total > 0 ? Math.round((month.present / month.total) * 100) : 0
      }));
    
    // Overall stats
    const totalPresent = attendanceRecords.filter(r => (r.status || '').toLowerCase() === 'present').length;
    const totalAbsent = attendanceRecords.filter(r => (r.status || '').toLowerCase() === 'absent').length;
    const totalLate = attendanceRecords.filter(r => (r.status || '').toLowerCase() === 'late').length;
    const total = attendanceRecords.length;
    const overallRate = total > 0 ? Math.round((totalPresent / total) * 100) : 0;
    
    return {
      chartData: data,
      stats: {
        present: totalPresent,
        absent: totalAbsent,
        late: totalLate,
        rate: overallRate,
        total
      }
    };
  }, [attendanceRecords]);

  if (!chartData.length) {
    return (
      <div className={`graphs ${className || ''}`}>
        <h3 className="chart-title">Attendance Trend</h3>
        <p style={{ textAlign: 'center', color: '#888', padding: '40px 20px' }}>
          No attendance records available
        </p>
      </div>
    );
  }

  return (
    <div className={`graphs chart-card ${className || ''}`}>
      <h3 className="chart-title">Attendance Reliability - Last 6 Months</h3>
      
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
          <div style={{ fontSize: 28, fontWeight: 700, color: STATUS_COLORS.rate }}>
            {stats.rate}%
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>Attendance Rate</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: STATUS_COLORS.present }}>{stats.present}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Present</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: STATUS_COLORS.late }}>{stats.late}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Late</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: STATUS_COLORS.absent }}>{stats.absent}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Absent</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
          <defs>
            <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={STATUS_COLORS.rate} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={STATUS_COLORS.rate} stopOpacity={0.05}/>
            </linearGradient>
          </defs>
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
            domain={[0, 100]}
            label={{ value: 'Attendance %', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
          />
          <Tooltip 
            contentStyle={{ 
              borderRadius: 8, 
              border: '1px solid rgba(0,0,0,0.1)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
            formatter={(value, name) => {
              if (name === 'rate') return [`${value}%`, 'Attendance Rate'];
              return [value, name.charAt(0).toUpperCase() + name.slice(1)];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 10 }} />
          <Area
            type="monotone"
            dataKey="rate"
            stroke={STATUS_COLORS.rate}
            strokeWidth={3}
            fill="url(#colorRate)"
            name="Attendance Rate"
          />
          <Line 
            type="monotone" 
            dataKey="present" 
            stroke={STATUS_COLORS.present} 
            strokeWidth={2}
            dot={{ r: 4 }}
            name="Present"
          />
          <Line 
            type="monotone" 
            dataKey="late" 
            stroke={STATUS_COLORS.late} 
            strokeWidth={2}
            dot={{ r: 4 }}
            name="Late"
          />
          <Line 
            type="monotone" 
            dataKey="absent" 
            stroke={STATUS_COLORS.absent} 
            strokeWidth={2}
            dot={{ r: 4 }}
            name="Absent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
