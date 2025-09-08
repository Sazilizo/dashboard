import React from "react";
import { useAuth } from "../context/AuthProvider";
import Logout from "../pages/Logout";
import logo from "../assets/education-bg.png"

export default function Topbar() {
  const {user} = useAuth();

  return (
    <header className="topbar">
      <div className="logo">
        {/* <img src={logo}  alt="logo"/> */}
      </div>
      <div style={{ fontWeight: 600 }}>School Dashboard</div>
      {/* Add user info, school switcher, notifications here */}
      <div className="user-info">
          <p>{user?.profile?.username || "no username"}</p>
          <Logout/>
      </div>
    </header>
  );
}
