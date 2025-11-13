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
import cacheFormSchemasIfOnline from "../utils/proactiveCache";
import { getTable, cacheTable } from "../utils/tableCache";
// debug flag
const DEBUG = false;

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

      // Fetch profile - with fallbacks: try auth_uid, then email, then stored data, then build a minimal profile
      let profile = null;
      try {
        const selectCols = "id, username, role_id, school_id, avatar_url, email, roles:role_id(name)";

        // Primary lookup by auth_uid
        let { data: profileData, error: profileError } = await api
          .from("profiles")
          .select(selectCols)
          .eq("auth_uid", supabaseUser.id)
          .maybeSingle();

        // If not found by auth_uid, try by email as a secondary lookup (some installs store profile.email)
        if (!profileData && (!profileError)) {
          try {
            const res = await api
              .from("profiles")
              .select(selectCols)
              .eq("email", supabaseUser.email)
              .maybeSingle();
            if (res && res.data) profileData = res.data;
            if (res && res.error) profileError = res.error;
          } catch (e) {
            // ignore and continue to other fallbacks
            if (DEBUG) console.warn('[AuthProvider] secondary profile lookup by email failed', e);
          }
        }

        if (profileError) {
          console.warn("[AuthProvider] Failed to fetch profile from DB:", profileError);
        }

        if (profileData) {
          profile = profileData;
        } else {
          // Try stored profile as a fallback
          try {
            const { user: storedUser } = await getStoredAuthData();
            if (storedUser?.profile) {
              console.log('[AuthProvider] Using stored profile data');
              profile = storedUser.profile;
            }
          } catch (e) {
            if (DEBUG) console.warn('[AuthProvider] getStoredAuthData failed', e);
          }
        }
      } catch (profileErr) {
        console.error("[AuthProvider] Profile fetch error:", profileErr);
        try {
          const { user: storedUser } = await getStoredAuthData();
          if (storedUser?.profile) {
            console.log('[AuthProvider] Using stored profile due to fetch error');
            profile = storedUser.profile;
          }
        } catch (e) {
          if (DEBUG) console.warn('[AuthProvider] getStoredAuthData failed after profileErr', e);
        }
      }

      // If still no profile, synthesize a minimal profile object from the auth user so UI has expected shape
      // Do NOT assume a default role name (like 'user') here: prefer to leave roles.name empty so it can be
      // resolved from the canonical `roles` table below (or remain unset until the app can map it).
      if (!profile) {
        const fallbackUsername = supabaseUser.user_metadata?.username || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')?.[0] || 'User';
        profile = {
          id: null,
          username: fallbackUsername,
          role_id: supabaseUser.user_metadata?.role_id || null,
          school_id: null,
          avatar_url: null,
          email: supabaseUser.email,
          // leave roles.name undefined so the canonical roles lookup can populate it
          roles: {}
        };
        console.warn('[AuthProvider] No profile found in DB - using synthesized fallback profile', profile.username);
      }

      // Ensure profile.roles.name is populated from cached roles table if available.
      // Always attempt to resolve a role name when a role_id is present so that any
      // synthesized or stale placeholder values get replaced with the canonical one.
      try {
        if (profile && profile.role_id) {
          let rolesRows = await getTable('roles');
          // If cache empty and we are online, fetch from server and cache it
          if ((!Array.isArray(rolesRows) || rolesRows.length === 0) && isOnline) {
            try {
              const { data: fetchedRoles, error: rolesErr } = await api.from('roles').select('*');
              if (!rolesErr && Array.isArray(fetchedRoles) && fetchedRoles.length) {
                rolesRows = fetchedRoles;
                // cache for future runs
                try { await cacheTable('roles', rolesRows); } catch (cErr) { if (DEBUG) console.warn('cacheTable roles failed', cErr); }
              }
            } catch (fetchErr) {
              if (DEBUG) console.warn('[AuthProvider] Failed to fetch roles from server', fetchErr);
            }
          }

          if (Array.isArray(rolesRows) && rolesRows.length) {
            const match = rolesRows.find(r => String(r.id) === String(profile.role_id) || String(r.role_id) === String(profile.role_id));
            if (match) {
              profile.roles = profile.roles || {};
              profile.roles.name = match.name || profile.roles.name || match.role_name;
            }
          }
        }
      } catch (roleErr) {
        console.warn('[AuthProvider] Failed to resolve role name from cache', roleErr);
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

      // CRITICAL: Trigger RLS-aware cache refresh when user profile is loaded
      // This ensures cached data respects user's school and role permissions
      if (isOnline && fullUser?.profile) {
        console.log('[AuthProvider] Triggering RLS-aware cache refresh for user');
        cacheFormSchemasIfOnline(fullUser).catch(err => 
          console.warn('[AuthProvider] RLS cache refresh failed:', err)
        );
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
        
  // Start auto-close monitoring when user is authenticated
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