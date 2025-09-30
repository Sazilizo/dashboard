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
    <>
        {charts.map(({ Component, props }, i) => (
          <div key={i} className="page-stats chart-card p-4 bg-white shadow rounded-xl">
            <Component {...props} />
          </div>
        ))}
    </>
  );
};

export default StatsDashboard;
