import React, { useEffect, useState } from 'react';
import useOnlineStatus from '../hooks/useOnlineStatus';
import { getMutations } from '../utils/tableCache';

/**
 * Visual indicator showing online/offline status and pending sync count
 * Distinguishes between "connected to WiFi" vs "has real internet"
 */
export default function OfflineIndicator() {
  const { isOnline } = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [showIndicator, setShowIndicator] = useState(false);

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
    const interval = setInterval(checkPending, 5000); // Check every 5 seconds

    // Listen for sync events
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
      };
    }

    return () => clearInterval(interval);
  }, []);

  // Show indicator when offline or when there are pending changes
  useEffect(() => {
    setShowIndicator(!isOnline || pendingCount > 0);
  }, [isOnline, pendingCount]);

  if (!showIndicator) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        zIndex: 9999,
        backgroundColor: isOnline ? '#ffa500' : '#f44336',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        animation: 'fadeIn 0.3s ease-in',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: 'white',
          animation: isOnline ? 'pulse 2s infinite' : 'none',
        }}
      />
      <span>
        {isOnline
          ? pendingCount > 0
            ? `Syncing ${pendingCount} change${pendingCount > 1 ? 's' : ''}...`
            : 'Online'
          : 'Offline Mode'}
      </span>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
