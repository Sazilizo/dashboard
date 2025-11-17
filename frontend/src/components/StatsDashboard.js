import React from "react";
import "../styles/main.css";

const StatsDashboard = ({ charts = [], loading }) => {
  if (loading) {
    return (
      <div className="page-stats">
        <div className="stats-header">
          <h3 className="text-xl font-semibold mb-4">Statistics</h3>
        </div>
        {/* Use the same `.stats-grid` + `.chart-card` structure when loading so
            the responsive CSS applies consistently (stacking on small screens). */}
        <div className="stats-grid">
          {charts.map((_, i) => (
            <div key={i} className="chart-card">
              <div className="chart-card-inner skeleton-chart" style={{ minHeight: 220 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stats-grid">
      {charts.map(({ Component, props }, i) => (
        <div key={i} className="chart-card">
          <div className="chart-card-inner">
            <Component {...props} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsDashboard;
