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
  
  try {
    // First, get the auth_uid from the profiles table
    const { data: profile, error: profileError } = await api
      .from('profiles')
      .select('auth_uid')
      .eq('id', profileId)
      .single();
    
    if (profileError || !profile?.auth_uid) {
      console.warn('Failed to get auth_uid for profile, using localStorage fallback', profileError);
      // Fallback to localStorage
      const tokenData = {
        token,
        profileId,
        expiresAt,
        used: false
      };
      localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
      return { token, expiresAt };
    }
    
    const authUid = profile.auth_uid;
    
    // Store in auth_tokens table using auth_uid
    const { error } = await api
      .from('auth_tokens')
      .upsert({
        auth_uid: authUid,
        token: token,
        expires_at: expiresAt,
        used: false,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'auth_uid'
      });

    if (error) {
      console.warn('Failed to store auth token in database, using localStorage fallback', error);
      // Fallback to localStorage
      const tokenData = {
        token,
        profileId,
        authUid,
        expiresAt,
        used: false
      };
      localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
    }

    return { token, expiresAt };
  } catch (err) {
    console.warn('Database storage failed, using localStorage', err);
    // Fallback to localStorage
    const tokenData = {
      token,
      profileId,
      expiresAt,
      used: false
    };
    localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
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
      if (!stored) return false;

      const tokenData = JSON.parse(stored);
      const isExpired = new Date(tokenData.expiresAt) < new Date();
      const isValid = tokenData.token === token && !tokenData.used && !isExpired;

      if (isValid) {
        // Mark as used
        tokenData.used = true;
        localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
      }

      return isValid;
    }
    
    const authUid = profile.auth_uid;
    
    // Try database first
    const { data, error } = await api
      .from('auth_tokens')
      .select('token, expires_at, used')
      .eq('auth_uid', authUid)
      .eq('token', token)
      .single();

    if (!error && data) {
      const isExpired = new Date(data.expires_at) < new Date();
      const isValid = !data.used && !isExpired;
      
      if (isValid) {
        // Mark as used
        await api
          .from('auth_tokens')
          .update({ used: true })
          .eq('auth_uid', authUid)
          .eq('token', token);
      }
      
      return isValid;
    }

    // Fallback to localStorage
    const stored = localStorage.getItem(`auth_token_${profileId}`);
    if (!stored) return false;

    const tokenData = JSON.parse(stored);
    const isExpired = new Date(tokenData.expiresAt) < new Date();
    const isValid = tokenData.token === token && !tokenData.used && !isExpired;

    if (isValid) {
      // Mark as used
      tokenData.used = true;
      localStorage.setItem(`auth_token_${profileId}`, JSON.stringify(tokenData));
    }

    return isValid;
  } catch (err) {
    console.error('Token validation error:', err);
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
