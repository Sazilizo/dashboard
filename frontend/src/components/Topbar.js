import React, { useState } from "react";
import { useAuth } from "../context/AuthProvider";
import Logout from "../pages/Logout";
import EditProfile from "./profiles/EditUserProfile";
import logo from "../assets/education-bg.png";

export default function Topbar() {
  const { user } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  const toggleProfile = () => setShowProfile(prev => !prev);

  return (
    <>
      <header className="topbar">
        <div className="logo">
          <img src={logo} alt="logo" />
        </div>
        <div style={{ fontWeight: 600 }}>School Dashboard</div>
        <div className="user-info">
          <p onClick={toggleProfile} style={{ cursor: "pointer" }}>
            {user?.profile?.username || "no username"}
          </p>
          <Logout />
        </div>
      </header>

      {/* Modal overlay */}
      {showProfile && (
        <div className="modal-overlay" onClick={toggleProfile}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()} // prevent closing when clicking inside
          >
            <h2>Edit Profile</h2>
            <EditProfile user={user?.profile} />
            <button className="close-btn" onClick={toggleProfile}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
