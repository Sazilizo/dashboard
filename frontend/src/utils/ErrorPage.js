// src/components/ErrorPage.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import "./ErrorPage.css";

export default function ErrorPage({ error }) {
  const navigate = useNavigate();

  const status = error?.status || "Error";
  const message = error?.message || "Something went wrong.";

  return (
    <div className="error-container">
      <div className="error-box">
        <h1 className="error-code">{status}</h1>
        <p className="error-message">{message}</p>
        <div className="error-actions">
          <button className="btn" onClick={() => navigate(-1)}>
            ⬅ Go Back
          </button>
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            🏠 Home
          </button>
        </div>
      </div>
    </div>
  );
}
