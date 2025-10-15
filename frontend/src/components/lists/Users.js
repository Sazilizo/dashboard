import React, { useState, useEffect, useCallback } from "react";
import api from "../../api/client";
import EditProfile from "../profiles/EditUserProfile";
import { useAuth } from "../../context/AuthProvider";
import "../../styles/Users.css";
import { Link } from "react-router-dom";
import useOfflineTable from "../../hooks/useOfflineTable";
import useOnlineStatus from "../../hooks/useOnlineStatus";

export default function Users() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [filteredProfiles, setFilteredProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const USERS_PER_PAGE = 10;

  const { isOnline } = useOnlineStatus();

  // Use offline table for profiles and roles
  const profilesSelect = `
            id,
            auth_uid,
            username,
            email,
            avatar_url,
            role_id,
            roles(id,name),
            school_id,
            schools(id,name)
          `;
  const { rows: profileRows, loading: profilesLoading, error: profilesError } = useOfflineTable(
    "profiles",
    {},
    profilesSelect,
    1000,
    "username",
    "asc"
  );

  const { rows: roleRows } = useOfflineTable("roles", {}, "id,name", 1000, "id", "asc");

  const isPrivileged =
    user?.profile?.roles?.name &&
    ["superuser", "admin", "hr"].includes(
      user.profile.roles.name.toLowerCase()
    );

  // Helper: generate signed URL for avatar (only when online)
  const getAvatarUrl = useCallback(async (path) => {
    if (!path) return null;
    if (!isOnline) return null;
    try {
      const { data: urlData, error: urlError } = await api.storage
        .from("profile-avatars")
        .createSignedUrl(path, 60 * 60); // 1 hour
      if (urlError) return null;
      return urlData?.signedUrl || null;
    } catch (err) {
      console.error("Error generating signed URL:", err);
      return null;
    }
  }, [isOnline]);

  // populate roles from offline table rows
  useEffect(() => {
    setRoles(roleRows || []);
  }, [roleRows]);

  // populate profiles from offline table rows and add signed urls when online
  useEffect(() => {
    async function applyProfiles() {
      setLoading(true);
      try {
        const rows = profileRows || [];
        if (!isPrivileged) {
          setProfiles([]);
          setLoading(false);
          return;
        }

        if (isOnline) {
          const profilesWithAvatars = await Promise.all(
            (rows || []).map(async (p) => {
              const avatarPath = p.avatar_url;
              const signedUrl = await getAvatarUrl(avatarPath);
              return { ...p, avatar_url_signed: signedUrl || null };
            })
          );
          setProfiles(profilesWithAvatars);
        } else {
          // offline: use cached rows directly
          setProfiles(rows.map((p) => ({ ...p, avatar_url_signed: null })));
        }
      } catch (err) {
        setError(err.message || String(err));
      }
      setLoading(false);
    }

    applyProfiles();
  }, [profileRows, isPrivileged, isOnline, getAvatarUrl]);

  // Filter by role
  useEffect(() => {
    let filtered = profiles;
    if (roleFilter) {
      filtered = profiles.filter(
        (p) => p.roles?.name?.toLowerCase() === roleFilter.toLowerCase()
      );
    }
    setFilteredProfiles(filtered);
    setCurrentPage(1);
  }, [roleFilter, profiles]);

  // Pagination
  const totalPages = Math.ceil(filteredProfiles.length / USERS_PER_PAGE);
  const displayedProfiles = filteredProfiles.slice(
    (currentPage - 1) * USERS_PER_PAGE,
    currentPage * USERS_PER_PAGE
  );

  if (!isPrivileged) return <div>Access denied</div>;
  if (loading || profilesLoading) return <div>Loading users...</div>;
  if (error || profilesError) return <div>Error: {error || profilesError?.message || String(profilesError)}</div>;

  return (
    <div className="users-container">
      <div className="register-user">
        <Link className="btn btn-primary" to="/register">
          Create new user
        </Link>
      </div>
      <h2>Users</h2>

      {/* Role filter */}
      <div className="filter-container">
        <label>Filter by role:</label>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <table className="users-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Username</th>
            <th>Role</th>
            <th>School</th>
            <th>Avatar</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayedProfiles.length === 0 ? (
            <tr>
              <td colSpan="6" className="no-results">
                No profiles found.
              </td>
            </tr>
          ) : (
            displayedProfiles.map((profile) => (
              <tr key={profile.id}>
                <td>{profile.email || "—"}</td>
                <td>{profile.username || "—"}</td>
                <td>{profile.roles?.name || "—"}</td>
                <td>{profile.schools?.name || "—"}</td>
                <td>
                  {profile.avatar_url_signed ? (
                    <img
                      src={profile.avatar_url_signed}
                      alt={profile.username || "User avatar"}
                      width={50}
                      height={50}
                      style={{ borderRadius: "50%", objectFit: "cover" }}
                      onError={(e) => {
                        e.target.src =
                          "https://via.placeholder.com/50x50/cccccc/000000?text=?";
                      }}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <button onClick={() => setEditingUser(profile)}>Edit</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setEditingUser(null)}
            >
              ✖
            </button>
            <h3>Edit User: {editingUser.username}</h3>
            <EditProfile user={editingUser} />
          </div>
        </div>
      )}
    </div>
  );
}
