import React, { useEffect, useState } from 'react';
import useOnlineStatus from '../hooks/useOnlineStatus';
import { getMutations, attemptBackgroundSync } from '../utils/tableCache';

/**
 * Visual indicator showing online/offline status and pending sync count
 * Distinguishes between "connected to WiFi" vs "has real internet"
 * Auto-dismisses when back online with no pending changes
 */
export default function OfflineIndicator() {
  const { isOnline, lastChanged } = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [failedMutations, setFailedMutations] = useState([]);
  const [showIndicator, setShowIndicator] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    // Check pending mutations periodically
    const checkPending = async () => {
      try {
        const mutations = await getMutations();
        setPendingCount(mutations.length);
        const failed = mutations.filter((m) => m.lastError || (m.attempts && m.attempts > 0));
        setFailedCount(failed.length);
        setFailedMutations(failed.slice(0, 20));
      } catch (err) {
        console.warn('[OfflineIndicator] Failed to get mutations:', err);
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 3000); // Check every 3 seconds

    // Listen for sync events and connectivity changes
    const handleConnectivityRestored = () => {
      console.log('[OfflineIndicator] Connectivity restored event received');
      checkPending();
    };

    const handleConnectivityLost = () => {
      console.log('[OfflineIndicator] Connectivity lost event received');
      checkPending();
    };

    window.addEventListener('connectivity-restored', handleConnectivityRestored);
    window.addEventListener('connectivity-lost', handleConnectivityLost);

    // Listen for sync events via BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('offline-sync');
      bc.addEventListener('message', (event) => {
        if (event.data?.type === 'synced' || event.data?.type === 'queued') {
          checkPending();
        }
      });

      return () => {
        clearInterval(interval);
        bc.close();
        window.removeEventListener('connectivity-restored', handleConnectivityRestored);
        window.removeEventListener('connectivity-lost', handleConnectivityLost);
      };
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('connectivity-restored', handleConnectivityRestored);
      window.removeEventListener('connectivity-lost', handleConnectivityLost);
    };
  }, []);

  // Show indicator when offline or when there are pending changes
  useEffect(() => {
    const shouldShow = !isOnline || pendingCount > 0;
    
    if (shouldShow !== showIndicator) {
      if (!shouldShow && showIndicator) {
        // Fade out before hiding
        setIsTransitioning(true);
        setTimeout(() => {
          setShowIndicator(false);
          setIsTransitioning(false);
        }, 500); // Match animation duration
      } else {
        setShowIndicator(shouldShow);
      }
    }
  }, [isOnline, pendingCount]);

  // Auto-refresh on connectivity change
  useEffect(() => {
    if (isOnline) {
      console.log('[OfflineIndicator] Online status changed, will auto-hide when synced');
    }
  }, [lastChanged]);

  if (!showIndicator && !isTransitioning) return null;

  // Determine indicator color and animation based on state
  const isSyncing = isOnline && pendingCount > 0;
  const indicatorColor = !isOnline ? '#f44336' : isSyncing ? '#4caf50' : '#9e9e9e';
  const indicatorPulse = isSyncing ? 'pulse 1.4s infinite' : 'none';

  return (
    <div
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{
        position: 'fixed',
        top: '12px',
        right: '88px',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        pointerEvents: 'auto',
      }}
    >
      <div
        aria-label="Connection status"
        title={
          !isOnline
            ? 'Offline'
            : pendingCount > 0
            ? `Syncing ${pendingCount} change${pendingCount > 1 ? 's' : ''}`
            : 'Back online'
        }
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          backgroundColor: indicatorColor,
          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          animation: indicatorPulse,
          display: 'inline-block',
        }}
      />

      {/* Tiny label */}
      <div
        style={{
          minWidth: '10px',
          padding: '4px 8px',
          borderRadius: '999px',
          background: 'rgba(0,0,0,0.65)',
          color: 'white',
          fontSize: '12px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        { !isOnline ? 'Offline' : pendingCount > 0 ? `Syncing ${pendingCount}` : 'Online' }
      </div>

      {/* Tooltip / popup on hover */}
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            top: '28px',
            right: '0px',
            width: '260px',
            background: 'white',
            color: '#222',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            padding: '10px',
            fontSize: '13px',
            zIndex: 100000,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {!isOnline ? 'Offline Mode' : pendingCount > 0 ? 'Syncing Changes' : 'Connected'}
          </div>
          <div style={{ marginBottom: 8 }}>
            <div>Pending: <strong>{pendingCount}</strong></div>
            <div>Failed: <strong>{failedCount}</strong></div>
          </div>
          {failedMutations && failedMutations.length > 0 && (
            <div style={{ maxHeight: '160px', overflow: 'auto', marginBottom: 8, fontSize: 12 }}>
              {failedMutations.map((fm) => (
                <div key={fm.id} style={{ padding: '6px 0', borderTop: '1px solid #f0f0f0' }}>
                  <div><strong>{fm.table}</strong> — {String(fm.type).toUpperCase()}</div>
                  <div style={{ color: '#666' }}>{fm.lastError ? fm.lastError : 'No error recorded'}</div>
                  <div style={{ color: '#999', fontSize: 11 }}>
                    Attempts: {fm.attempts || 0} • Last: {fm.lastAttempt ? new Date(fm.lastAttempt).toLocaleString() : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {failedCount > 0 && (
              <button
                onClick={async () => {
                  try {
                    await attemptBackgroundSync({ force: true });
                    // refresh pending counts after retry
                    const muts = await getMutations();
                    setPendingCount(muts.length);
                    const failed = muts.filter((m) => m.lastError || (m.attempts && m.attempts > 0));
                    setFailedCount(failed.length);
                  } catch (err) {
                    console.warn('[OfflineIndicator] retry failed', err);
                  }
                }}
                style={{
                  background: '#1976d2',
                  color: 'white',
                  border: 'none',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Retry Failed
              </button>
            )}
            <button
              onClick={() => setShowTooltip(false)}
              style={{
                background: 'transparent',
                color: '#444',
                border: '1px solid #ddd',
                padding: '6px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.25); opacity: 0.6; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
