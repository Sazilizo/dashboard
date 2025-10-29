import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import BiometricsSignIn from "../components/forms/BiometricsSignIn";
import useToast from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";
import ConfirmToast from "../components/ConfirmToast";

const LogoutButton = () => {
  const navigate = useNavigate();
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [recordSignOut, setRecordSignOut] = useState(false);
  const { toasts, showToast, removeToast } = useToast();

  const handleLogout = async () => {
    try {
      // Get user profile first
      const { data: { user: authUser } } = await api.auth.getUser();
      if (authUser?.id) {
        const { data: profile } = await api
          .from('profiles')
          .select('id, school_id, worker_id, roles:role_id(name)')
          .eq('auth_uid', authUser.id)
          .maybeSingle();

        if (profile?.id) {
          // Prompt: End your work day? (using toast with buttons)
          const toastId = showToast(
            '',
            'info',
            0, // No auto-dismiss
            <ConfirmToast
              message="End your work day? This will record your sign-out time."
              yesText="Yes, End Day"
              noText="No, Just Logout"
              onYes={() => {
                removeToast(toastId);
                setRecordSignOut(true);
                setUserProfile(profile);
                setShowBiometrics(true);
                showToast('Please complete biometric verification to end your day.', 'info', 5000);
              }}
              onNo={() => {
                removeToast(toastId);
                setRecordSignOut(false);
                setUserProfile(profile);
                setShowBiometrics(true);
                showToast('Please complete biometric verification to logout (time not recorded).', 'info', 5000);
              }}
            />
          );
          
          return;
        }
      }

      // No profile - just logout
      await performLogout();
    } catch (err) {
      console.error("Logout error:", err);
      showToast('Logout failed. Please try again.', 'error');
    }
  };

  const handleBiometricComplete = async () => {
    // Biometric verified - record sign-out if user confirmed
    if (userProfile?.id && recordSignOut) {
      const today = new Date().toISOString().split('T')[0];
      try {
        const { data: openRows } = await api
          .from('attendance_records')
          .select('id')
          .eq('user_id', userProfile.id)
          .eq('date', today)
          .order('id', { ascending: false });

        // Filter for null sign_out_time in JavaScript
        const openSession = openRows?.filter(row => !row.sign_out_time)?.[0];

        if (openSession) {
          await api
            .from('attendance_records')
            .update({ sign_out_time: new Date().toISOString(), method: 'biometric' })
            .eq('id', openSession.id);
          
          showToast('Work day ended successfully.', 'success');
        } else {
          showToast('No open session found to close.', 'warning');
        }
      } catch (err) {
        console.warn('Work sign-out update failed', err);
        showToast('Sign-out recording failed, but you will be logged out.', 'warning');
      }
    } else if (userProfile?.id && !recordSignOut) {
      showToast('Logging out (time not recorded).', 'info');
    }

    setShowBiometrics(false);
    await performLogout();
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
        <div className="biometric-modal-overlay">
          <div className="biometric-modal">
            <div className="biometric-modal-header">
              <h2>Biometric Sign-Out Required</h2>
              <button 
                className="close-btn" 
                onClick={handleBiometricCancel}
                title="Cancel sign-out"
              >
                ×
              </button>
            </div>
            <BiometricsSignIn
              userId={userProfile.id}
              entityType="user"
              schoolId={userProfile.school_id}
              workerId={userProfile.worker_id}
              forceOperation="signout"
              onCompleted={handleBiometricComplete}
            />
          </div>
        </div>
      ) : (
        <button
          onClick={handleLogout}
          className="dropdown-item danger"
        >
          Logout
        </button>
      )}
    </>
  );
};

export default LogoutButton;
