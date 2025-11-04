import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";
import RenderIcons from "../icons/RenderIcons";
import '../styles/sidebar.css'

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
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const notPrivileged = ["head tutor", "head coach"].includes(user?.profile?.roles.name);

  useEffect(()=>{
    console.log("user:", user);
    console.log("notPrivileged:", notPrivileged);
  },[user, notPrivileged])

  return (
    <>

  {/* Overlay - render only when open so it won't interfere with bottom nav behavior */}
  {open && <div className={`sidebar-overlay show`} onClick={() => setOpen(false)} />}
    {/* Toggle button for mobile */}
      <button
        aria-label={open ? "Close menu" : "Open menu"}
        className="sidebar-toggle"
        onClick={() => setOpen((s) => !s)}
      >
        {open ? '✕' : '☰'}
      </button>

      <div className={`sidebar ${open ? 'mobile-open' : 'mobile-closed'}`}>
        <nav>
          <ul style={{ listStyle: "none", padding: 0, width: '100%' }}>
            {navItems.map(item => {

              if ((item.label.includes("Worker Trainings") || item.label.includes("Workers")) && notPrivileged) {
                return null; 
              }
              if (item.label.includes("Users") && notPrivileged) {
                return null; 
              }

              return (
                <li key={item.to} style={{ marginBottom: 12, width: '100%' }}>
                  <NavLink
                    to={item.to}
                    style={({ isActive }) => ({ fontWeight: isActive ? "bold" : "normal", display: 'flex', alignItems: 'center' })}
                    onClick={() => setOpen(false)}
                  >
                    {item.icon && <RenderIcons name={item.icon} label={item.label} style={{ marginRight: 12 }} />}
                    <span className="nav-label" style={{ fontSize: 14 }}>{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}