import React, { useMemo } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend
} from "recharts";

/**
 * Multi-dimensional performance radar for workers
 * Shows: Attendance, Session Activity, Student Reach, Punctuality, Consistency
 */
export default function WorkerPerformanceRadar({ 
  attendanceRecords, 
  joinedSessions, 
  sessionParticipants,
  className 
}) {
  const performanceData = useMemo(() => {
    // Calculate metrics (0-100 scale)
    
    // 1. Attendance Rate
    const presentCount = attendanceRecords?.filter(r => 
      (r.status || '').toLowerCase() === 'present'
    ).length || 0;
    const totalAttendance = attendanceRecords?.length || 1;
    const attendanceScore = Math.round((presentCount / totalAttendance) * 100);
    
    // 2. Punctuality (not late)
    const lateCount = attendanceRecords?.filter(r => 
      (r.status || '').toLowerCase() === 'late'
    ).length || 0;
    const punctualityScore = Math.round(((totalAttendance - lateCount) / totalAttendance) * 100);
    
    // 3. Session Activity (relative to expected - assume 20 sessions/month is 100%)
    const sessionCount = joinedSessions?.length || 0;
    const sessionScore = Math.min(100, Math.round((sessionCount / 20) * 100));
    
    // 4. Student Reach (relative to 100 students = 100%)
    const workerSessionIds = joinedSessions?.map(s => s.id) || [];
    const participants = sessionParticipants?.filter(p => 
      workerSessionIds.includes(p.session_id)
    ) || [];
    const uniqueStudents = [...new Set(participants.map(p => p.student_id))].length;
    const reachScore = Math.min(100, Math.round((uniqueStudents / 100) * 100));
    
    // 5. Consistency (attendance variance - lower variance = higher score)
    const consistencyScore = attendanceRecords?.length > 0 ? calculateConsistency(attendanceRecords) : 0;
    
    return [
      { metric: 'Attendance', score: attendanceScore, fullMark: 100 },
      { metric: 'Punctuality', score: punctualityScore, fullMark: 100 },
      { metric: 'Sessions', score: sessionScore, fullMark: 100 },
      { metric: 'Student Reach', score: reachScore, fullMark: 100 },
      { metric: 'Consistency', score: consistencyScore, fullMark: 100 },
    ];
  }, [attendanceRecords, joinedSessions, sessionParticipants]);

  // Calculate consistency based on attendance pattern
  function calculateConsistency(records) {
    if (records.length < 3) return 100; // Not enough data, assume consistent
    
    // Group by week
    const weeklyAttendance = records.reduce((acc, record) => {
      const date = new Date(record.date || record.created_at);
      const week = `${date.getFullYear()}-W${getWeekNumber(date)}`;
      
      if (!acc[week]) acc[week] = { present: 0, total: 0 };
      if ((record.status || '').toLowerCase() === 'present') acc[week].present += 1;
      acc[week].total += 1;
      
      return acc;
    }, {});
    
    // Calculate weekly rates
    const weeklyRates = Object.values(weeklyAttendance).map(w => 
      w.total > 0 ? (w.present / w.total) * 100 : 0
    );
    
    // Calculate standard deviation
    const mean = weeklyRates.reduce((sum, rate) => sum + rate, 0) / weeklyRates.length;
    const variance = weeklyRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / weeklyRates.length;
    const stdDev = Math.sqrt(variance);
    
    // Lower std dev = higher consistency (invert and normalize)
    return Math.max(0, Math.round(100 - (stdDev * 2)));
  }
  
  function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  const averageScore = Math.round(
    performanceData.reduce((sum, item) => sum + item.score, 0) / performanceData.length
  );

  return (
    <div className={`graphs chart-card ${className || ''}`}>
      <h3 className="chart-title">Performance Overview</h3>
      
      {/* Overall Score */}
      <div style={{ 
        textAlign: 'center',
        marginBottom: 16,
        padding: '12px',
        background: 'rgba(249, 250, 251, 0.5)',
        borderRadius: 8
      }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: getScoreColor(averageScore) }}>
          {averageScore}/100
        </div>
        <div style={{ fontSize: 14, color: '#666' }}>Overall Performance Score</div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={performanceData} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
          <PolarGrid stroke="rgba(0,0,0,0.1)" />
          <PolarAngleAxis 
            dataKey="metric" 
            tick={{ fontSize: 12, fill: '#333' }}
          />
          <PolarRadiusAxis 
            angle={90} 
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
          />
          <Radar
            name="Performance"
            dataKey="score"
            stroke="#0077BE"
            fill="#0077BE"
            fillOpacity={0.4}
            strokeWidth={2}
          />
          <Tooltip 
            contentStyle={{ 
              borderRadius: 8, 
              border: '1px solid rgba(0,0,0,0.1)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
            formatter={(value) => [`${value}/100`, 'Score']}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
        </RadarChart>
      </ResponsiveContainer>

      {/* Metric Breakdown */}
      <div style={{ marginTop: 16 }}>
        {performanceData.map((item, idx) => (
          <div 
            key={idx}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              borderRadius: 6,
              background: idx % 2 === 0 ? 'rgba(249, 250, 251, 0.5)' : 'transparent',
              marginBottom: 4
            }}
          >
            <span style={{ fontSize: 13, color: '#333' }}>{item.metric}</span>
            <span style={{ 
              fontSize: 14, 
              fontWeight: 700, 
              color: getScoreColor(item.score) 
            }}>
              {item.score}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getScoreColor(score) {
  if (score >= 80) return '#169A59'; // green
  if (score >= 60) return '#F1C40F'; // yellow
  if (score >= 40) return '#E67E22'; // orange
  return '#EA333F'; // red
}
