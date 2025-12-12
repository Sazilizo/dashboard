import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import useToast from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";
import ConfirmToast from "../components/ConfirmToast";
import useOfflineTable from "../hooks/useOfflineTable";
import WorkerBiometrics from "../components/biometrics/WorkerBiometrics";

const LogoutButton = () => {
  const DEBUG = false;
  const navigate = useNavigate();
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [recordSignOut, setRecordSignOut] = useState(false);
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

          const toastId = showToast(
            '',
            'info',
            0,
            <ConfirmToast
              message="End your day now? This will record sign-out."
              yesText="Yes, End Day"
              noText="No, Just Logout"
              onYes={() => {
                removeToast(toastId);
                setRecordSignOut(true);
                setShowBiometrics(true);
              }}
              onNo={() => {
                removeToast(toastId);
                setRecordSignOut(false);
                setShowBiometrics(true);
              }}
            />
          );
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
        if (DEBUG) console.warn('No worker_id available for sign-out');
        return;
      }

      const nowIso = new Date().toISOString();
      const today = nowIso.split('T')[0];

      // Look for open worker attendance rows (sign_out_time is null) from the offline cache/rows
      try {
        const openRows = Array.isArray(workerRows) ? workerRows.filter(r => r && r.worker_id === workerId && r.date === today && !r.sign_out_time) : [];
        const open = openRows && openRows.length ? openRows.sort((a,b) => (b.id || 0) - (a.id || 0))[0] : null;

        if (open) {
          let hours = null;
          try {
            if (open.sign_in_time) {
              const dur = new Date(nowIso) - new Date(open.sign_in_time);
              hours = Number(((dur / (1000 * 60 * 60))).toFixed(2));
            }
          } catch (e) { /* ignore */ }

          // Use offline-aware updateRow which will queue when offline
          await updateWorkerRow(open.id, { sign_out_time: nowIso, hours });

          if (workersOnline) showToast('Sign-out recorded.', 'success');
          else showToast('Sign-out queued and will sync when online.', 'info');
          return;
        }

        // No open row found for today — create a best-effort record combining info.signInTime if available
        const signInTime = info?.signInTime || null;
        const hours = signInTime ? Number(((new Date(nowIso) - new Date(signInTime)) / (1000 * 60 * 60)).toFixed(2)) : null;

        const payload = {
          worker_id: workerId,
          school_id: userProfile.school_id,
          date: today,
          sign_in_time: signInTime,
          sign_out_time: nowIso,
          hours,
          status: 'present',
          description: 'biometric sign out',
          recorded_by: profileId,
        };

        const res = await addWorkerRow(payload);
        // res may be the inserted row (online) or a queued descriptor (offline) — provide appropriate feedback
        if (workersOnline && res && !res.__error) {
          showToast('Sign-out recorded.', 'success');
        } else if (!workersOnline && res && (res.tempId || res.mutationKey || res.__queued)) {
          showToast('Sign-out queued and will sync when online.', 'info');
        } else if (res && res.__error) {
          showToast('Failed to record sign-out, but logging out.', 'warning');
        } else {
          // fallback message
          showToast('Sign-out recorded.', 'success');
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
