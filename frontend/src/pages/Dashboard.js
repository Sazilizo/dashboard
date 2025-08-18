import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { useAuth } from "../context/AuthProvider";

export default function DashboardLayout() {
  const { user } = useAuth();
  return (
    <div style={{ display: "flex", height: "100vh", margin: 0 }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Topbar />
        <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
