import React, { useEffect, useState } from 'react';
import imageCache from '../../utils/imageCache';
import { getMutations, clearMutations, clearFiles } from '../../utils/tableCache';
import { getCacheStats } from '../../utils/imageCache';
import { getFaceDescriptors, removeFaceDescriptors, clearAllFaceDescriptors } from '../../utils/faceDescriptorCache';
import biometricConsent from '../../utils/biometricConsent';
import BiometricConsentModal from '../Modals/BiometricConsentModal';
import { loadFaceApiModels, areFaceApiModelsLoaded, getFaceApiModelsBaseUrl } from '../../utils/FaceApiLoader';

export default function OfflineSettings() {
  const [modalOpen, setModalOpen] = useState(false);
  const [mutations, setMutations] = useState([]);
  const [cacheStats, setCacheStats] = useState({ totalImages: 0, totalSizeMB: '0.00' });
  const [consent, setConsent] = useState(biometricConsent.hasBiometricConsent());
  const [wifiOnly, setWifiOnly] = useState(() => { try { return localStorage.getItem('models_wifi_only_v1') === '1'; } catch { return true; } });
  const [modelsStatus, setModelsStatus] = useState(areFaceApiModelsLoaded() ? 'loaded' : 'not_loaded');
  const [modelsErrorDetails, setModelsErrorDetails] = useState(null);

  async function refresh() {
    const muts = await getMutations();
    setMutations(muts || []);
    const stats = await getCacheStats();
    setCacheStats(stats || {});
  }

  useEffect(() => { refresh(); }, []);

  const handleClearImages = async () => {
    if (!confirm('Remove all locally cached profile images? This cannot be undone.')) return;
    await imageCache.clearImageCache();
    await refresh();
    alert('Cached images cleared.');
  };

  const handleClearFaceDescriptors = async () => {
    if (!confirm('Remove ALL locally cached biometric descriptors? This will disable offline face-sign in for all users on this device.')) return;
    await clearAllFaceDescriptors();
    await refresh();
    alert('Face descriptors cleared.');
  };

  const handleClearMutations = async () => {
    if (!confirm('Clear queued offline changes (mutations) and any associated files? This will discard pending uploads.')) return;
    await clearMutations();
    await clearFiles();
    await refresh();
    alert('Queued changes cleared.');
  };

  const handleOpenConsent = () => setModalOpen(true);

  const handleConsentAccepted = () => {
    setConsent(true);
    alert('Biometric enrollment enabled on this device. You can enroll face templates from the Sign-in screen.');
  };

  const toggleWifiOnly = (val) => {
    try { localStorage.setItem('models_wifi_only_v1', val ? '1' : '0'); } catch {}
    setWifiOnly(!!val);
  };

  const handleDownloadModelsNow = async () => {
    if (!consent) {
      alert('Please enable biometric consent first.');
      return;
    }
    setModelsStatus('downloading');
    setModelsErrorDetails(null);
    const res = await loadFaceApiModels({ variant: 'tiny', requireWifi: wifiOnly, requireConsent: true });
    if (res.success) {
      setModelsStatus('loaded');
      alert('Face models downloaded and cached. Biometric features are ready.');
    } else {
      setModelsStatus('error');
      if (res.details) setModelsErrorDetails(res.details);
      if (res.reason === 'wifi_required') alert('Model download requires Wi‑Fi. Please connect to Wi‑Fi or disable the Wi‑Fi-only setting.');
      else if (res.reason === 'consent_required') alert('Biometric consent required to download models.');
      else if (res.reason === 'models_unavailable') alert('Models are not available from the configured server.');
      else alert('Failed to download models: ' + (res.error || res.reason || 'unknown'));
    }
  };

  const handleClearModelsAndDownload = async () => {
    if (!confirm('Clear downloaded face models from this device cache and re-download? This will force the app to re-fetch model files.')) return;
    try {
      setModelsStatus('clearing');
      setModelsErrorDetails(null);
      if (typeof caches !== 'undefined') {
        try {
          await caches.delete('faceapi-models');
        } catch (e) {
          console.warn('[OfflineSettings] failed to delete faceapi-models cache', e);
        }
      }
      // Attempt a fresh download after clearing cache
      await handleDownloadModelsNow();
    } catch (err) {
      console.error('[OfflineSettings] clear+download failed', err);
      setModelsStatus('error');
      setModelsErrorDetails({ clearError: String(err) });
      alert('Failed to clear and re-download models: ' + (err?.message || err));
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <h2>Offline & Biometric Settings</h2>

      <section style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 6 }}>
        <h3>Biometric Enrollment</h3>
        <p>Device-level opt-in: {consent ? 'Enabled' : 'Disabled'}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleOpenConsent} style={{ padding: '8px 12px' }}>{consent ? 'Update Consent' : 'Enable Biometric (Consent)'}</button>
          <button onClick={handleClearFaceDescriptors} style={{ padding: '8px 12px', background: '#f44336', color: '#fff' }}>Delete All Biometric Data</button>
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 6 }}>
        <h3>Model Download & Network</h3>
        <p>Models status: {modelsStatus}{areFaceApiModelsLoaded() ? ` (from ${getFaceApiModelsBaseUrl()})` : ''}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={wifiOnly} onChange={(e) => toggleWifiOnly(e.target.checked)} />
            Download models only on Wi‑Fi
          </label>
          <button onClick={handleDownloadModelsNow} style={{ padding: '8px 12px' }}>{modelsStatus === 'downloading' ? 'Downloading...' : 'Download Models Now'}</button>
          <button onClick={handleClearModelsAndDownload} style={{ padding: '8px 12px' }}>{modelsStatus === 'clearing' ? 'Clearing...' : 'Clear models & re-download'}</button>
        </div>
          <p style={{ marginTop: 8 }}><small>If you enable biometric features, the app will need to download a small set of ML model files (only once). They will be cached for offline use. You can pre-download them here while on Wi‑Fi.</small></p>
          {modelsErrorDetails && (
            <div style={{ marginTop: 8, padding: 8, background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: 4 }}>
              <strong>Download diagnostics</strong>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                <div>Probe results for candidate URLs:</div>
                <pre style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{JSON.stringify(modelsErrorDetails, null, 2)}</pre>
                <div style={{ marginTop: 6 }}><small>Look for HTTP status, content-type, and content-length fields for the failing URL(s).</small></div>
              </div>
            </div>
          )}
      </section>

      <section style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 6 }}>
        <h3>Cached Profile Images</h3>
        <p>Cached images: {cacheStats.totalImages || 0} • Size: {cacheStats.totalSizeMB || '0.00'} MB</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleClearImages} style={{ padding: '8px 12px' }}>Clear Cached Images</button>
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 6 }}>
        <h3>Queued Offline Changes</h3>
        <p>Queued items: {mutations.length}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleClearMutations} style={{ padding: '8px 12px', background: '#f44336', color: '#fff' }}>Clear Queued Changes</button>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <small>
          Warning: clearing caches or queued changes will remove offline-only data. If your device has pending
          changes that haven't synced, they will be lost.
        </small>
      </section>

      <BiometricConsentModal open={modalOpen} onClose={() => setModalOpen(false)} onAccepted={handleConsentAccepted} />
    </div>
  );
}
