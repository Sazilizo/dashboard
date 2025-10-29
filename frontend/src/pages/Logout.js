import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import BiometricsSignIn from "../components/forms/BiometricsSignIn";
import useToast from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";

const LogoutButton = () => {
  const navigate = useNavigate();
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
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
          // Check if user has open work session
          const today = new Date().toISOString().split('T')[0];
          const { data: openRows } = await api
            .from('attendance_records')
            .select('id')
            .eq('user_id', profile.id)
            .eq('date', today);

          // Filter for null sign_out_time in JavaScript
          const openSession = openRows?.filter(row => !row.sign_out_time)?.[0];

          if (openSession) {
            // Has open session - require biometric sign-out
            setUserProfile(profile);
            setShowBiometrics(true);
            showToast('Please complete biometric verification to sign out.', 'info', 5000);
            return;
          }
        }
      }

      // No open session - just logout
      await performLogout();
    } catch (err) {
      console.error("Logout error:", err);
      showToast('Logout failed. Please try again.', 'error');
    }
  };

  const handleBiometricComplete = async () => {
    // Biometric verified - end work day
    if (userProfile?.id) {
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
        }
      } catch (err) {
        console.warn('Work sign-out update failed', err);
        showToast('Sign-out recording failed, but you will be logged out.', 'warning');
      }
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
              tutorId={userProfile.worker_id}
              coachId={userProfile.worker_id}
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
