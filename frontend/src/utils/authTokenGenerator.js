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
    console.log('[storeAuthToken] Got auth_uid:', authUid, 'attempting database insert...');
    
    // Store in auth_tokens table using auth_uid
    const { data, error } = await api
      .from('auth_tokens')
      .upsert({
        auth_uid: authUid,
        token: token,
        expires_at: expiresAt,
        used: false,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'auth_uid'
      })
      .select();

    console.log('[storeAuthToken] Database upsert result:', { data, error });

    if (error) {
      console.error('[storeAuthToken] Database error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      console.warn('[storeAuthToken] Failed to store auth token in database, using localStorage fallback');
      // Fallback to localStorage
      const tokenData = {
        token,
        profileId,
        authUid,
        expiresAt,
        used: false
      };
      localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
      console.log('[storeAuthToken] Stored in localStorage (database failed):', tokenData);
    } else {
      console.log('[storeAuthToken] ✅ Successfully stored in database!');
      // Also store in localStorage as backup
      const tokenData = {
        token,
        profileId,
        authUid,
        expiresAt,
        used: false
      };
      localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
      console.log('[storeAuthToken] Also stored backup in localStorage');
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
    const { data, error } = await api
      .from('auth_tokens')
      .select('token, expires_at, used')
      .eq('auth_uid', authUid)
      .eq('token', token)
      .single();

    console.log('[validateAuthToken] Database query result:', { data, error });

    if (!error && data) {
      const isExpired = new Date(data.expires_at) < new Date();
      const isValid = !data.used && !isExpired;
      
      console.log('[validateAuthToken] Database validation:', { 
        used: data.used, 
        isExpired,
        isValid,
        expiresAt: data.expires_at
      });
      
      if (isValid) {
        // Mark as used
        await api
          .from('auth_tokens')
          .update({ used: true })
          .eq('auth_uid', authUid)
          .eq('token', token);
        console.log('[validateAuthToken] Token marked as used in database');
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
    
    const { data } = await api
      .from('auth_tokens')
      .select('token, expires_at, used')
      .eq('auth_uid', authUid)
      .eq('used', false)
      .single();

    if (data) {
      const isExpired = new Date(data.expires_at) < new Date();
      return isExpired ? null : data;
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
