import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";
import RenderIcons from "../icons/RenderIcons";
import '../styles/sidebar.css'

const navItems = [
  { icon: "dashboard", to: "/dashboard", label: "Dashboard" },
  { icon: "schools", to: "/dashboard/schools", label: "Schools" },
  { icon: "students", to: "/dashboard/students", label: "Students" },
  { icon: "sessions", to: "/dashboard/sessions", label: "Sessions" },
  { icon: "workers", to: "/dashboard/workers", label: "Workers" },
  { icon: "trainings", to: "/dashboard/trainings/create", label: "Trainings" },
  { icon: "meals", to: "/dashboard/meals/create", label: "Create Meal" },
  { icon: "settings", to: "/dashboard/settings", label: "Settings", alwaysShow: true },
  { icon: "user", to: "/dashboard/workers/users", label: "Users" },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  // Robust role detection: `roles` might be a string, an object with `name`, or an array
  const extractRoleName = (roles) => {
    if (!roles) return null;
    if (typeof roles === 'string') return roles.toLowerCase();
    if (Array.isArray(roles) && roles.length) {
      const first = roles[0];
      return typeof first === 'string' ? first.toLowerCase() : (first?.name ? String(first.name).toLowerCase() : null);
    }
    if (typeof roles === 'object') {
      if (roles.name) return String(roles.name).toLowerCase();
      // fallback: if roles has keys, return the first key
      const keys = Object.keys(roles);
      if (keys.length) return String(keys[0]).toLowerCase();
    }
    return null;
  };

  const roleName = extractRoleName(user?.profile?.roles);

  const isAdmin = roleName && (roleName.includes('admin') || roleName.includes('superuser'));
  const isHeadTutor = roleName && (roleName === 'head tutor');
  const isHeadCoach = roleName && (roleName === 'headcoach');
  const isTutor = roleName && roleName.includes('tutor') && !roleName.includes('head');
  const isCoach = roleName && roleName.includes('coach') && !roleName.includes('head');

  // Users who should NOT see worker/user management links:
  const hideWorkersAndUsers = !(isAdmin || isHeadTutor || isHeadCoach);

  useEffect(()=>{
    console.log("user:", user);
    console.log("roleName:", roleName, "hideWorkersAndUsers:", hideWorkersAndUsers);
  },[user, roleName, hideWorkersAndUsers])

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

              // Always show items explicitly flagged `alwaysShow` (e.g. Settings)
              if (item.alwaysShow) {
                // render unconditionally
              } else {
                // Hide Workers/Users for low-privilege users; allow head tutors/coaches/admins
                if ((item.label.includes("Workers") || item.label.includes("Worker Trainings")) && hideWorkersAndUsers) {
                  return null;
                }
                if (item.label.includes("Users") && hideWorkersAndUsers) {
                  return null;
                }
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