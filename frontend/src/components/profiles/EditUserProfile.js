import React, { useState, useEffect } from "react";
import api from "../../api/client"; // Postgres table operations

export default function EditProfile({ user }) {
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

  const isPrivileged = ["superuser","admin","hr"].includes(
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
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}.${fileExt}`;
    const { error: uploadError } = await api.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });
    if (uploadError) return setError(uploadError.message);
    const url = api.storage.from('avatars').getPublicUrl(fileName).publicUrl;
    setForm(f => ({ ...f, avatar_url: url }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Regular user: update email and password
      if (!isPrivileged) {
        if (form.email !== user.email) {
          const { error: emailError } = await api.auth.updateUser({ email: form.email });
          if (emailError) throw emailError;
        }
        if (form.password) {
          const { error: passError } = await api.auth.updateUser({ password: form.password });
          if (passError) throw passError;
        }
      }

      // Update public.profiles
      const updates = {
        username: form.username,
        avatar_url: form.avatar_url
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
    <form onSubmit={handleSubmit}>
      <label>Email:</label>
      <input
        type="email"
        name="email"
        value={form.email}
        onChange={handleChange}
        disabled={isPrivileged} // only user themselves can change
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
      {form.avatar_url && <img src={form.avatar_url} alt="avatar" width={80} height={80} />}

      {isPrivileged && (
        <>
          <label>Role:</label>
          <select name="role_id" value={form.role_id} onChange={handleChange}>
            <option value="">Select role</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <label>School:</label>
          <select name="school_id" value={form.school_id} onChange={handleChange}>
            <option value="">Select school</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </>
      )}

      {error && <div style={{ color: "red" }}>{error}</div>}
      <button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
