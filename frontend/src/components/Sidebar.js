import React, { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";
import RenderIcons from "../icons/RenderIcons";

const navItems = [
  {icon:"dashboard", to: "/dashboard", label: "Dashboard" },
  {icon:"schools", to: "/dashboard/schools", label: "schools" },
  {icon:"students", to: "/dashboard/students", label: "Students" },
  {icon:"sessions", to: "/dashboard/sessions", label: "Sessions" },
  {icon:"workers", to: "/dashboard/workers", label: "Workers" },
  {icon:"trainings", to: "/dashboard/trainings/create", label: "Trainings" },
  {icon:"meals", to: "/dashboard/meals/create", label: "Create Meal"},
  {icon:"user", to: "/dashboard/workers/users", label: "Users"}
  // { to: "/dashboard/settings", label: "Settings" },
];

export default function Sidebar() {
  const { user } = useAuth();
  const notPrivileged = ["head tutor", "head coach"].includes(user?.profile?.roles.name);

  useEffect(()=>{
    console.log("user:", user)
  })
 return (
  <div className="sidebar">
    <nav>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {navItems.map(item => {
  
          if ((item.label.includes("Worker Trainings") || item.label.includes("Workers")) && notPrivileged) {
            return null; 
          }

          return (
            <li key={item.to} style={{ marginBottom: 16 }}>
              <NavLink
                to={item.to}
                style={({ isActive }) => ({ fontWeight: isActive ? "bold" : "normal" })}
              >
                {item.icon && <RenderIcons name={item.icon} label={item.label} style={{ marginRight: 8 }} />}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  </div>
  );
}
