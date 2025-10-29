// src/context/AuthProvider.js
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import api from "../api/client";
import { 
  storeAuthData, 
  getStoredAuthData, 
  clearStoredAuthData,
  storeSessionData,
  getStoredSession,
  clearStoredSession
} from "../auth/offlineAuth";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { startAutoCloseMonitoring, stopAutoCloseMonitoring } from "../utils/autoCloseWorkDay";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isOnline } = useOnlineStatus();

  const cachedUser = useRef(null);
  const lastFetchTime = useRef(0);
  const FETCH_DEBOUNCE_MS = 15 * 1000; // 15 seconds debounce
  const isInitialized = useRef(false);

  const refreshUser = async (forceRefresh = false) => {
    const now = Date.now();

    // Return cached user if within debounce interval and not forcing refresh
    if (!forceRefresh && cachedUser.current && now - lastFetchTime.current < FETCH_DEBOUNCE_MS) {
      setUser(cachedUser.current);
      setLoading(false);
      return;
    }

    // If offline, use stored data
    if (!isOnline) {
      console.log('[AuthProvider] Offline - loading stored auth data');
      const { user: storedUser, lastSync } = await getStoredAuthData();
      if (storedUser) {
        console.log('[AuthProvider] Loaded user from offline storage:', storedUser.email);
        setUser(storedUser);
        cachedUser.current = storedUser;
        lastFetchTime.current = lastSync || now;
        setLoading(false);
        return;
      } else {
        console.log('[AuthProvider] No stored user found offline');
        setUser(null);
        setLoading(false);
        return;
      }
    }

    // Online: fetch from Supabase
    setLoading(true);
    try {
      console.log('[AuthProvider] Fetching user from Supabase');
      const {
        data: { user: supabaseUser },
        error: userError,
      } = await api.auth.getUser();

      if (userError || !supabaseUser) {
        console.log('[AuthProvider] No authenticated user found');
        
        // Check if we have stored data before logging out
        const { user: storedUser } = await getStoredAuthData();
        if (storedUser) {
          console.log('[AuthProvider] Using stored user - server unreachable but user exists locally');
          setUser(storedUser);
          cachedUser.current = storedUser;
          setLoading(false);
          return;
        }
        
        setUser(null);
        cachedUser.current = null;
        lastFetchTime.current = 0;
        await clearStoredAuthData();
        await clearStoredSession();
        setLoading(false);
        return;
      }

      console.log('[AuthProvider] User authenticated:', supabaseUser.email);

      // Fetch profile - with fallback to stored data
      let profile = null;
      try {
        const { data: profileData, error: profileError } = await api
          .from("profiles")
          .select("id, username, role_id, school_id, avatar_url, roles:role_id(name)")
          .eq("auth_uid", supabaseUser.id)
          .maybeSingle();

        if (profileError) {
          console.warn("[AuthProvider] Failed to fetch profile from DB:", profileError);
          
          // Fallback to stored profile
          const { user: storedUser } = await getStoredAuthData();
          if (storedUser?.profile) {
            console.log('[AuthProvider] Using stored profile data');
            profile = storedUser.profile;
          } else {
            console.warn("[AuthProvider] No stored profile available");
          }
        } else {
          profile = profileData;
        }
      } catch (profileErr) {
        console.error("[AuthProvider] Profile fetch error:", profileErr);
        
        // Fallback to stored profile
        const { user: storedUser } = await getStoredAuthData();
        if (storedUser?.profile) {
          console.log('[AuthProvider] Using stored profile due to fetch error');
          profile = storedUser.profile;
        }
      }

      const fullUser = { ...supabaseUser, profile };
      console.log('[AuthProvider] Full user data loaded:', fullUser.email, fullUser.profile?.roles?.name || fullUser.profile?.role_id);
      setUser(fullUser);
      cachedUser.current = fullUser;
      lastFetchTime.current = now;
      
      // Store auth data for offline use (don't fail if storage fails)
      try {
        await storeAuthData(fullUser);
        
        // Store session data
        const { data: { session } } = await api.auth.getSession();
        if (session) {
          await storeSessionData(session);
        }
      } catch (storeErr) {
        console.warn('[AuthProvider] Failed to store auth data, continuing anyway:', storeErr);
      }
    } catch (err) {
      console.error("[AuthProvider] refreshUser error:", err);
      
      // Fallback to stored data on error (CRITICAL: don't lock users out)
      try {
        const { user: storedUser } = await getStoredAuthData();
        if (storedUser) {
          console.log('[AuthProvider] Using stored user due to fetch error');
          setUser(storedUser);
          cachedUser.current = storedUser;
        } else {
          console.warn('[AuthProvider] No stored user available, logging out');
          setUser(null);
          cachedUser.current = null;
          lastFetchTime.current = 0;
        }
      } catch (fallbackErr) {
        console.error('[AuthProvider] Even fallback failed:', fallbackErr);
        // Last resort: keep current user if exists, otherwise null
        if (!cachedUser.current) {
          setUser(null);
          cachedUser.current = null;
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Listen for online/offline changes
  useEffect(() => {
    if (isOnline && isInitialized.current) {
      console.log('[AuthProvider] Back online - refreshing user');
      refreshUser(true);
    }
  }, [isOnline]);

  useEffect(() => {
    // Initial load
    refreshUser(true);
    isInitialized.current = true;

    const result = api.auth.onAuthStateChange(async (_event, session) => {
      console.log('[AuthProvider] Auth state changed:', _event);
      
      if (session?.user) {
        // Store session immediately (don't fail if storage fails)
        try {
          await storeSessionData(session);
        } catch (storeErr) {
          console.warn('[AuthProvider] Failed to store session, continuing anyway:', storeErr);
        }
        refreshUser(true);
        
        // Start auto-close monitoring when user is signed in
        startAutoCloseMonitoring();
      } else if (_event === 'SIGNED_OUT') {
        // Only clear on explicit sign out
        setUser(null);
        cachedUser.current = null;
        lastFetchTime.current = 0;
        try {
          await clearStoredAuthData();
          await clearStoredSession();
        } catch (clearErr) {
          console.warn('[AuthProvider] Failed to clear stored data:', clearErr);
        }
        
        // Stop auto-close monitoring when user signs out
        stopAutoCloseMonitoring();
      }
      // Don't clear user on other events (like TOKEN_REFRESHED failures)
    });

    // Handle both return patterns
    return () => {
      stopAutoCloseMonitoring(); // Clean up on unmount
      
      if (result?.data?.subscription?.unsubscribe) {
        result.data.subscription.unsubscribe();
      } else if (result?.subscription?.unsubscribe) {
        result.subscription.unsubscribe();
      } else if (typeof result?.unsubscribe === 'function') {
        result.unsubscribe();
      }
    };
  }, []);
  
  return (
    <AuthContext.Provider value={{ user, setUser, refreshUser, loading, isOnline }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}