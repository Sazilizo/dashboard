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
import { getTable, cacheTable, resetOfflineDB, clearTableSnapshots } from "../utils/tableCache";
// debug flag
const DEBUG = false;

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isOnline } = useOnlineStatus();

  const cachedUser = useRef(null);
  const lastFetchTime = useRef(0);
  const FETCH_DEBOUNCE_MS = 15 * 1000; // 15 seconds debounce
  const refreshInProgress = useRef(false);
  const isInitialized = useRef(false);

  const refreshUser = async (forceRefresh = false) => {
    const now = Date.now();

    if (refreshInProgress.current && !forceRefresh) {
      if (DEBUG) console.log('[AuthProvider] refreshUser skipped because already in progress');
      return;
    }
    refreshInProgress.current = true;
    setIsRefreshing(true);

    // watchdog: avoid leaving loading state indefinitely
    let watchdogId = null;
    try {
      watchdogId = setTimeout(() => {
        console.warn('[AuthProvider] refreshUser watchdog triggered - clearing loading state');
        try { setLoading(false); } catch (e) {}
        refreshInProgress.current = false;
      }, 10000);
    } catch (e) {
      watchdogId = null;
    }

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
      // helper: wrap promise with timeout to fail fast
      const withTimeout = (p, ms = 8000, label = 'op') => Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms)),
      ]);

      let supabaseUser = null;
      try {
        console.log('[AuthProvider] -> calling api.auth.getUser()');
        const res = await withTimeout(api.auth.getUser(), 8000, 'auth.getUser');
        supabaseUser = res?.data?.user || null;
        if (res?.error) console.warn('[AuthProvider] api.auth.getUser error', res.error);
        console.log('[AuthProvider] <- api.auth.getUser() returned');
      } catch (e) {
        console.error('[AuthProvider] api.auth.getUser() failed or timed out', e);
        throw e;
      }

      if (!supabaseUser) {
        // unify with previous behavior: no authenticated user
        console.log('[AuthProvider] No authenticated user found');
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
        let profileData = null;
        let profileError = null;
        try {
          console.log('[AuthProvider] -> querying profiles by auth_uid');
          const res = await withTimeout(api.from('profiles').select(selectCols).eq('auth_uid', supabaseUser.id).maybeSingle(), 8000, 'profiles.query');
          profileData = res?.data || null;
          profileError = res?.error || null;
          console.log('[AuthProvider] <- profiles auth_uid query returned');
        } catch (e) {
          console.warn('[AuthProvider] profiles auth_uid lookup failed', e);
        }

        // If not found by auth_uid, try by email as a secondary lookup (some installs store profile.email)
        if (!profileData && (!profileError)) {
          try {
            console.log('[AuthProvider] -> querying profiles by email fallback');
            const res = await withTimeout(api.from('profiles').select(selectCols).eq('email', supabaseUser.email).maybeSingle(), 8000, 'profiles.email');
            if (res && res.data) profileData = res.data;
            if (res && res.error) profileError = res.error;
            console.log('[AuthProvider] <- profiles email query returned');
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
          } else if (isOnline) {
            // If local cache was empty, attempt to fetch roles from server with timeout
            try {
              console.log('[AuthProvider] -> fetching roles from server');
              const rres = await withTimeout(api.from('roles').select('*'), 8000, 'roles.fetch');
              const fetchedRoles = rres?.data || [];
              if (Array.isArray(fetchedRoles) && fetchedRoles.length) {
                rolesRows = fetchedRoles;
                try { await cacheTable('roles', rolesRows); } catch (cErr) { if (DEBUG) console.warn('cacheTable roles failed', cErr); }
                const match2 = rolesRows.find(r => String(r.id) === String(profile.role_id) || String(r.role_id) === String(profile.role_id));
                if (match2) {
                  profile.roles = profile.roles || {};
                  profile.roles.name = match2.name || profile.roles.name || match2.role_name;
                }
              }
              console.log('[AuthProvider] <- fetched roles from server');
            } catch (e) {
              console.warn('[AuthProvider] Failed to fetch roles from server or timed out', e);
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

        // Store session data (with timeout)
        try {
          console.log('[AuthProvider] -> api.auth.getSession()');
          const sres = await withTimeout(api.auth.getSession(), 8000, 'auth.getSession');
          const session = sres?.data?.session;
          if (session) {
            await storeSessionData(session);
          }
          console.log('[AuthProvider] <- api.auth.getSession() returned');
        } catch (e) {
          console.warn('[AuthProvider] api.auth.getSession() failed or timed out', e);
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
      if (watchdogId) try { clearTimeout(watchdogId); } catch (e) {}
      setLoading(false);
      refreshInProgress.current = false;
      setIsRefreshing(false);
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
          console.log('[AuthProvider] Stored session data successfully');
        } catch (storeErr) {
          console.warn('[AuthProvider] Failed to store session, continuing anyway:', storeErr);
        }

        // Refresh user first so we have a canonical profile and role mapping for
        // the newly-signed-in user. Doing this before clearing snapshots prevents
        // synthesizing a fallback profile when role/profile lookups rely on cache.
        await refreshUser(true);

        // Now clear cached table snapshots for sensitive tables. Clearing after
        // refresh ensures the app has the correct current-user profile available
        // while we remove previous user's snapshot rows.
        try {
          await clearTableSnapshots([
            'students',
            'workers',
            'attendance_records',
            'academic_session_participants',
            'academic_sessions',
            'pe_session_participants'
          ]);
          console.log('[AuthProvider] Cleared sensitive table snapshots due to sign-in');
        } catch (e) {
          console.warn('[AuthProvider] clearTableSnapshots failed during sign-in', e);
        }

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
        // Also clear sensitive table snapshots on sign-out to avoid showing stale cached rows
        try {
          await clearTableSnapshots([
            'students',
            'workers',
            'attendance_records',
            'academic_session_participants',
            'academic_sessions',
            'pe_session_participants'
          ]);
          console.log('[AuthProvider] Cleared sensitive table snapshots due to sign-out');
        } catch (e) {
          console.warn('[AuthProvider] clearTableSnapshots failed during sign-out', e);
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