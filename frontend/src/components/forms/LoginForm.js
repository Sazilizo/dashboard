// src/components/LoginForm.js
import React, { useState, lazy, Suspense } from "react";
import api from "../../api/client";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";
import { preloadFaceApiModels } from "../../utils/FaceApiLoader";
import useToast from "../../hooks/useToast";
import ToastContainer from "../ToastContainer";
import ConfirmToast from "../ConfirmToast";
import { cacheUserImages } from "../../utils/proactiveImageCache";
import { generateAuthToken, storeAuthToken } from "../../utils/authTokenGenerator";

const BiometricsSignIn = lazy(() => import("./BiometricsSignIn"));

export default function LoginForm() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [recordAttendance, setRecordAttendance] = useState(false);
  const [authToken, setAuthToken] = useState(null);
  const [showTokenDisplay, setShowTokenDisplay] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null); // hold creds in-memory until biometric completes
  const navigate = useNavigate();
  const location = useLocation();
  const { toasts, showToast, removeToast } = useToast();
  const [hasCamera, setHasCamera] = useState(true);

  const { refreshUser } = useAuth() || {};  // get refreshUser method from context
  
  // Get the page the user was trying to access (or default to dashboard)
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
        })

        if (error) throw error;

        if (refreshUser) {
          await refreshUser(true);
        }
        
        // Defer face-api preload - will load when biometrics screen appears if needed
        // Don't block login flow with heavy ML model loading
        const runWhenIdle = (callback) => {
          if ('requestIdleCallback' in window) {
            requestIdleCallback(callback, { timeout: 2000 });
          } else {
            setTimeout(callback, 100);
          }
        };
        
        runWhenIdle(() => {
          preloadFaceApiModels().catch(() => {});
        });

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

          // For non-testing roles, require biometric authentication before completing login.
          // For testing/admin roles we keep the previous shortcut behavior.
          if (isTestingRole) {
            // Allow admins/testing roles to proceed without biometric gate
            navigate(from, { replace: true });
            setLoading(false);
            return;
          }

          // Always prompt the user whether to record time or just login. We will NOT finalize the
          // authenticated session until biometric authentication succeeds. Store credentials
          // temporarily in-memory only. We purposely DO NOT sign out here so the client can
          // persist a one-time token to the server (some environments require an authenticated
          // client to insert into the auth_tokens table). The temporary session will be
          // finalized/cleared after biometric completes or on cancel.
          setPendingCredentials({ email: form.email.trim(), password: form.password });

          const openBiometrics = async (profile, record) => {
            // check for camera availability before opening biometric modal
            try {
              const devices = await navigator.mediaDevices.enumerateDevices();
              const videoDevices = devices.filter((d) => d.kind === 'videoinput');
              setHasCamera(Boolean(videoDevices && videoDevices.length > 0));
            } catch (e) {
              setHasCamera(false);
            }
            setUserProfile(profile);
            setRecordAttendance(record);
            setShowBiometrics(true);
          };

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
                setLoading(false);
                openBiometrics(profile, true).then(() => showToast('Please complete biometric authentication to record your time.', 'info', 5000));
              }}
              onNo={() => {
                removeToast(toastId);
                setLoading(false);
                openBiometrics(profile, false).then(() => showToast('Please complete biometric authentication (time will not be recorded).', 'info', 5000));
              }}
            />
          );

          return; // Wait for biometric completion via onCompleted
        } else {
          // No profile found, just navigate
          navigate(from, { replace: true });
          setLoading(false);
        }
      } catch (err) {
        setError(err.message || "Login failed");
        setLoading(false);
      }
    }

  const handleBiometricComplete = async () => {
    // Generate backup authentication token after successful biometric login
    if (userProfile?.id) {
      // Create a persistent token and send to backend via storeAuthToken which already upserts
      const token = generateAuthToken();
      await storeAuthToken(userProfile.id, token, 60); // Valid for 60 minutes; this sends to backend when possible
      setAuthToken(token);
      setShowTokenDisplay(true);
      // Auto-hide token after 30 seconds
      setTimeout(() => setShowTokenDisplay(false), 30000);
    }
    
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
    
    // Attempt to finalize login: if we stored credentials earlier, sign in again to create a real session
    try {
      if (pendingCredentials) {
        const { email, password } = pendingCredentials;
        // perform final sign-in, this will set auth state on the backend
        const { data: signInData, error: signInError } = await api.auth.signInWithPassword({ email, password });
        if (signInError) {
          console.warn('Final sign-in after biometric failed:', signInError);
        } else {
          if (refreshUser) await refreshUser(true);
        }
      } else if (authToken && userProfile?.id) {
        // fallback: if no credentials but token was issued, persist token via storeAuthToken
        try {
          await storeAuthToken(userProfile.id, authToken, 60);
        } catch (e) {
          console.warn('Failed to persist token after biometric:', e);
        }
      }
    } catch (err) {
      console.error('Error finalizing authentication after biometric:', err);
    }

    setPendingCredentials(null);
    setShowBiometrics(false);

    // Navigate after a short delay so UI shows the confirmation
    setTimeout(() => navigate(from, { replace: true }), 800);
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
      
      {/* Token Display Modal */}
      {showTokenDisplay && authToken && (
        <div className="biometric-modal-overlay">
          <div className="biometric-modal" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h2>🔐 Backup Authentication Code</h2>
            <p style={{ marginBottom: '1rem', color: '#666' }}>
              Use this code if you need to sign in on a device without a webcam.
            </p>
            <div style={{
              background: '#f0f9ff',
              border: '2px solid #0284c7',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '1rem'
            }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', letterSpacing: '0.3em', color: '#0284c7' }}>
                {authToken}
              </div>
            </div>
            <div style={{ fontSize: '0.875rem', color: '#dc2626', marginBottom: '1rem' }}>
              ⚠️ This code expires in 60 minutes and can only be used once.
            </div>
            <div style={{ fontSize: '0.875rem', color: '#059669', marginBottom: '1rem' }}>
              ✓ Write this down - it will only be shown once
            </div>
            <button 
              className="submit-btn" 
              onClick={() => setShowTokenDisplay(false)}
              style={{ width: '100%' }}
            >
              Got it, Continue
            </button>
          </div>
        </div>
      )}
      
      {showBiometrics && userProfile ? (
        hasCamera ? (
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
              <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading biometric authentication...</div>}>
                <BiometricsSignIn
                  userId={userProfile.id}
                  entityType="user"
                  schoolId={userProfile.school_id}
                  workerId={userProfile.worker_id}
                  forceOperation="signin"
                  onCompleted={handleBiometricComplete}
                  primaryActionLabel="Sign In"
                  
                />
              </Suspense>
            </div>
          </div>
        ) : (
          // No camera: render small centered overlay with compact token-only UI
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
            <div style={{ background: '#fff', padding: 16, borderRadius: 8, width: '90vw', maxWidth: 420 }}>
              <BiometricsSignIn
                userId={userProfile.id}
                entityType="user"
                schoolId={userProfile.school_id}
                workerId={userProfile.worker_id}
                forceOperation="signin"
                onCompleted={handleBiometricComplete}
                primaryActionLabel="Sign In"
              />
            </div>
          </div>
        )
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
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
