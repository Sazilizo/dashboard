import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { useAuth } from "../context/AuthProvider";

export default function DashboardLayout() {
  const { user } = useAuth();
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Topbar />
        <main style={{ flex: 1, padding: 24, overflowY: "scroll" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
