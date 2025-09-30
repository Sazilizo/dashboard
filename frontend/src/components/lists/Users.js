import React, { useState, useEffect } from "react";
import api from "../../api/client";
import EditProfile from "../profiles/EditUserProfile";
import { useAuth } from "../../context/AuthProvider";
import "../../styles/Users.css"
import RegisterForm from "../forms/RegisterForm";
import { Link } from "react-router-dom";

export default function Users() {

  const {user} = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [filteredProfiles, setFilteredProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const USERS_PER_PAGE = 10;

  const isPrivileged = user?.profile?.roles?.name &&
    ["superuser", "admin", "hr"].includes(user.profile.roles.name.toLowerCase());

  // Fetch roles
  useEffect(() => {
    async function fetchRoles() {
      const { data, error } = await api.from("roles").select("id,name");
      if (error) return setError(error.message);
      setRoles(data || []);
    }
    fetchRoles();
  }, []);


  // Fetch profiles
  useEffect(() => {
    // if (!isPrivileged) return;
    async function fetchProfiles() {
      setLoading(true);
      const { data, error } = await api
        .from("profiles")
        .select(`
          id,
          auth_uid,
          email,
          avatar_url,
          role_id,
          roles(id,name),
          school_id,
          schools(id,name)
        `)
        .order("username", { ascending: true });

      if (error) setError(error.message);
      else setProfiles(data);
      setLoading(false);
    }
    fetchProfiles();
  }, [isPrivileged]);

  // Filter by role
  useEffect(() => {
    let filtered = profiles;
    console.log(profiles)
    if (roleFilter) {
      filtered = profiles.filter(p => p.profiles?.roles.name === roleFilter);
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
  if (loading) return <div>Loading users...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="users-container">
      <div className="register-user">
        <Link className="btn btn-primary" to="/register">Create new user</Link>
      </div>
      <h2>Users</h2>

      {/* Role filter */}
      <div className="filter-container">
        <label>Filter by role:</label>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {roles.map(r => (
            <option key={r.id} value={r.name}>{r.name}</option>
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
          {displayedProfiles.map(profile => (
            <tr key={profile.id}>
              <td>{profile.email}</td>
              <td>{profile.username}</td>
              <td>{profile.roles?.name || "-"}</td>
              <td>{profile.schools?.name || "-"}</td>
              <td>
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" width={50} height={50} />
                ) : "-"}
              </td>
              <td>
                <button onClick={() => setEditingUser(profile)}>Edit</button>
              </td>
            </tr>
          ))}
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
          <span>Page {currentPage} of {totalPages}</span>
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
        <div
          className="modal-overlay"
          onClick={() => setEditingUser(null)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setEditingUser(null)}>✖</button>
            <h3>Edit User: {editingUser.username}</h3>
            <EditProfile user={editingUser} />
          </div>
        </div>
      )}
    </div>
  );
}
