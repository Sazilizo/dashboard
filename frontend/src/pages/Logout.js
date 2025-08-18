import React from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

const LogoutButton = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      // Supabase sign out
      const { error } = await api.auth.signOut();
      if (error) throw error;

      // Optional: clear any app-specific storage
      localStorage.clear();

      // Navigate to login page
      navigate("/login");
    } catch (err) {
      console.error("Logout error:", err);
      // Navigate anyway, fallback
      navigate("/login");
    }
  };

  return (
    <button
      onClick={handleLogout}
      className="logout-button btn danger"
    >
      Logout
    </button>
  );
};

export default LogoutButton;
