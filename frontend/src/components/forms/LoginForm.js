// src/components/forms/LoginForm.js
import React, { useState } from "react";
import api from "../../api/client";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";
import useToast from "../../hooks/useToast";
import ToastContainer from "../ToastContainer";
import ConfirmToast from "../ConfirmToast";
import WorkerBiometrics from "../biometrics/WorkerBiometrics";
import useOfflineTable from "../../hooks/useOfflineTable";
import { generateAuthToken, storeAuthToken } from "../../utils/authTokenGenerator";

export default function LoginForm() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [showTokenDisplay, setShowTokenDisplay] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toasts, showToast, removeToast } = useToast();

  const { refreshUser } = useAuth() || {};
  const from = location.state?.from?.pathname || "/dashboard";
  const {
    addRow: addWorkerRow,
    rows: workerRows = [],
    isOnline: workersOnline,
  } = useOfflineTable("worker_attendance_records");

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
      });
      if (error) throw error;
      if (refreshUser) await refreshUser(true);

      const { data: userData, error: userError } = await api.auth.getUser();
      if (userError || !userData?.user?.id) {
        throw new Error("Unable to load user session.");
      }

      const { data: profile, error: profileError } = await api
        .from("profiles")
        .select("id, school_id, worker_id, roles:role_id(name)")
        .eq("auth_uid", userData.user.id)
        .maybeSingle();

      if (profileError || !profile?.id) {
        throw new Error("User profile not found. Please contact support.");
      }

      setUserProfile(profile);
      setShowBiometrics(true);
      setLoading(false);
      showToast("Look at the camera to continue", "info", 2500);
      return;
    } catch (err) {
      setError(err.message || "Login failed");
      setLoading(false);
    }
  };

  const recordWorkerSignIn = async (profile) => {
    if (!profile?.worker_id) return;

    const nowIso = new Date().toISOString();
    const today = nowIso.split("T")[0];

    const openLocal = Array.isArray(workerRows)
      ? workerRows.find((r) => r.worker_id === profile.worker_id && r.date === today && !r.sign_out_time)
      : null;
    if (openLocal) {
      showToast("Already signed in for today.", "info", 3000);
      return;
    }

    const payload = {
      worker_id: profile.worker_id,
      school_id: profile.school_id || null,
      date: today,
      sign_in_time: nowIso,
      sign_out_time: null,
      status: "present",
      description: "biometric sign-in",
      recorded_by: profile.id,
    };

    const res = await addWorkerRow(payload);
    if (res?.__error) {
      showToast("Sign-in cached; will sync when online.", "warning", 3500);
    } else if (!workersOnline) {
      showToast("Signed in (offline) — will sync when online.", "info", 3500);
    } else {
      showToast("Sign-in recorded.", "success", 2500);
    }
  };

  const promptNavigation = () => {
    const toastId = showToast(
      "",
      "info",
      0,
      <ConfirmToast
        message="Next action?"
        yesText="Proceed to dashboard"
        noText="Sign in (Kiosk)"
        onYes={() => {
          removeToast(toastId);
          navigate(from, { replace: true });
        }}
        onNo={() => {
          removeToast(toastId);
          navigate("/kiosk", { replace: true });
        }}
      />
    );
  };

  const promptAttendance = (profile) => {
    const toastId = showToast(
      "",
      "info",
      0,
      <ConfirmToast
        message="Record time for today?"
        yesText="Record Time"
        noText="Just log in"
        onYes={async () => {
          removeToast(toastId);
          await recordWorkerSignIn(profile);
          promptNavigation();
        }}
        onNo={() => {
          removeToast(toastId);
          promptNavigation();
        }}
      />
    );
  };

  const handleBiometricComplete = async (payload) => {
    const profile = userProfile;
    if (!profile) {
      showToast("Session expired. Please login again.", "error", 4000);
      await api.auth.signOut();
      navigate("/login", { replace: true });
      return;
    }

    setShowBiometrics(false);

    try {
      const token = generateAuthToken();
      await storeAuthToken(profile.id, token, 60);
      setAuthToken(token);
      setShowTokenDisplay(true);
    } catch (e) {
      console.warn("Failed to generate fallback auth token", e);
    }

    promptAttendance(profile);
  };

  const handleBiometricCancel = async () => {
    setShowBiometrics(false);
    showToast("Biometric verification required to continue.", "warning", 3500);
    await api.auth.signOut();
    navigate("/login", { replace: true });
  };
  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {showTokenDisplay && authToken && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, zIndex: 9999 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "20px 18px", width: "92vw", maxWidth: 420, boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}>
            <h3 style={{ marginTop: 0 }}>Backup sign-in code</h3>
            <p style={{ color: "#475569", marginTop: 4 }}>Use this on a device without a webcam. Expires in 60 minutes.</p>
            <div style={{ margin: "16px 0", padding: "14px 12px", border: "2px solid #0ea5e9", borderRadius: 10, background: "#e0f2fe", fontSize: "2rem", letterSpacing: "0.24em", textAlign: "center", fontWeight: 700 }}>
              {authToken}
            </div>
            <p style={{ color: "#0f172a", fontSize: "0.9rem", marginBottom: 16 }}>Keep this code safe. It can only be used once.</p>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setShowTokenDisplay(false)}>Got it</button>
          </div>
        </div>
      )}

      {showBiometrics && userProfile ? (
        <WorkerBiometrics
          profile={userProfile}
          requireMatch={true}
          onSuccess={(payload) => handleBiometricComplete(payload)}
          onCancel={handleBiometricCancel}
        />
      ) : (
        <div className="login-container">
          <form className="login-box login-form" onSubmit={handleSubmit} style={{ maxWidth: 400, margin: "0 auto" }}>
            <h2>Login</h2>
            <div>
              <label>Email:</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} required />
            </div>
            <div>
              <label>Password:</label>
              <input name="password" type="password" value={form.password} onChange={handleChange} required />
            </div>
            {error && <div style={{ color: "red" }}>{error}</div>}
            <button type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</button>
          </form>
        </div>
      )}
    </>
  );
}
