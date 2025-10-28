import React, { useState, useEffect } from "react";
import supabase from "../../api/client";
import { useSchools } from "../../context/SchoolsContext";
import { useNavigate } from "react-router-dom";
import "../../styles/registerForm.css";

export default function RegisterForm({ onSuccess, onCancel }) {
  const { schools, loading: schoolsLoading, error: schoolsError } = useSchools();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
    username: "",
    role_id: "",
    school_id: "",
  });
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch roles
  useEffect(() => {
    async function fetchRoles() {
      const { data: rolesData, error: rolesError } = await supabase
        .from("roles")
        .select("id, name")
        .order("id", { ascending: true });
      if (rolesError) return setError("Failed to load roles");
      setRoles(rolesData || []);
    }
    fetchRoles();
  }, []);

  // Privileged roles
  const privilegedRoleIds = new Set(
    roles
      .filter(r => ["admin", "superuser", "hr", "guest"].includes(r.name.toLowerCase()))
      .map(r => String(r.id))
  );

  const showSchoolSelector = !privilegedRoleIds.has(form.role_id);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1️⃣ Sign up user (auth.users)
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });
      if (signUpError) throw signUpError;

      // 2️⃣ Update metadata so trigger can populate public.profiles
      const { error: updateMetaError } = await supabase.auth.updateUser({
        data: {
          username: form.username,
          role_id: String(form.role_id),
          school_id: showSchoolSelector && form.school_id ? String(form.school_id) : null,
        },
      });
      if (updateMetaError) throw updateMetaError;

      if (onSuccess) onSuccess(signUpData.user);
      // After creating a user from the dashboard, go back to the previous page
      // instead of forcing the current user to the login screen.
      try {
        // If there is history, navigate back one step; otherwise go to dashboard as a safe fallback
        if (window?.history?.length > 1) {
          navigate(-1);
        } else {
          navigate("/dashboard");
        }
      } catch (navErr) {
        // Fallback to dashboard if navigate(-1) fails for any reason
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  if (schoolsLoading) return <div>Loading schools...</div>;
  if (schoolsError) return <div>Error loading schools: {schoolsError.message}</div>;

  return (
    <div className="register-form-container">
      <form onSubmit={handleSubmit} className="register-form">
        <h2 className="form-title">Register</h2>

        <label>Email:</label>
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          required
        />

        <label>Password:</label>
        <input
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          required
        />

        <label>Username:</label>
        <input
          name="username"
          value={form.username}
          onChange={handleChange}
          required
        />

        <label>Role:</label>
        <select
          name="role_id"
          value={form.role_id}
          onChange={handleChange}
          required
        >
          <option value="">Select role</option>
          {roles.map(r => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        {showSchoolSelector && (
          <>
            <label>School:</label>
            <select
              name="school_id"
              value={form.school_id}
              onChange={handleChange}
              required
            >
              <option value="">Select a school</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        )}

        {error && <div className="form-error">{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Registering..." : "Register"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (typeof onCancel === 'function') return onCancel();
              try {
                if (window?.history?.length > 1) {
                  navigate(-1);
                } else {
                  navigate('/dashboard');
                }
              } catch (e) {
                navigate('/dashboard');
              }
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
