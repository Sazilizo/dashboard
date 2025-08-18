import React, { useEffect } from "react";
import DashboardSummary from "../components/charts/DashboardSummary";
import { Outlet } from "react-router-dom";

export default function DashboardHome() {

  return (
    <div>
      <h2>School Overview</h2>
      {/* <DashboardSummary /> */}
      {/* Add more summary cards/charts here */}
      <Outlet />
    </div>
  );
}
