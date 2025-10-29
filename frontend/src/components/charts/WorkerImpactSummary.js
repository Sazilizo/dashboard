import React, { useMemo } from 'react';
import '../../styles/graphs.css';

const WorkerImpactSummary = ({ worker, sessions = [], participants = [] }) => {
  const metrics = useMemo(() => {
    // Calculate total students impacted
    const uniqueStudentIds = new Set(
      participants.map(p => p.student_id).filter(Boolean)
    );
    const studentsImpacted = uniqueStudentIds.size;

    // Calculate session stats
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.status === 'completed' || s.completed).length;
    const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

    // Calculate attendance rate (if worker has attendance_records)
    let attendanceRate = 0;
    if (worker.attendance_records?.length > 0) {
      const presentCount = worker.attendance_records.filter(r => 
        r.status === 'present' || r.status === 'Present'
      ).length;
      attendanceRate = Math.round((presentCount / worker.attendance_records.length) * 100);
    }

    // Calculate average student specs (if participants have specs)
    let avgSpecs = 0;
    const specsData = participants.filter(p => p.specs && typeof p.specs === 'object');
    if (specsData.length > 0) {
      const totalSpecs = specsData.reduce((sum, p) => {
        const specs = Object.values(p.specs).filter(v => typeof v === 'number');
        const avg = specs.length > 0 ? specs.reduce((a, b) => a + b, 0) / specs.length : 0;
        return sum + avg;
      }, 0);
      avgSpecs = Math.round(totalSpecs / specsData.length);
    }

    return {
      studentsImpacted,
      totalSessions,
      completionRate,
      attendanceRate,
      avgSpecs,
    };
  }, [worker, sessions, participants]);

  const MetricCard = ({ label, value, suffix = '', color = '#0077BE' }) => (
    <div 
      className="impact-metric-card"
      style={{
        background: '#fff',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        textAlign: 'center',
        border: `2px solid ${color}15`,
        transition: 'all 0.3s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      }}
    >
      <div style={{ 
        fontSize: '2.5rem', 
        fontWeight: 700, 
        color,
        marginBottom: '8px',
        lineHeight: 1,
      }}>
        {value}{suffix}
      </div>
      <div style={{ 
        fontSize: '0.9rem', 
        color: '#64748b',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        {label}
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 className="chart-title" style={{ marginBottom: '20px', fontSize: '1.3rem' }}>
        Impact Summary
      </h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
      }}>
        {metrics.studentsImpacted > 0 && (
          <MetricCard 
            label="Students Impacted" 
            value={metrics.studentsImpacted}
            color="#169a59"
          />
        )}
        {metrics.totalSessions > 0 && (
          <MetricCard 
            label="Total Sessions" 
            value={metrics.totalSessions}
            color="#0077BE"
          />
        )}
        {metrics.completionRate > 0 && (
          <MetricCard 
            label="Completion Rate" 
            value={metrics.completionRate}
            suffix="%"
            color="#6366f1"
          />
        )}
        {metrics.attendanceRate > 0 && (
          <MetricCard 
            label="Attendance Rate" 
            value={metrics.attendanceRate}
            suffix="%"
            color="#ea333f"
          />
        )}
        {metrics.avgSpecs > 0 && (
          <MetricCard 
            label="Avg Student Score" 
            value={metrics.avgSpecs}
            suffix="/100"
            color="#f1c40f"
          />
        )}
      </div>
    </div>
  );
};

export default WorkerImpactSummary;
