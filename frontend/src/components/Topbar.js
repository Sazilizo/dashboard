import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthProvider";
import Logout from "../pages/Logout";
import EditProfile from "./profiles/EditUserProfile";
import logo from "../assets/education-bg.png";
import api from "../api/client";
import useOnlineStatus from "../hooks/useOnlineStatus";
import imageCache from "../utils/imageCache";

import { getSignedUrl } from "../utils/signedUrlCache";

export default function Topbar() {
  const { user } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const toggleProfile = () => setShowProfile((prev) => !prev);
  const toggleDropdown = () => setDropdownOpen((prev) => !prev);
  const { isOnline } = useOnlineStatus();

  const fetchAvatar = useCallback(async () => {
    if (!user?.profile?.id) {
      // No user yet - ensure we do not stay stuck in loading state
      setAvatarUrl("");
      setLoading(false);
      return;
    }
    if (!isOnline) {
      // don't try network requests when offline; treat as no avatar
      setAvatarUrl("");
      setLoading(false);
      return;
    }
    setLoading(true);

    const userId = user.profile.id;
    const extensions = ["jpg", "jpeg", "png", "webp"];

    try {
      for (const ext of extensions) {
        const fileName = `${userId}.${ext}`;

        // Check persistent image cache first
        try {
          const cached = await imageCache.getCachedImage('profile-avatars', fileName);
          if (cached) {
            const obj = URL.createObjectURL(cached);
            setAvatarUrl(obj);
            setLoading(false);
            return;
          }
        } catch (e) {
          if (DEBUG) console.warn('[Topbar] imageCache.getCachedImage failed', e);
        }

        // Not cached - request a signed URL and download the blob, then cache it
        const signedUrl = await getSignedUrl('profile-avatars', fileName, 60);
        if (!signedUrl) continue;
        try {
          const res = await fetch(signedUrl);
          if (res.ok) {
            const blob = await res.blob();
            try {
              await imageCache.cacheImage('profile-avatars', fileName, blob, userId, { source: 'avatar' });
            } catch (e) {
              if (DEBUG) console.warn('[Topbar] Failed to cache avatar blob', e);
            }
            const obj = URL.createObjectURL(blob);
            setAvatarUrl(obj);
            setLoading(false);
            return;
          }
        } catch (headErr) {
          if (DEBUG) console.warn('[Topbar] avatar fetch failed for', signedUrl, headErr);
          continue;
        }
      }
    } catch (err) {
      console.error("Failed to fetch avatar:", err);
    }

    setAvatarUrl("");
    setLoading(false);
  }, [user?.profile?.id, isOnline]);

  useEffect(() => {
    fetchAvatar();
  }, [fetchAvatar]);

  useEffect(() => {console.log('User changed:', user);}, [user]);
  return (
    <>
      <header className="topbar">
        <div className="logo">
          <img src={logo} alt="logo" />
        </div>
        <div style={{ fontWeight: 600 }}>School Dashboard</div>
        <div className="user-info">
          <div className="avatar-wrapper" onClick={toggleDropdown}>
            {loading ? (
              <div className="profile-image fallback animate-pulse bg-gray-300" />
            ) : avatarUrl ? (
              <img
                src={avatarUrl}
                alt="avatar"
                className="profile-image"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  setAvatarUrl(""); 
                }}
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
      {showProfile && (
        <div className="modal-overlay" onClick={toggleProfile}>
          <div
            className="modal-content edit-profile-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Edit Profile</h2>
            <EditProfile user={user?.profile} onAvatarUpdated={fetchAvatar} />
            <button className="close-btn" onClick={toggleProfile}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
