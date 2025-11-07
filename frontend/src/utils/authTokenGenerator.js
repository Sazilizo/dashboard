/**
 * Authentication Token Generator
 * Generates and validates one-time authentication tokens for users without webcam access
 */

import api from "../api/client";

/**
 * Generate a 6-digit authentication token
 */
export function generateAuthToken() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store auth token for a user
 * @param {string} profileId - User profile ID (from profiles table)
 * @param {string} token - 6-digit token
 * @param {number} expiresInMinutes - Token validity duration (default: 60 minutes)
 */
export async function storeAuthToken(profileId, token, expiresInMinutes = 60) {
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  
  console.log('[storeAuthToken] Starting - profileId:', profileId, 'token:', token, 'expiresAt:', expiresAt);
  
  try {
    // First, get the auth_uid from the profiles table
    const { data: profile, error: profileError } = await api
      .from('profiles')
      .select('auth_uid')
      .eq('id', profileId)
      .single();
    
    console.log('[storeAuthToken] Profile lookup result:', { profile, profileError });
    
    if (profileError || !profile?.auth_uid) {
      console.warn('[storeAuthToken] Failed to get auth_uid for profile, using localStorage fallback', profileError);
      // Fallback to localStorage
      const tokenData = {
        token,
        profileId,
        expiresAt,
        used: false
      };
      localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
      console.log('[storeAuthToken] Stored in localStorage (no auth_uid):', tokenData);
      return { token, expiresAt };
    }
    
    const authUid = profile.auth_uid;
    console.log('[storeAuthToken] Got auth_uid:', authUid, 'attempting server-side upsert via Edge Function...');

    try {
      // Get the current authenticated user's auth UID (caller)
      const { data: { user: currentUser } = {} } = await api.auth.getUser();
      const current_user_id = currentUser?.id || null;

      // Call the Edge Function that upserts auth tokens using the service role key
      const { data: fnData, error: fnError } = await api.functions.invoke('auth-token-upsert', {
        body: {
          profileId,
          token,
          expiresAt,
          current_user_id
        }
      });

      console.log('[storeAuthToken] Edge function response:', { fnData, fnError });

      if (fnError || !fnData) {
        console.warn('[storeAuthToken] Edge function failed, falling back to localStorage', fnError);
        const tokenData = { token, profileId, authUid, expiresAt, used: false };
        localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
        console.log('[storeAuthToken] Stored in localStorage (edge function failed):', tokenData);
      } else {
        console.log('[storeAuthToken] ✅ Successfully stored via edge function');
        // Also store a local backup
        const tokenData = { token, profileId, authUid, expiresAt, used: false };
        localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
        console.log('[storeAuthToken] Also stored backup in localStorage');
      }
    } catch (e) {
      console.error('[storeAuthToken] Edge function invocation exception:', e);
      console.warn('[storeAuthToken] Falling back to localStorage');
      const tokenData = { token, profileId, authUid, expiresAt, used: false };
      localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
      console.log('[storeAuthToken] Stored in localStorage (exception):', tokenData);
    }

    return { token, expiresAt };
  } catch (err) {
    console.error('[storeAuthToken] Exception caught:', err);
    console.warn('[storeAuthToken] Database storage failed, using localStorage');
    // Fallback to localStorage
    const tokenData = {
      token,
      profileId,
      expiresAt,
      used: false
    };
    localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
    console.log('[storeAuthToken] Stored in localStorage (exception):', tokenData);
    return { token, expiresAt };
  }
}

/**
 * Validate an auth token
 * @param {string} profileId - User profile ID
 * @param {string} token - 6-digit token to validate
 * @returns {Promise<boolean>} - True if valid
 */
export async function validateAuthToken(profileId, token) {
  try {
    console.log('[validateAuthToken] Starting validation for profileId:', profileId, 'token:', token);
    
    // First, get the auth_uid from the profiles table
    const { data: profile, error: profileError } = await api
      .from('profiles')
      .select('auth_uid')
      .eq('id', profileId)
      .single();
    
    if (profileError || !profile?.auth_uid) {
      console.warn('[validateAuthToken] Failed to get auth_uid for profile, trying localStorage fallback', profileError);
      // Fallback to localStorage
      const stored = localStorage.getItem(`auth_token_${profileId}`);
      console.log('[validateAuthToken] localStorage data:', stored);
      if (!stored) {
        console.log('[validateAuthToken] No localStorage token found');
        return false;
      }

      const tokenData = JSON.parse(stored);
      const isExpired = new Date(tokenData.expiresAt) < new Date();
      const isValid = tokenData.token === token && !tokenData.used && !isExpired;
      
      console.log('[validateAuthToken] localStorage validation:', { 
        tokenMatch: tokenData.token === token, 
        used: tokenData.used, 
        isExpired,
        isValid 
      });

      if (isValid) {
        // Mark as used
        tokenData.used = true;
        localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
        console.log('[validateAuthToken] Token marked as used in localStorage');
      }

      return isValid;
    }
    
    const authUid = profile.auth_uid;
    console.log('[validateAuthToken] Got auth_uid:', authUid);
    
    // Try database first
      // First try matching by auth_uid
      let dbQuery = await api
        .from('auth_tokens')
        .select('id, token, expires_at, used, auth_uid')
        .eq('auth_uid', authUid)
        .eq('token', token)
        .maybeSingle();

      let data = dbQuery.data;
      let error = dbQuery.error;

      console.log('[validateAuthToken] Database query (by auth_uid) result:', { data, error });

      // If not found by auth_uid, we'll fall back to localStorage (no profile_id fallback)

      if (!error && data) {
        const isExpired = new Date(data.expires_at) < new Date();
        const isValid = !data.used && !isExpired;
      
        console.log('[validateAuthToken] Database validation:', { 
          used: data.used, 
          isExpired,
          isValid,
          expiresAt: data.expires_at,
          dbRow: data
        });
      
        if (isValid) {
          // Mark as used - prefer updating by id when available
          try {
            if (data.id) {
              await api
                .from('auth_tokens')
                .update({ used: true })
                .eq('id', data.id);
            } else if (data.auth_uid) {
              await api
                .from('auth_tokens')
                .update({ used: true })
                .eq('auth_uid', data.auth_uid)
                .eq('token', token);
            } else {
              // No suitable DB identifier available - skip DB mark and rely on local fallback
            }
            console.log('[validateAuthToken] Token marked as used in database');
          } catch (e) {
            console.warn('[validateAuthToken] Failed to mark token used in DB', e);
          }
        }
      
        return isValid;
      }

      console.log('[validateAuthToken] No database match, trying localStorage fallback');
    
    // Fallback to localStorage
    const stored = localStorage.getItem(`auth_token_${profileId}`);
    console.log('[validateAuthToken] localStorage fallback data:', stored);
    if (!stored) {
      console.log('[validateAuthToken] No localStorage fallback token found');
      return false;
    }

    const tokenData = JSON.parse(stored);
    const isExpired = new Date(tokenData.expiresAt) < new Date();
    const isValid = tokenData.token === token && !tokenData.used && !isExpired;
    
    console.log('[validateAuthToken] localStorage fallback validation:', { 
      tokenMatch: tokenData.token === token, 
      used: tokenData.used, 
      isExpired,
      isValid 
    });

    if (isValid) {
      // Mark as used
      tokenData.used = true;
      localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
      console.log('[validateAuthToken] Token marked as used in localStorage');
    }

    return isValid;
  } catch (err) {
    console.error('[validateAuthToken] Token validation error:', err);
    return false;
  }
}

/**
 * Get active token for a user
 * @param {string} profileId - User profile ID
 * @returns {Promise<object|null>} - Active token data or null
 */
export async function getActiveToken(profileId) {
  try {
    // First, get the auth_uid from the profiles table
    const { data: profile, error: profileError } = await api
      .from('profiles')
      .select('auth_uid')
      .eq('id', profileId)
      .single();
    
    if (profileError || !profile?.auth_uid) {
      console.warn('Failed to get auth_uid for profile, trying localStorage fallback', profileError);
      // Fallback to localStorage
      const stored = localStorage.getItem(`auth_token_${profileId}`);
      if (!stored) return null;

      const tokenData = JSON.parse(stored);
      const isExpired = new Date(tokenData.expiresAt) < new Date();
      return (!tokenData.used && !isExpired) ? tokenData : null;
    }
    
    const authUid = profile.auth_uid;
    
    // Try DB by auth_uid first
    try {
      let q = await api
        .from('auth_tokens')
        .select('id, token, expires_at, used, auth_uid')
        .eq('auth_uid', authUid)
        .eq('used', false)
        .maybeSingle();

      if (q && !q.error && q.data) {
        const data = q.data;
        const isExpired = new Date(data.expires_at) < new Date();
        if (!isExpired) return data;
      }

      // Do not attempt DB lookup by profile_id; rely on auth_uid or localStorage fallback
    } catch (err) {
      console.warn('[getActiveToken] DB lookup failed, falling back to localStorage', err);
    }

    // Fallback to localStorage
    const stored = localStorage.getItem(`auth_token_${profileId}`);
    if (!stored) return null;

    const tokenData = JSON.parse(stored);
    const isExpired = new Date(tokenData.expiresAt) < new Date();
    return (!tokenData.used && !isExpired) ? tokenData : null;
  } catch {
    return null;
  }
}

/**
 * Clear expired tokens (cleanup utility)
 * @param {string} profileId - User profile ID
 */
export async function clearExpiredTokens(profileId) {
  try {
    // First, get the auth_uid from the profiles table
    const { data: profile, error: profileError } = await api
      .from('profiles')
      .select('auth_uid')
      .eq('id', profileId)
      .single();
    
    if (!profileError && profile?.auth_uid) {
      const authUid = profile.auth_uid;
      
      await api
        .from('auth_tokens')
        .delete()
        .eq('auth_uid', authUid)
        .lt('expires_at', new Date().toISOString());
    }

    // Clear from localStorage too
    localStorage.removeItem(`auth_token_${profileId}`);
  } catch (err) {
    console.warn('Failed to clear expired tokens:', err);
  }
}
