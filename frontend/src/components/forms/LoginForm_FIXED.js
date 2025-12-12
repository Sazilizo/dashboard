// src/components/forms/LoginForm.js
import React, { useState } from "react";
import api from "../../api/client";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";
import useToast from "../../hooks/useToast";
import ToastContainer from "../ToastContainer";
import ConfirmToast from "../ConfirmToast";
import { cacheUserImages } from "../../utils/proactiveImageCache";
import { generateAuthToken, storeAuthToken } from "../../utils/authTokenGenerator";
import useOfflineTable from "../../hooks/useOfflineTable";
import WorkerBiometrics from "../biometrics/WorkerBiometrics";

export default function LoginForm() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [recordAttendance, setRecordAttendance] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [showTokenDisplay, setShowTokenDisplay] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { toasts, showToast, removeToast } = useToast();

  const overlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    zIndex: 9998,
  };

  const tokenModalStyle = {
    maxWidth: "400px",
    width: "92vw",
    textAlign: "center",
    background: "#fff",
    borderRadius: 12,
    padding: "20px 18px",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const {
    addRow: addWorkerRow,
    rows: workerRows = [],
    isOnline: workersOnline,
  } = useOfflineTable("worker_attendance_records");

  const { refreshUser } = useAuth() || {};
  const from = location.state?.from?.pathname || "/dashboard";

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const recordWorkerSignIn = async (workerId, schoolId) => {
    if (!workerId) return;

    const nowIso = new Date().toISOString();
    const today = nowIso.split("T")[0];

    const openLocal = Array.isArray(workerRows)
      ? workerRows.find((r) => r.worker_id === workerId && r.date === today && !r.sign_out_time)
      : null;

    if (openLocal) {
      showToast("You are already signed in for today.", "info");
      return;
    }

    let openRemote = false;
    if (navigator.onLine) {
      try {
        const { data: existingRows, error: existingErr } = await api
          .from("worker_attendance_records")
          .select("id, sign_in_time, sign_out_time")
          .eq("worker_id", workerId)
          .eq("date", today)
          .order("id", { ascending: false })
          .limit(1);
        if (!existingErr && Array.isArray(existingRows) && existingRows.some((r) => !r.sign_out_time)) {
          openRemote = true;
        }
      } catch (e) {
        /* ignore network errors; fall back to offline cache */
      }
    }

    if (openRemote) {
      showToast("You are already signed in for today.", "info");
      return;
    }

    const payload = {
      worker_id: workerId,
      school_id: schoolId || null,
      date: today,
      sign_in_time: nowIso,
      description: "biometric sign-in",
      recorded_by: authUser?.id || null,
    };

    const res = await addWorkerRow(payload);
    if (res?.__error) {
      showToast("Sign-in cached offline; will sync when online.", "warning");
    } else {
      showToast(workersOnline ? "Sign-in recorded." : "Sign-in cached offline.", workersOnline ? "success" : "info");
    }
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
      setAuthUser(authUser);
      console.log(`[LoginForm] Auth user: id=${authUser.id}, email=${authUser.email}`);

      let profile = null;
      try {
        const { data: prof } = await api
          .from("profiles")
          .select("id, school_id, worker_id, roles:role_id(name)")
          .eq("auth_uid", authUser.id)
          .maybeSingle();
        profile = prof;
        console.log(`[LoginForm] Profile fetch: id=${profile?.id}, role=${profile?.roles?.name}, worker_id=${profile?.worker_id}`);
      } catch (err) {
        console.error(`[LoginForm] Profile fetch error:`, err);
        throw new Error("Failed to load user profile. Please try again.");
      }

      if (!profile?.id) {
        console.error(`[LoginForm] No profile found for auth_uid=${authUser.id}`);
        throw new Error("User profile not found. Please contact support.");
      }

      // ALWAYS require biometrics except for guest/viewer
      const roleName = profile?.roles?.name?.toLowerCase?.() || "";
      const skipBiometrics = ["guest", "viewer"].includes(roleName);
      console.log(`[LoginForm] Role check: roleName="${roleName}", skipBiometrics=${skipBiometrics}`);

      cacheUserImages(profile.id).catch(() => {});

      if (skipBiometrics) {
        console.log(`[LoginForm] Bypassing biometrics for guest/viewer role`);
        navigate(from, { replace: true });
        setLoading(false);
        return;
      }

      // Require biometrics for all other users
      console.log(`[LoginForm] Enforcing biometrics for profile.id=${profile.id}, worker_id=${profile.worker_id}`);
      setPendingCredentials({ email: form.email.trim(), password: form.password });
      setUserProfile(profile);
      setRecordAttendance(null);
      setShowBiometrics(true);
      setLoading(false);
      showToast("Look at the camera to continue.", "info", 4000);
      return;
    } catch (err) {
      console.error(`[LoginForm] Login error:`, err);
      setError(err.message || "Login failed");
      setLoading(false);
    }
  };

  const finalizeLogin = async (profileId, workerId, shouldRecord) => {
    if (shouldRecord && workerId) {
      await recordWorkerSignIn(workerId, userProfile?.school_id);
    } else if (profileId && shouldRecord && !workerId) {
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
    } else if (profileId && !shouldRecord) {
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

  const handleBiometricComplete = async (entityId = null, meta = {}) => {
    const profileId = entityId || userProfile?.id;
    const workerId = meta?.workerId || userProfile?.worker_id || null;

    if (profileId) {
      const token = generateAuthToken();
      await storeAuthToken(profileId, token, 60);
      setAuthToken(token);
      setShowTokenDisplay(true);
      setTimeout(() => setShowTokenDisplay(false), 30000);
    }

    const proceed = (choice) => {
      setRecordAttendance(choice);
      finalizeLogin(profileId, workerId, choice);
    };

    if (recordAttendance === null) {
      const toastId = showToast(
        "",
        "info",
        0,
        <ConfirmToast
          message="Record your time for today?"
          yesText="Yes, Record Time"
          noText="No, Just Sign In"
          onYes={() => {
            removeToast(toastId);
            proceed(true);
          }}
          onNo={() => {
            removeToast(toastId);
            proceed(false);
          }}
        />
      );
      return;
    }

    finalizeLogin(profileId, workerId, recordAttendance);
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
        <div className="biometric-modal-overlay" style={overlayStyle}>
          <div className="biometric-modal" style={tokenModalStyle}>
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
        <WorkerBiometrics
          profile={userProfile}
          requireMatch={true}
          onSuccess={(payload) =>
            handleBiometricComplete(payload?.profileId || userProfile.id, payload)
          }
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
