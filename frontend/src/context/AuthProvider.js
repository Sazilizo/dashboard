// src/context/AuthProvider.js
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import api from "../api/client";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Use refs for caching to avoid re-fetching too often
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
        setLoading(false);
        return;
      }

      // Fetch profile and join roles to get role name
      const { data: profile, error: profileError } = await api
        .from("users")
        .select("id, username, role_id, school_id, roles(name)")
        .eq("auth_uid", supabaseUser.id)
        .maybeSingle();

      if (profileError) {
        console.error("Failed to fetch user profile:", profileError);
        setUser(null);
        cachedUser.current = null;
        lastFetchTime.current = 0;
      } else {
        const fullUser = { ...supabaseUser, profile };
        setUser(fullUser);
        cachedUser.current = fullUser;
        lastFetchTime.current = now;
      }
    } catch (err) {
      console.error("refreshUser error:", err);
      setUser(null);
      cachedUser.current = null;
      lastFetchTime.current = 0;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();

    const { data: subscription } = api.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        refreshUser();
      } else {
        setUser(null);
        cachedUser.current = null;
        lastFetchTime.current = 0;
      }
    });

    return () => subscription?.unsubscribe?.();
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, refreshUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
