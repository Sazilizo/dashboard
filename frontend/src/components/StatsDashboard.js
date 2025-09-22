import React from "react";
import "../styles/main.css";

const StatsDashboard = ({ charts = [], loading }) => {
  if (loading) {
    return (
      <div className="page-stats">
        <div className="stats-header">
          <h3 className="text-xl font-semibold mb-4">Statistics</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {charts.map((_, i) => (
            <div key={i} className="skeleton-chart h-[300px] rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stats">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {charts.map(({ Component, props, title }, i) => (
          <div key={i} className="chart-card p-4 bg-white shadow rounded-xl">
            {title && <h4 className="mb-2 text-lg font-semibold">{title}</h4>}
            <Component {...props} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatsDashboard;
