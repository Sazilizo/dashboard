import React, { useState, useEffect, useCallback } from "react";
import api from "../../api/client";
import EditProfile from "../profiles/EditUserProfile";
import { useAuth } from "../../context/AuthProvider";
import Loader from "../widgets/Loader";
import "../../styles/Users.css";
import { Link } from "react-router-dom";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import { cacheTable, getTable } from "../../utils/tableCache";

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

  const isPrivileged =
    user?.profile?.roles?.name &&
    ["superuser", "admin", "hr"].includes(
      user.profile.roles.name.toLowerCase()
    );

  // Fetch all profiles - directly from API when online, from cache when offline
  useEffect(() => {
    if (!isPrivileged) {
      setProfiles([]);
      setLoading(false);
      return;
    }

    async function fetchProfiles() {
      setLoading(true);
      setError("");
      
      try {
        if (isOnline) {
          console.log('[Users] Fetching all profiles from server...');
          
          // Fetch directly from Supabase (bypassing offlineClient to avoid cache-first)
          const { data, error: fetchError } = await api
            .from("profiles")
            .select(profilesSelect);
          
          if (fetchError) {
            console.error('[Users] Failed to fetch profiles:', fetchError);
            throw fetchError;
          }

          console.log(`[Users] ✓ Fetched ${data?.length || 0} profiles from server`);
          
          // Cache the results for offline use
          if (data && data.length > 0) {
            await cacheTable("profiles", data);
            console.log(`[Users] ✓ Cached ${data.length} profiles`);
          }
          
          // Set profiles directly
          const profilesWithAvatars = await Promise.all(
            (data || []).map(async (p) => {
              const avatarPath = p.avatar_url;
              const signedUrl = avatarPath ? await getAvatarUrl(avatarPath) : null;
              return { ...p, avatar_url_signed: signedUrl || null };
            })
          );
          
          setProfiles(profilesWithAvatars);
          console.log(`[Users] ✓ Set ${profilesWithAvatars.length} profiles with avatars`);
          
        } else {
          // Offline: load from cache
          console.log('[Users] Offline - loading profiles from cache...');
          const cachedProfiles = await getTable("profiles");
          
          if (cachedProfiles && cachedProfiles.length > 0) {
            console.log(`[Users] ✓ Loaded ${cachedProfiles.length} profiles from cache`);
            setProfiles(cachedProfiles.map((p) => ({ ...p, avatar_url_signed: null })));
          } else {
            console.warn('[Users] No cached profiles found');
            setProfiles([]);
          }
        }
      } catch (err) {
        console.error('[Users] Error fetching profiles:', err);
        setError(err.message || String(err));
        
        // Try to load from cache as fallback
        try {
          const cachedProfiles = await getTable("profiles");
          if (cachedProfiles && cachedProfiles.length > 0) {
            console.log(`[Users] Fallback: Loaded ${cachedProfiles.length} profiles from cache`);
            setProfiles(cachedProfiles.map((p) => ({ ...p, avatar_url_signed: null })));
          }
        } catch (cacheErr) {
          console.error('[Users] Cache fallback also failed:', cacheErr);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchProfiles();
  }, [isOnline, isPrivileged, profilesSelect]);

  // Fetch roles for filter
  useEffect(() => {
    async function fetchRoles() {
      try {
        if (isOnline) {
          const { data } = await api.from("roles").select("id,name");
          if (data) {
            setRoles(data);
            await cacheTable("roles", data);
          }
        } else {
          const cachedRoles = await getTable("roles");
          if (cachedRoles) setRoles(cachedRoles);
        }
      } catch (err) {
        console.error('[Users] Error fetching roles:', err);
      }
    }
    
    fetchRoles();
  }, [isOnline]);

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
  if (loading) return <Loader variant="dots" size="large" text="Loading users..." />;
  if (error) return <div>Error: {error}</div>;

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
