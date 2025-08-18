import React, { useState, useEffect } from "react";
import supabase from "../../api/client"; // Your supabase client
import { useSchools } from "../../context/SchoolsContext";
import { useNavigate } from "react-router-dom";

export default function RegisterForm({ onSuccess }) {
  const { schools, loading: schoolsLoading, error: schoolsError } = useSchools();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
    email: "",
    username:"",
    role_id: "",   // will hold numeric role id as string
    school_id: "", // will hold numeric school id as string
  });
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchRoles() {
      try {
        const { data: rolesData, error: rolesError } = await supabase
          .from("roles")
          .select("id, name")
          .order("id", { ascending: true });
        if (rolesError) throw rolesError;
        setRoles(rolesData || []);
      } catch (err) {
        setError("Failed to load roles");
      }
    }
    fetchRoles();
  }, []);

  // Set of privileged role IDs that don't require school assignment
  const privilegedRoleIds = new Set(
    roles
      .filter((r) =>
        ["admin", "superuser", "hr", "guest"].includes(r.name.toLowerCase())
      )
      .map((r) => String(r.id))
  );

  const showSchoolSelector = !privilegedRoleIds.has(form.role_id);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Sign up user with Supabase Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });
      if (signUpError) throw signUpError;

      // Insert user profile into users table
      const { error: profileError } = await supabase.from("users").insert({
        auth_uid: signUpData.user.id,
        email: form.email,
        username: form.username,
        role_id: Number(form.role_id),
        school_id: showSchoolSelector && form.school_id ? Number(form.school_id) : null,
      });

      if (profileError) throw profileError;

      if (onSuccess){
        onSuccess(signUpData.user);
        navigate("/login")
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
    <form onSubmit={handleSubmit} style={{ maxWidth: 400, margin: "0 auto" }}>
      <h2>Register</h2>

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
        {roles.map((r) => (
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
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </>
      )}

      {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}

      <button type="submit" disabled={loading} style={{ marginTop: 12 }}>
        {loading ? "Registering..." : "Register"}
      </button>
    </form>
  );
}
