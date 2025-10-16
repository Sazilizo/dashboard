import React, { useState, useEffect } from "react";
import api from "../../api/client";
import UploadFileHelper from "./UploadHelper";

export default function EditProfile({ user,onAvatarUpdated }) {
  const [form, setForm] = useState({
    email: user?.email || "",
    password: "",
    username: user?.profile?.username || "",
    avatar_url: user?.profile?.avatar_url || "",
    role_id: user?.profile?.role_id || "",
    school_id: user?.profile?.school_id || ""
  });

  const [roles, setRoles] = useState([]);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // avatar states
  const [pendingFile, setPendingFile] = useState(null);
  const [newAvatarPreview, setNewAvatarPreview] = useState(null);
  const [oldAvatarUrl, setOldAvatarUrl] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const isPrivileged = ["superuser", "admin", "hr"].includes(
    user?.profile?.roles?.name?.toLowerCase()
  );

  useEffect(() => {
    async function fetchMeta() {
      const { data: rolesData } = await api.from("roles").select("id,name");
      const { data: schoolsData } = await api.from("schools").select("id,name");
      setRoles(rolesData || []);
      setSchools(schoolsData || []);
    }
    fetchMeta();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // cache old avatar before overwriting
    setOldAvatarUrl(form.avatar_url);
    setPendingFile(file);
    setNewAvatarPreview(URL.createObjectURL(file));
    setShowConfirm(true);
  };

  if (onAvatarUpdated) {
    onAvatarUpdated();
  }

  const uploadAvatar = async (file) => {
    try {
      const url = await UploadFileHelper(file, "profile-avatars", user.id);
      if (url) {
        setForm((f) => ({ ...f, avatar_url: url }));
        setPendingFile(null);
        setNewAvatarPreview(null);
        setShowConfirm(false);
      }
    } catch (err) {
      setError("Avatar upload failed");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!isPrivileged) {
        if (form.email !== user.email) {
          const { error: emailError } = await api.auth.updateUser({
            email: form.email,
          });
          if (emailError) throw emailError;
        }
        if (form.password) {
          const { error: passError } = await api.auth.updateUser({
            password: form.password,
          });
          if (passError) throw passError;
        }
      }

      const updates = {
        username: form.username,
        avatar_url: form.avatar_url,
      };
      if (isPrivileged) {
        updates.role_id = form.role_id ? Number(form.role_id) : null;
        updates.school_id = form.school_id ? Number(form.school_id) : null;
      }

      const { error: profileError } = await api
        .from("profiles")
        .update(updates)
        .eq("id", user.id);

      if (profileError) throw profileError;

      alert("Profile updated successfully!");
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="edit-profile-container">
      <form onSubmit={handleSubmit} className="edit-profile-form">
        <label>Email:</label>
        <input
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          disabled={isPrivileged}
        />

        <label>Password:</label>
        <input
          type="password"
          name="password"
          placeholder="Leave blank to keep current password"
          value={form.password}
          onChange={handleChange}
          disabled={isPrivileged}
        />

        <label>Username:</label>
        <input name="username" value={form.username} onChange={handleChange} />

        <label>Avatar:</label>
        <input type="file" accept="image/*" onChange={handleAvatarChange} />
        <div className="avatar-preview">
          {form.avatar_url ? (
            <img
              src={form.avatar_url}
              alt="avatar"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <span>{user?.profile?.username?.[0]?.toUpperCase() || "?"}</span>
          )}
        </div>

        {isPrivileged && (
          <>
            <label>Role:</label>
            <select name="role_id" value={form.role_id} onChange={handleChange}>
              <option value="">Select role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <label>School:</label>
            <select
              name="school_id"
              value={form.school_id}
              onChange={handleChange}
            >
              <option value="">Select school</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        )}

        {error && <div className="error-message">{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </button>
      </form>

      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Replace Avatar?</h3>
            <div className="avatar-comparison">
              <div className="avatar-box">
                <p>Current</p>
                {oldAvatarUrl ? (
                  <img src={oldAvatarUrl} alt="current avatar" />
                ) : (
                  <div className="placeholder" />
                )}
              </div>
              <div className="avatar-box">
                <p>New</p>
                {newAvatarPreview && (
                  <img src={newAvatarPreview} alt="new avatar" />
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowConfirm(false)}>Cancel</button>
              <button
                className="confirm-btn"
                onClick={() => {
                  if (pendingFile) uploadAvatar(pendingFile);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
