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
        setUser(null);
        cachedUser.current = null;
        lastFetchTime.current = 0;
        await clearStoredAuthData();
        await clearStoredSession();
        setLoading(false);
        return;
      }

      console.log('[AuthProvider] User authenticated:', supabaseUser.email);

      // Fetch profile and join roles to get role name
      const { data: profile, error: profileError } = await api
        .from("profiles")
        .select("id, username, role_id, school_id, avatar_url, roles(name)")
        .eq("auth_uid", supabaseUser.id)
        .maybeSingle();

      if (profileError) {
        console.error("[AuthProvider] Failed to fetch user profile:", profileError);
        setUser(null);
        cachedUser.current = null;
        lastFetchTime.current = 0;
        await clearStoredAuthData();
        await clearStoredSession();
      } else {
        const fullUser = { ...supabaseUser, profile };
        console.log('[AuthProvider] Full user data loaded:', fullUser.email, fullUser.profile?.roles?.name);
        setUser(fullUser);
        cachedUser.current = fullUser;
        lastFetchTime.current = now;
        
        // Store auth data for offline use
        await storeAuthData(fullUser);
        
        // Store session data
        const { data: { session } } = await api.auth.getSession();
        if (session) {
          await storeSessionData(session);
        }
      }
    } catch (err) {
      console.error("[AuthProvider] refreshUser error:", err);
      
      // Fallback to stored data on error
      const { user: storedUser } = await getStoredAuthData();
      if (storedUser) {
        console.log('[AuthProvider] Using stored user due to fetch error');
        setUser(storedUser);
        cachedUser.current = storedUser;
      } else {
        setUser(null);
        cachedUser.current = null;
        lastFetchTime.current = 0;
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
        // Store session immediately
        await storeSessionData(session);
        refreshUser(true);
      } else {
        setUser(null);
        cachedUser.current = null;
        lastFetchTime.current = 0;
        await clearStoredAuthData();
        await clearStoredSession();
      }
    });

    // Handle both return patterns
    return () => {
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