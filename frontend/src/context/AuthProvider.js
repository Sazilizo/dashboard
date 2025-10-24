// src/context/AuthProvider.js
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import api from "../api/client";
import { storeAuthData, getStoredAuthData, clearStoredAuthData } from "../auth/offlineAuth";
import useOnlineStatus from "../hooks/useOnlineStatus";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isOnline } = useOnlineStatus();

  const cachedUser = useRef(null);
  const lastFetchTime = useRef(0);
  const FETCH_DEBOUNCE_MS = 15 * 1000; // 15 seconds debounce

  const refreshUser = async () => {
    const now = Date.now();

    // Return cached user if within debounce interval
    if (cachedUser.current && now - lastFetchTime.current < FETCH_DEBOUNCE_MS) {
      setUser(cachedUser.current);
      setLoading(false);
      return;
    }

    // Try to get stored offline auth data if we're offline
    if (!isOnline) {
      const { user: storedUser, lastSync } = await getStoredAuthData();
      if (storedUser) {
        setUser(storedUser);
        cachedUser.current = storedUser;
        lastFetchTime.current = lastSync;
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const {
        data: { user: supabaseUser },
        error: userError,
      } = await api.auth.getUser();

      if (userError || !supabaseUser) {
        setUser(null);
        cachedUser.current = null;
        lastFetchTime.current = 0;
        await clearStoredAuthData();
        setLoading(false);
        return;
      }

      // Fetch profile and join roles to get role name
      const { data: profile, error: profileError } = await api
        .from("profiles")
        .select("id, username, role_id, school_id, roles(name)")
        .eq("auth_uid", supabaseUser && supabaseUser.id)
        .maybeSingle({ head: true });

      if (profileError) {
        console.error("Failed to fetch user profile:", profileError);
        setUser(null);
        cachedUser.current = null;
        lastFetchTime.current = 0;
        await clearStoredAuthData();
      } else {
        const fullUser = { ...supabaseUser, profile };
        setUser(fullUser);
        cachedUser.current = fullUser;
        lastFetchTime.current = now;
        // Store auth data for offline use
        await storeAuthData(fullUser);
      }
    } catch (err) {
      console.error("refreshUser error:", err);
      setUser(null);
      cachedUser.current = null;
      lastFetchTime.current = 0;
      await clearStoredAuthData();
    } finally {
      setLoading(false);
    }
  };

  // Listen for online/offline changes
  useEffect(() => {
    if (isOnline) {
      refreshUser();
    }
  }, [isOnline]);

  useEffect(() => {
    refreshUser();

    const result = api.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        refreshUser();
      } else {
        setUser(null);
        cachedUser.current = null;
        lastFetchTime.current = 0;
        clearStoredAuthData();
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