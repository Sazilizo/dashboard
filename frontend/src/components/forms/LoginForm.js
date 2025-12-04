// src/components/forms/LoginForm.js
import React, { useState } from "react";
import api from "../../api/client";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";
// import { preloadFaceApiModels } from "../../utils/FaceApiLoader";
import useToast from "../../hooks/useToast";
import ToastContainer from "../ToastContainer";
import ConfirmToast from "../ConfirmToast";
import { cacheUserImages } from "../../utils/proactiveImageCache";
import { generateAuthToken, storeAuthToken } from "../../utils/authTokenGenerator";

export default function LoginForm() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [recordAttendance, setRecordAttendance] = useState(false);
  const [authToken, setAuthToken] = useState(null);
  const [showTokenDisplay, setShowTokenDisplay] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { toasts, showToast, removeToast } = useToast();
  const [hasCamera, setHasCamera] = useState(true);

  const { refreshUser } = useAuth() || {};
  const from = location.state?.from?.pathname || "/dashboard";

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

      const { data: { user: authUser } } = await api.auth.getUser();
      let profile = null;
      try {
        const { data: prof } = await api
          .from("profiles")
          .select("id, school_id, worker_id, roles:role_id(name)")
          .eq("auth_uid", authUser.id)
          .maybeSingle();
        profile = prof;
      } catch {}

      if (profile?.id) {
        const roleName = profile?.roles?.name?.toLowerCase?.() || "";
        const isTestingRole = ["superuser", "admin", "hr", "viewer"].includes(roleName);
        cacheUserImages(profile.id).catch(() => {});

        if (isTestingRole) {
          navigate(from, { replace: true });
          setLoading(false);
          return;
        }

        setPendingCredentials({ email: form.email.trim(), password: form.password });

        const openBiometrics = async (profile, record) => {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter((d) => d.kind === "videoinput");
            setHasCamera(Boolean(videoDevices && videoDevices.length > 0));
          } catch (e) {
            setHasCamera(false);
          }
          setUserProfile(profile);
          setRecordAttendance(record);
          setShowBiometrics(true);
        };

        const toastId = showToast(
          "",
          "info",
          0,
          <ConfirmToast
            message="Sign in for work? This will record your time."
            yesText="Yes, Record Time"
            noText="No, Just Login"
            onYes={() => {
              removeToast(toastId);
              setLoading(false);
              openBiometrics(profile, true).then(() => showToast("Please complete biometric authentication (or continue without it).", "info", 5000));
            }}
            onNo={() => {
              removeToast(toastId);
              setLoading(false);
              openBiometrics(profile, false).then(() => showToast("Please complete biometric authentication (or continue without it).", "info", 5000));
            }}
          />
        );

        return;
      } else {
        navigate(from, { replace: true });
        setLoading(false);
      }
    } catch (err) {
      setError(err.message || "Login failed");
      setLoading(false);
    }
  };

  const handleBiometricComplete = async (entityId = null) => {
    const profileId = entityId || userProfile?.id;

    if (profileId) {
      const token = generateAuthToken();
      await storeAuthToken(profileId, token, 60);
      setAuthToken(token);
      setShowTokenDisplay(true);
      setTimeout(() => setShowTokenDisplay(false), 30000);
    }

    if (profileId && recordAttendance) {
      const nowIso = new Date().toISOString();
      const today = nowIso.split("T")[0];

      try {
        const { data: existingRows, error: existingErr } = await api
          .from("attendance_records")
          .select("id, sign_in_time, sign_out_time")
          .eq("user_id", profileId)
          .eq("date", today)
          .order("id", { ascending: false });

        if (!existingErr && Array.isArray(existingRows) && existingRows.length) {
          const open = existingRows.find((r) => !r.sign_out_time);
          if (open) {
            showToast("You are already signed in for today — no new sign-in recorded.", "info");
          } else {
            const roleName = (userProfile?.roles?.name || "").toLowerCase?.() || "";
            const payload = {
              user_id: profileId,
              school_id: userProfile?.school_id,
              date: today,
              status: "present",
              method: "biometric",
              note: "biometric sign-in",
              sign_in_time: nowIso,
            };
            if (roleName.includes("tutor") && userProfile.worker_id) payload.tutor_id = userProfile.worker_id;
            if (roleName.includes("coach") && userProfile.worker_id) payload.coach_id = userProfile.worker_id;

            try {
              await api.from("attendance_records").insert(payload);
              showToast("Sign-in successful! Time recorded.", "success");
            } catch (insErr) {
              console.warn("Work sign-in insert failed", insErr?.message || insErr);
              showToast("Attendance recording failed, but you are logged in.", "warning");
            }
          }
        } else {
          const roleName = (userProfile?.roles?.name || "").toLowerCase?.() || "";
          const payload = {
            user_id: profileId,
            school_id: userProfile?.school_id,
            date: today,
            status: "present",
            method: "biometric",
            note: "biometric sign-in",
            sign_in_time: nowIso,
          };
          if (roleName.includes("tutor") && userProfile.worker_id) payload.tutor_id = userProfile.worker_id;
          if (roleName.includes("coach") && userProfile.worker_id) payload.coach_id = userProfile.worker_id;

          try {
            await api.from("attendance_records").insert(payload);
            showToast("Sign-in successful! Time recorded.", "success");
          } catch (insErr) {
            console.warn("Work sign-in insert failed", insErr?.message || insErr);
            showToast("Attendance recording failed, but you are logged in.", "warning");
          }
        }
      } catch (err) {
        console.error("Error checking existing attendance rows:", err);
        try {
          const roleName = userProfile?.roles?.name?.toLowerCase?.() || "";
          const payload = {
            user_id: userProfile.id,
            school_id: userProfile.school_id,
            date: today,
            status: "present",
            method: "biometric",
            note: "biometric sign-in",
            sign_in_time: nowIso,
          };
          if (roleName.includes("tutor") && userProfile.worker_id) payload.tutor_id = userProfile.worker_id;
          if (roleName.includes("coach") && userProfile.worker_id) payload.coach_id = userProfile.worker_id;
          await api.from("attendance_records").insert(payload);
          showToast("Sign-in successful! Time recorded.", "success");
        } catch (insErr) {
          console.warn("Work sign-in insert failed (fallback)", insErr?.message || insErr);
          showToast("Attendance recording failed, but you are logged in.", "warning");
        }
      }
    } else if (profileId && !recordAttendance) {
      showToast("Sign-in successful! (Time not recorded)", "success");
    }

    try {
      if (pendingCredentials) {
        const { email, password } = pendingCredentials;
        const { data: signInData, error: signInError } = await api.auth.signInWithPassword({ email, password });
        if (signInError) {
          console.warn("Final sign-in after biometric failed:", signInError);
        } else {
          if (refreshUser) await refreshUser(true);
        }
      } else if (authToken && profileId) {
        try {
          await storeAuthToken(profileId, authToken, 60);
        } catch (e) {
          console.warn("Failed to persist token after biometric:", e);
        }
      }
    } catch (err) {
      console.error("Error finalizing authentication after biometric:", err);
    }

    setPendingCredentials(null);
    setShowBiometrics(false);

    setTimeout(() => navigate(from, { replace: true }), 800);
  };

  const handleBiometricCancel = () => {
    showToast("Biometric authentication required. Logging out...", "warning");
    setShowBiometrics(false);
    api.auth.signOut();
  };

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Token Display Modal */}
      {showTokenDisplay && authToken && (
        <div className="biometric-modal-overlay">
          <div className="biometric-modal" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h2>🔐 Backup Authentication Code</h2>
            <p style={{ marginBottom: '1rem', color: '#666' }}>Use this code if you need to sign in on a device without a webcam.</p>
            <div style={{ background: '#f0f9ff', border: '2px solid #0284c7', borderRadius: '8px', padding: '1.5rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', letterSpacing: '0.3em', color: '#0284c7' }}>{authToken}</div>
            </div>
            <div style={{ fontSize: '0.875rem', color: '#dc2626', marginBottom: '1rem' }}>⚠️ This code expires in 60 minutes and can only be used once.</div>
            <div style={{ fontSize: '0.875rem', color: '#059669', marginBottom: '1rem' }}>✓ Write this down - it will only be shown once</div>
            <button className="submit-btn" onClick={() => setShowTokenDisplay(false)} style={{ width: '100%' }}>Got it, Continue</button>
          </div>
        </div>
      )}

      {showBiometrics && userProfile ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 8, width: '90vw', maxWidth: 420 }}>
            <div style={{ padding: 12, textAlign: 'center' }}>
              <p style={{ marginBottom: 12 }}>Biometric component removed. You can continue without biometric authentication or cancel to return to the login screen.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={handleBiometricCancel}>Cancel</button>
                <button className="btn btn-primary" onClick={() => handleBiometricComplete()}>Continue without biometric</button>
              </div>
            </div>
          </div>
        </div>
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
