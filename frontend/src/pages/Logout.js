import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import useToast from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";
import useOfflineTable from "../hooks/useOfflineTable";
import WorkerBiometrics from "../components/biometrics/WorkerBiometrics";

const LogoutButton = () => {
  const DEBUG = false;
  const navigate = useNavigate();
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [recordSignOut, setRecordSignOut] = useState(false);
  const [showChoiceOverlay, setShowChoiceOverlay] = useState(false);
  const { toasts, showToast, removeToast } = useToast();
  const { addRow: addWorkerRow, updateRow: updateWorkerRow, rows: workerRows = [], isOnline: workersOnline } = useOfflineTable('worker_attendance_records');

  const handleLogout = async () => {
    try {
      const { data: { user: authUser } } = await api.auth.getUser();
      if (authUser?.id) {
        const { data: profile } = await api
          .from('profiles')
          .select('id, school_id, worker_id, roles:role_id(name)')
          .eq('auth_uid', authUser.id)
          .maybeSingle();

        if (profile?.id) {
          setUserProfile(profile);

          setShowChoiceOverlay(true);
          return;
        }
      }

      await performLogout();
    } catch (err) {
      console.error("Logout error:", err);
      showToast('Logout failed. Please try again.', 'error');
    }
  };
  
  const handleBiometricComplete = async () => {
    if (userProfile?.id && recordSignOut) {
      await handleOnSignOut({ profileId: userProfile.id });
    }
    setShowBiometrics(false);
    await performLogout();
  };

  // Called by biometric overlay when a sign-out attendance update was performed
  const handleOnSignOut = async (info) => {
    // Expect info to contain profileId or entityId and optionally attendanceId/worker_id/signOutTime
    try {
      if (!userProfile?.id) return;
      const profileId = info?.profileId || info?.entityId || userProfile.id;
      let workerId = info?.worker_id || userProfile.worker_id || null;

      // If we don't have workerId, try to fetch from profiles table
      if (!workerId) {
        try {
          const { data: prof, error: profErr } = await api.from('profiles').select('worker_id').eq('id', profileId).maybeSingle();
          if (!profErr && prof && prof.worker_id) workerId = prof.worker_id;
        } catch (e) {
          if (DEBUG) console.warn('Failed to fetch profile worker_id', e);
        }
      }

      if (!workerId) {
        console.warn('[Logout] No worker_id available for sign-out');
        return;
      }

      console.log(`[Logout] Signing out worker: worker_id=${workerId}, profile_id=${profileId}`);
      const nowIso = new Date().toISOString();
      const today = nowIso.split('T')[0];

      // Look for open worker attendance rows (sign_out_time is null) from the offline cache/rows
      try {
        const openRows = Array.isArray(workerRows) ? workerRows.filter(r => r && r.worker_id === workerId && r.date === today && !r.sign_out_time) : [];
        const open = openRows && openRows.length ? openRows.sort((a,b) => (b.id || 0) - (a.id || 0))[0] : null;

        if (open) {
          let hours = null;
          let mins = null;
          let sessionDisplay = '';
          try {
            if (open.sign_in_time) {
              const signInTime = new Date(open.sign_in_time);
              const signOutTime = new Date(nowIso);
              const dur = signOutTime - signInTime;
              hours = Math.floor(dur / (1000 * 60 * 60));
              mins = Math.floor((dur % (1000 * 60 * 60)) / (1000 * 60));
              const hoursDecimal = Number((dur / (1000 * 60 * 60)).toFixed(2));
              sessionDisplay = `${hours}h ${mins}m`;
              console.log(`[Logout] Session duration: ${sessionDisplay} (decimal: ${hoursDecimal}h), sign_in=${open.sign_in_time}, sign_out=${nowIso}`);
            }
          } catch (e) {
            console.warn('[Logout] Failed to calculate session duration:', e);
          }

          // Use offline-aware updateRow which will queue when offline
          await updateWorkerRow(open.id, { sign_out_time: nowIso, hours: hours !== null ? Number(((new Date(nowIso) - new Date(open.sign_in_time)) / (1000 * 60 * 60)).toFixed(2)) : null });

          const message = sessionDisplay 
            ? `Sign-out recorded. Session: ${sessionDisplay}` 
            : 'Sign-out recorded.';
          if (workersOnline) showToast(message, 'success');
          else showToast(message + ' (will sync when online)', 'info');
          console.log(`[Logout] Sign-out successful: worker_id=${workerId}, attendance_id=${open.id}, ${message}`);
          return;
        }

        // No open row found for today — create a best-effort record combining info.signInTime if available
        const signInTime = info?.signInTime || null;
        let hours = null;
        let mins = null;
        let sessionDisplay = '';
        if (signInTime) {
          try {
            const dur = new Date(nowIso) - new Date(signInTime);
            hours = Math.floor(dur / (1000 * 60 * 60));
            mins = Math.floor((dur % (1000 * 60 * 60)) / (1000 * 60));
            sessionDisplay = `${hours}h ${mins}m`;
            console.log(`[Logout] New record session duration: ${sessionDisplay}, sign_in=${signInTime}, sign_out=${nowIso}`);
          } catch (e) {
            console.warn('[Logout] Failed to calculate session duration for new record:', e);
          }
        }

        const payload = {
          worker_id: workerId,
          school_id: userProfile.school_id,
          date: today,
          sign_in_time: signInTime,
          sign_out_time: nowIso,
          hours: hours !== null ? Number(((new Date(nowIso) - new Date(signInTime)) / (1000 * 60 * 60)).toFixed(2)) : null,
          status: 'present',
          description: 'biometric sign out',
          recorded_by: profileId,
        };

        const res = await addWorkerRow(payload);
        // res may be the inserted row (online) or a queued descriptor (offline) — provide appropriate feedback
        const message = sessionDisplay 
          ? `Sign-out recorded. Session: ${sessionDisplay}` 
          : 'Sign-out recorded.';
        if (workersOnline && res && !res.__error) {
          showToast(message, 'success');
          console.log(`[Logout] New sign-out record created: worker_id=${workerId}, ${message}`);
        } else if (!workersOnline && res && (res.tempId || res.mutationKey || res.__queued)) {
          showToast(message + ' (will sync when online)', 'info');
          console.log(`[Logout] New sign-out record queued (offline): worker_id=${workerId}, ${message}`);
        } else if (res && res.__error) {
          showToast('Failed to record sign-out, but logging out.', 'warning');
          console.warn('[Logout] Failed to create sign-out record:', res.__error);
        } else {
          // fallback message
          showToast(message, 'success');
          console.log(`[Logout] Sign-out record created: worker_id=${workerId}, ${message}`);
        }
      } catch (err) {
        console.warn('Failed to record worker sign-out via onSignOut handler', err);
        showToast('Failed to record sign-out, but logging out.', 'warning');
      }
    } catch (err) {
      console.warn('handleOnSignOut error', err);
    }
  };

  const handleBiometricCancel = () => {
    setShowBiometrics(false);
    setShowChoiceOverlay(false);
    showToast('Sign-out cancelled.', 'info');
  };

  const performLogout = async () => {
    try {
      const { error } = await api.auth.signOut();
      if (error) throw error;
      localStorage.clear();
      navigate("/login");
    } catch (err) {
      console.error("Logout error:", err);
      navigate("/login");
    }
  };

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {showBiometrics && userProfile ? (
        <WorkerBiometrics
          profile={userProfile}
          requireMatch={true}
          onSuccess={() => handleBiometricComplete()}
          onCancel={handleBiometricCancel}
        />
      ) : null}

      {showChoiceOverlay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '92vw', maxWidth: 420, boxShadow: '0 12px 30px rgba(0,0,0,0.18)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>End your day?</h3>
            <p style={{ marginTop: 0, color: '#475569' }}>This will record a sign-out time for today. You can also continue without recording.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => { setShowChoiceOverlay(false); setShowBiometrics(false); }}>
                Cancel
              </button>
              <button className="btn" onClick={() => { setShowChoiceOverlay(false); setRecordSignOut(false); setShowBiometrics(true); }}>
                No, Just Logout
              </button>
              <button className="btn btn-primary" onClick={() => { setShowChoiceOverlay(false); setRecordSignOut(true); setShowBiometrics(true); }}>
                Yes, End Day
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'inline-block' }}>
        <button
          onClick={handleLogout}
          className="dropdown-item danger"
        >
          Logout
        </button>
      </div>
    </>
  );
};

export default LogoutButton;
