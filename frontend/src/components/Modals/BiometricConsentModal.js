import React from 'react';

const BiometricConsentModal = ({ open, onClose, onAccepted }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
      <div style={{ background: '#fff', padding: 18, borderRadius: 8, maxWidth: 520, width: '90vw' }}>
        <h3 style={{ marginTop: 0 }}>Biometric consent</h3>
        <p>Biometric features are not available in this build. This modal is a simple fallback.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => { onAccepted?.(); onClose?.(); }}>Accept</button>
        </div>
      </div>
    </div>
  );
};

export default BiometricConsentModal;
