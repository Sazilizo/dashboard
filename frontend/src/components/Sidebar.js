import React, { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";
import Logout from "../pages/Logout";
import logo from "../assets/education-bg.png"

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/dashboard/schools", label: "schools" },
  { to: "/dashboard/students", label: "Students" },
  { to: "/dashboard/sessions", label: "Student Sessions" },
  { to: "/dashboard/workers", label: "Workers" },
  { to: "/dashboard/trainings/create", label: "Worker Trainings" },
  // { to: "/dashboard/settings", label: "Settings" },
];

export default function Sidebar() {
  const { user } = useAuth();

  const notPrivileged = ["head tutor", "head coach"].includes(user?.profile?.roles.name);

  return (
    <div className="sidebar">
      <div className="logo">
        {/* <img src={logo}  alt="logo"/> */}
      </div>
      <nav>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {navItems.map(item => {      
            return(
              <li key={item.to} style={{ marginBottom: 16 }}>
                {(item.label.includes("Worker Trainings") || item.label.includes("Workers")) && notPrivileged ? "": <NavLink to={item.to} style={({ isActive }) => ({ fontWeight: isActive ? "bold" : "normal" })}>
                  {item.label}
                </NavLink>}
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="user-info">
          <p>{user?.email}</p>
          <p>{user?.profile?.username || "no username"}</p>
          <p>{user?.profile?.roles.name}</p>
          <Logout/>
      </div>

      <div classname="sidebar-footer" style={{ padding: 12, textAlign: "center", fontSize: 12, color: "#888" }}>
        <p>© {new Date().getFullYear()} School Dashboard</p>
        <p>Version 1.0</p>
      </div>
    </div>
  );
}
