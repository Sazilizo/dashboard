import { useEffect, useState, useRef } from "react";

/**
 * Enhanced online status hook that checks for actual internet connectivity
 * Not just WiFi connection (which can be connected but have no data)
 */
export default function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastChanged, setLastChanged] = useState(Date.now());
  const isChecking = useRef(false);
  const checkCount = useRef(0);
  const lastHiddenAt = useRef(null);
  const lastCheckedAt = useRef(0);

  // Check actual internet connectivity by trying to reach a reliable endpoint
  const checkRealConnectivity = async () => {
    // Rate-limit checks to avoid rapid-fire verifications (e.g. many visibility events)
    const now = Date.now();
    if (now - lastCheckedAt.current < 3000) return; // 3s cooldown
    lastCheckedAt.current = now;

    if (isChecking.current) return;
    
    isChecking.current = true;
    checkCount.current += 1;
    
    try {
      // Try multiple endpoints for redundancy
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const promises = [
        fetch('https://www.google.com/favicon.ico', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache',
          signal: controller.signal
        }),
        fetch('https://cloudflare.com/favicon.ico', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache',
          signal: controller.signal
        })
      ];

      // Race the promises - if any succeeds, we're online
      await Promise.race(promises);
      
      clearTimeout(timeoutId);
      
      // If we got here without error, we're truly online
      if (!isOnline) {
        console.log('[useOnlineStatus] ✅ Back online - connectivity verified');
        setIsOnline(true);
        setLastChanged(Date.now());
        
        // Dispatch custom event for components to react to
        window.dispatchEvent(new CustomEvent('connectivity-restored'));
      }
    } catch (error) {
      // Network error = truly offline (even if WiFi shows connected)
      if (isOnline) {
        console.warn('[useOnlineStatus] ❌ Going offline - connectivity check failed:', error.message);
        setIsOnline(false);
        setLastChanged(Date.now());
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('connectivity-lost'));
      }
    } finally {
      isChecking.current = false;
    }
  };

  useEffect(() => {
    function handleOnline() {
      console.log('[useOnlineStatus] 🌐 Browser online event detected');
      // Don't trust navigator.onLine alone, verify real connectivity
      checkRealConnectivity();
    }
    
    function handleOffline() {
      console.log('[useOnlineStatus] 📡 Browser offline event detected');
      setIsOnline(false);
      setLastChanged(Date.now());
      window.dispatchEvent(new CustomEvent('connectivity-lost'));
    }

    // Visibility change - check connectivity when user returns to tab
    function handleVisibilityChange() {
      if (document.hidden) {
        // record when the tab was hidden
        lastHiddenAt.current = Date.now();
        return;
      }

      // only check when the tab becomes visible if it was hidden long enough
      // or if the browser reports offline (we may have missed events)
      const now = Date.now();
      const hiddenAt = lastHiddenAt.current || 0;
      const hiddenDuration = now - hiddenAt;

      const MIN_HIDDEN_MS = 5000; // 5 seconds
      if (hiddenAt === 0 || hiddenDuration < MIN_HIDDEN_MS) {
        // Skip quick visibility toggles to avoid noisy background refreshes
        console.log('[useOnlineStatus] Tab visible again (brief) - skipping connectivity check');
        return;
      }

      console.log('[useOnlineStatus] Tab visible - checking connectivity');
      checkRealConnectivity();
      lastHiddenAt.current = null;
      
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Check real connectivity on mount
    checkRealConnectivity();

    // Periodic connectivity check - more frequent when offline
    const getCheckInterval = () => isOnline ? 30000 : 10000; // 30s when online, 10s when offline
    
    let intervalId = setInterval(() => {
      checkRealConnectivity();
      // Adjust interval based on current status
      clearInterval(intervalId);
      intervalId = setInterval(checkRealConnectivity, getCheckInterval());
    }, getCheckInterval());

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [isOnline]);

  return { isOnline, lastChanged, checkRealConnectivity };
}
