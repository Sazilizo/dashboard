import React, { useEffect, useState } from 'react';
import useOnlineStatus from '../hooks/useOnlineStatus';
import { getMutations } from '../utils/tableCache';

/**
 * Visual indicator showing online/offline status and pending sync count
 * Distinguishes between "connected to WiFi" vs "has real internet"
 * Auto-dismisses when back online with no pending changes
 */
export default function OfflineIndicator() {
  const { isOnline, lastChanged } = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [showIndicator, setShowIndicator] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    // Check pending mutations periodically
    const checkPending = async () => {
      try {
        const mutations = await getMutations();
        setPendingCount(mutations.length);
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

  return (
    <div
      style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        zIndex: 9999,
        backgroundColor: isOnline ? '#4caf50' : '#f44336',
        color: 'white',
        padding: '10px 18px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        animation: isTransitioning ? 'fadeOut 0.5s ease-out forwards' : 'fadeIn 0.3s ease-in',
        transition: 'background-color 0.3s ease',
      }}
    >
      <span
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: 'white',
          animation: isOnline && pendingCount > 0 ? 'pulse 1.5s infinite' : 'none',
        }}
      />
      <span>
        {!isOnline
          ? 'Offline Mode'
          : pendingCount > 0
          ? `Syncing ${pendingCount} change${pendingCount > 1 ? 's' : ''}...`
          : '✓ Back Online'}
      </span>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-10px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
