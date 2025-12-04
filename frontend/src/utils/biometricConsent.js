// Minimal biometric consent helper (stub).
const KEY = 'biometric_consent_v1';

const biometricConsent = {
  hasBiometricConsent: () => {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  },
  setBiometricConsent: (val = true) => {
    try { localStorage.setItem(KEY, val ? '1' : '0'); } catch (e) { }
  },
  clearBiometricConsent: () => {
    try { localStorage.removeItem(KEY); } catch (e) { }
  }
};

export const hasBiometricConsent = () => biometricConsent.hasBiometricConsent();
export const setBiometricConsent = (v = true) => biometricConsent.setBiometricConsent(v);
export const clearBiometricConsent = () => biometricConsent.clearBiometricConsent();

export default biometricConsent;
