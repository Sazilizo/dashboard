import React from 'react';
import biometricConsent from '../../utils/biometricConsent';

export default function BiometricConsentModal({ open, onClose, onAccepted }) {
  if (!open) return null;

  const accept = () => {
    biometricConsent.setBiometricConsent(true);
    if (typeof onAccepted === 'function') onAccepted();
    onClose?.();
  };

  const decline = () => {
    biometricConsent.setBiometricConsent(false);
    onClose?.();
  };

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div role="dialog" aria-modal="true" style={{ background: '#fff', padding: 20, borderRadius: 8, width: 520, maxWidth: '94%' }}>
        <h3 style={{ marginTop: 0 }}>Enable Offline Biometric Sign-in</h3>
        <p>
          This feature allows you to capture a face image and store a small descriptor on this device so
          you can sign-in or mark attendance when the device is offline. No images or biometric templates
          will be uploaded unless you explicitly choose to share them. You can remove this data at any time
          from Settings.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={decline} style={{ background: 'transparent', border: '1px solid #ddd', padding: '8px 12px', borderRadius: 4 }}>Decline</button>
          <button onClick={accept} style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 4 }}>Accept and Enable</button>
        </div>
      </div>
    </div>
  );
}
