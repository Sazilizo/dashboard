import { useEffect, useState } from "react";

// Simple hook that returns boolean isOnline and a timestamp of last change
export default function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastChanged, setLastChanged] = useState(Date.now());

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setLastChanged(Date.now());
    }
    function handleOffline() {
      setIsOnline(false);
      setLastChanged(Date.now());
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, lastChanged };
}
