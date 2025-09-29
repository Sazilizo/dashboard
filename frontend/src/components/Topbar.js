import React, { useState } from "react";
import { useAuth } from "../context/AuthProvider";
import Logout from "../pages/Logout";
import EditProfile from "./profiles/EditUserProfile";
import logo from "../assets/education-bg.png";
// import "./Topbar.css"; // external CSS

export default function Topbar() {
  const { user } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const toggleProfile = () => setShowProfile(prev => !prev);
  const toggleDropdown = () => setDropdownOpen(prev => !prev);

  const avatarUrl = user?.profile?.avatar_url || "";

  return (
    <>
      <header className="topbar">
        <div className="logo">
          <img src={logo} alt="logo" />
        </div>
        <div style={{ fontWeight: 600 }}>School Dashboard</div>
        <div className="user-info">
          <div className="avatar-wrapper" onClick={toggleDropdown}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="avatar"
                className="profile-image"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            ) : (
              <div className="profile-image fallback">
                {user?.profile?.username?.[0]?.toUpperCase() || "?"}
              </div>
            )}
            <span className="dropdown-arrow">&#9662;</span>
          </div>

          {dropdownOpen && (
            <div className="dropdown-menu">
              <button
                className="dropdown-item"
                onClick={() => {
                  toggleProfile();
                  setDropdownOpen(false);
                }}
              >
                Profile
              </button>
              <Logout />
            </div>
          )}
        </div>
      </header>

      {/* Modal overlay */}
      {showProfile && (
        <div className="modal-overlay" onClick={toggleProfile}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
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
