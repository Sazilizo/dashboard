import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import '../../styles/graphs.css';

const WorkerAttendanceTrend = ({ worker }) => {
  const attendanceData = useMemo(() => {
    if (!worker?.attendance_records?.length) return [];

    // Group by month
    const monthlyData = {};
    
    worker.attendance_records.forEach(record => {
      if (!record.date) return;
      
      const date = new Date(record.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthLabel,
          present: 0,
          absent: 0,
          late: 0,
          total: 0,
        };
      }
      
      const status = (record.status || '').toLowerCase();
      monthlyData[monthKey].total++;
      
      if (status === 'present') monthlyData[monthKey].present++;
      else if (status === 'absent') monthlyData[monthKey].absent++;
      else if (status === 'late') monthlyData[monthKey].late++;
    });

    // Convert to array and calculate rates
    return Object.keys(monthlyData)
      .sort()
      .map(key => {
        const data = monthlyData[key];
        return {
          month: data.month,
          attendanceRate: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
          lateRate: data.total > 0 ? Math.round((data.late / data.total) * 100) : 0,
          absentRate: data.total > 0 ? Math.round((data.absent / data.total) * 100) : 0,
        };
      });
  }, [worker]);

  if (!attendanceData.length) return null;

  return (
    <div className="chart-card">
      <h3 className="chart-title">Attendance Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={attendanceData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
          <XAxis 
            dataKey="month" 
            tick={{ fontSize: 12 }}
            stroke="#64748b"
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            stroke="#64748b"
            domain={[0, 100]}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
            formatter={(value) => `${value}%`}
          />
          <Legend 
            wrapperStyle={{ fontSize: '14px' }}
            iconType="line"
          />
          <Line 
            type="monotone" 
            dataKey="attendanceRate" 
            stroke="#169a59" 
            strokeWidth={3}
            name="Present Rate"
            dot={{ fill: '#169a59', r: 5 }}
            activeDot={{ r: 7 }}
          />
          <Line 
            type="monotone" 
            dataKey="lateRate" 
            stroke="#f1c40f" 
            strokeWidth={2}
            name="Late Rate"
            dot={{ fill: '#f1c40f', r: 4 }}
            strokeDasharray="5 5"
          />
          <Line 
            type="monotone" 
            dataKey="absentRate" 
            stroke="#ea333f" 
            strokeWidth={2}
            name="Absent Rate"
            dot={{ fill: '#ea333f', r: 4 }}
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WorkerAttendanceTrend;
