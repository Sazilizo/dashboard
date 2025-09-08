import React, { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";
const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/dashboard/schools", label: "schools" },
  { to: "/dashboard/students", label: "Students" },
  { to: "/dashboard/sessions", label: "Sessions" },
  { to: "/dashboard/workers", label: "Workers" },
  { to: "/dashboard/trainings/create", label: "Trainings" },
  { to: "/dashboard/meals/create", label: "Create Meal"}
  // { to: "/dashboard/settings", label: "Settings" },
];

export default function Sidebar() {
  const { user } = useAuth();

  const notPrivileged = ["head tutor", "head coach"].includes(user?.profile?.roles.name);
  useEffect(() => {
    console.log("User :", user);
  }, [user]);
  return (
    <div className="sidebar">
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

      <div classname="sidebar-footer" style={{ padding: 12, textAlign: "center", fontSize: 12, color: "#888" }}>
        <p>© {new Date().getFullYear()} School Dashboard</p>
        <p>Version 1.0</p>
      </div>
    </div>
  );
}
