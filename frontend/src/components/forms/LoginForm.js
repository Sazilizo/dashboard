// src/components/LoginForm.js
import React, { useState } from "react";
import api from "../../api/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";  // import your auth context hook
import "../../styles/LoginPage.css";
import { preloadFaceApiModels } from "../../utils/FaceApiLoader";

export default function LoginForm() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { refreshUser } = useAuth() || {};  // get refreshUser method from context

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

      try {
        const { data, error } = await api.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        })

        if (error) throw error;

        if (refreshUser) {
          await refreshUser();
        }
        await preloadFaceApiModels();

        navigate("/dashboard");
      } catch (err) {
        setError(err.message || "Login failed");
      } finally {
        setLoading(false);
      }
    }

  return (
    <div className="login-container">
      <form
        className="login-box login-form"
        onSubmit={handleSubmit}
        style={{ maxWidth: 400, margin: "0 auto" }}
      >
        <h2>Login</h2>

        <div>
          <label>Email:</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Password:</label>
          <input
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            required
          />
        </div>

        {error && <div style={{ color: "red" }}>{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
