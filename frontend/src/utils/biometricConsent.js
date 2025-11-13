// Simple utility to manage biometric consent (local device-level opt-in)
// This stores a flag in localStorage and exposes helper functions for UI and code to check consent.

const KEY = 'biometric_consent_v1';

export function hasBiometricConsent() {
  try {
    const v = localStorage.getItem(KEY);
    return v === '1' || v === 'true' || v === 'yes';
  } catch (err) {
    return false;
  }
}

export function setBiometricConsent(enabled = true) {
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0');
    return true;
  } catch (err) {
    console.warn('[biometricConsent] set failed', err);
    return false;
  }
}

export function clearBiometricConsent() {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch (err) {
    console.warn('[biometricConsent] clear failed', err);
    return false;
  }
}

export default { hasBiometricConsent, setBiometricConsent, clearBiometricConsent };
