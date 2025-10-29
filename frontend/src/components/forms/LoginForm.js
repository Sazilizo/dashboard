// src/components/LoginForm.js
import React, { useState } from "react";
import api from "../../api/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";  // import your auth context hook
import "../../styles/LoginPage.css";
import { preloadFaceApiModels } from "../../utils/FaceApiLoader";
import BiometricsSignIn from "./BiometricsSignIn";
import useToast from "../../hooks/useToast";
import ToastContainer from "../ToastContainer";
import ConfirmToast from "../ConfirmToast";
import { cacheUserImages } from "../../utils/proactiveImageCache";

export default function LoginForm() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [recordAttendance, setRecordAttendance] = useState(false);
  const navigate = useNavigate();
  const { toasts, showToast, removeToast } = useToast();

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
          await refreshUser(true);
        }
        await preloadFaceApiModels();

        // Get current user and profile
        const { data: { user: authUser } } = await api.auth.getUser();
        let profile = null;
        try {
          const { data: prof } = await api
            .from('profiles')
            .select("id, school_id, worker_id, roles:role_id(name)")
            .eq('auth_uid', authUser.id)
            .maybeSingle();
          profile = prof;
        } catch {}

        if (profile?.id) {
          const today = new Date().toISOString().split('T')[0];
          const roleName = profile?.roles?.name?.toLowerCase?.() || '';
          const isTestingRole = ['superuser', 'admin', 'hr', 'viewer'].includes(roleName);
          
          // Cache user's images for offline biometric auth
          cacheUserImages(profile.id).catch(err => {
            console.warn("Failed to cache user images:", err);
          });
          
          // Check if user already has an open work session for today (skip for testing roles)
          let hasOpenSession = false;
          if (!isTestingRole) {
            try {
              const { data: openRows } = await api
                .from('attendance_records')
                .select('id, sign_in_time')
                .eq('user_id', profile.id)
                .eq('date', today);
              
              // Filter for null sign_out_time in JavaScript
              const openSession = openRows?.filter(row => !row.sign_out_time)?.[0];
              
              if (openSession) {
                hasOpenSession = true;
                console.log('User already has an open work session for today - skipping biometric sign-in');
                showToast('Welcome back! Your work session is already active.', 'success');
                navigate("/dashboard");
                setLoading(false);
                return;
              }
            } catch {}
          }

          // Prompt user: Record work time? (using toast with buttons)
          const toastId = showToast(
            '',
            'info',
            0, // No auto-dismiss
            <ConfirmToast
              message="Sign in for work? This will record your time."
              yesText="Yes, Record Time"
              noText="No, Just Login"
              onYes={() => {
                removeToast(toastId);
                setRecordAttendance(true);
                setUserProfile(profile);
                setShowBiometrics(true);
                setLoading(false);
                showToast('Please complete biometric authentication to record your time.', 'info', 5000);
              }}
              onNo={() => {
                removeToast(toastId);
                setRecordAttendance(false);
                setUserProfile(profile);
                setShowBiometrics(true);
                setLoading(false);
                showToast('Please complete biometric authentication (time will not be recorded).', 'info', 5000);
              }}
            />
          );
          
          return; // Wait for user choice
        } else {
          // No profile found, just navigate
          navigate("/dashboard");
          setLoading(false);
        }
      } catch (err) {
        setError(err.message || "Login failed");
        setLoading(false);
      }
    }

  const handleBiometricComplete = async () => {
    // Biometric authentication successful - record attendance if user confirmed
    if (userProfile?.id && recordAttendance) {
      const nowIso = new Date().toISOString();
      const today = nowIso.split('T')[0];
      const roleName = userProfile?.roles?.name?.toLowerCase?.() || '';
      
      const payload = {
        user_id: userProfile.id,
        school_id: userProfile.school_id,
        date: today,
        status: 'present',
        method: 'biometric',
        note: 'biometric sign-in',
        sign_in_time: nowIso,
      };
      
      if (roleName.includes('tutor') && userProfile.worker_id) payload.tutor_id = userProfile.worker_id;
      if (roleName.includes('coach') && userProfile.worker_id) payload.coach_id = userProfile.worker_id;

      try {
        await api.from('attendance_records').insert(payload);
        showToast('Sign-in successful! Time recorded.', 'success');
      } catch (insErr) {
        console.warn('Work sign-in insert failed', insErr?.message || insErr);
        showToast('Attendance recording failed, but you are logged in.', 'warning');
      }
    } else if (userProfile?.id && !recordAttendance) {
      showToast('Sign-in successful! (Time not recorded)', 'success');
    }
    
    setShowBiometrics(false);
    navigate("/dashboard");
  };

  const handleBiometricCancel = () => {
    // User cancelled biometric - sign them out
    showToast('Biometric authentication required. Logging out...', 'warning');
    setShowBiometrics(false);
    api.auth.signOut();
  };

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {showBiometrics && userProfile ? (
        <div className="biometric-modal-overlay">
          <div className="biometric-modal">
            <div className="biometric-modal-header">
              <h2>Biometric Authentication Required</h2>
              <button 
                className="close-btn" 
                onClick={handleBiometricCancel}
                title="Cancel and logout"
              >
                ×
              </button>
            </div>
            <BiometricsSignIn
              userId={userProfile.id}
              entityType="user"
              schoolId={userProfile.school_id}
              tutorId={userProfile.worker_id}
              coachId={userProfile.worker_id}
              forceOperation="signin"
              onCompleted={handleBiometricComplete}
            />
          </div>
        </div>
      ) : (
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
      )}
    </>
  );
}
