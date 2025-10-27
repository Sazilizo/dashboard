import { useEffect, useState } from "react";

/**
 * Enhanced online status hook that checks for actual internet connectivity
 * Not just WiFi connection (which can be connected but have no data)
 */
export default function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastChanged, setLastChanged] = useState(Date.now());
  const [isChecking, setIsChecking] = useState(false);

  // Check actual internet connectivity by trying to reach Supabase
  const checkRealConnectivity = async () => {
    if (isChecking) return;
    
    setIsChecking(true);
    try {
      // Try a lightweight HEAD request with short timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      // If we got here without error, we're truly online
      if (!isOnline) {
        setIsOnline(true);
        setLastChanged(Date.now());
      }
    } catch (error) {
      // Network error = truly offline (even if WiFi shows connected)
      if (isOnline) {
        console.warn('[useOnlineStatus] Real connectivity check failed, going offline');
        setIsOnline(false);
        setLastChanged(Date.now());
      }
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    function handleOnline() {
      console.log('[useOnlineStatus] Browser online event');
      // Don't trust navigator.onLine alone, verify real connectivity
      checkRealConnectivity();
    }
    
    function handleOffline() {
      console.log('[useOnlineStatus] Browser offline event');
      setIsOnline(false);
      setLastChanged(Date.now());
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check real connectivity on mount
    checkRealConnectivity();

    // Periodic connectivity check every 30 seconds
    const intervalId = setInterval(checkRealConnectivity, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  }, [isOnline]);

  return { isOnline, lastChanged, checkRealConnectivity };
}
