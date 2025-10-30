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
 * @param {string} userId - User profile ID
 * @param {string} token - 6-digit token
 * @param {number} expiresInMinutes - Token validity duration (default: 60 minutes)
 */
export async function storeAuthToken(userId, token, expiresInMinutes = 60) {
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  
  try {
    // Store in auth_tokens table (create this table in Supabase if it doesn't exist)
    const { error } = await api
      .from('auth_tokens')
      .upsert({
        user_id: userId,
        token: token,
        expires_at: expiresAt,
        used: false,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.warn('Failed to store auth token in database, using localStorage fallback', error);
      // Fallback to localStorage
      const tokenData = {
        token,
        userId,
        expiresAt,
        used: false
      };
      localStorage.setItem(`auth_token_${userId}`, JSON.stringify(tokenData));
    }

    return { token, expiresAt };
  } catch (err) {
    console.warn('Database storage failed, using localStorage', err);
    // Fallback to localStorage
    const tokenData = {
      token,
      userId,
      expiresAt,
      used: false
    };
    localStorage.setItem(`auth_token_${userId}`, JSON.stringify(tokenData));
    return { token, expiresAt };
  }
}

/**
 * Validate an auth token
 * @param {string} userId - User profile ID
 * @param {string} token - 6-digit token to validate
 * @returns {Promise<boolean>} - True if valid
 */
export async function validateAuthToken(userId, token) {
  try {
    // Try database first
    const { data, error } = await api
      .from('auth_tokens')
      .select('token, expires_at, used')
      .eq('user_id', userId)
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
          .eq('user_id', userId)
          .eq('token', token);
      }
      
      return isValid;
    }

    // Fallback to localStorage
    const stored = localStorage.getItem(`auth_token_${userId}`);
    if (!stored) return false;

    const tokenData = JSON.parse(stored);
    const isExpired = new Date(tokenData.expiresAt) < new Date();
    const isValid = tokenData.token === token && !tokenData.used && !isExpired;

    if (isValid) {
      // Mark as used
      tokenData.used = true;
      localStorage.setItem(`auth_token_${userId}`, JSON.stringify(tokenData));
    }

    return isValid;
  } catch (err) {
    console.error('Token validation error:', err);
    return false;
  }
}

/**
 * Get active token for a user
 */
export async function getActiveToken(userId) {
  try {
    const { data } = await api
      .from('auth_tokens')
      .select('token, expires_at, used')
      .eq('user_id', userId)
      .eq('used', false)
      .single();

    if (data) {
      const isExpired = new Date(data.expires_at) < new Date();
      return isExpired ? null : data;
    }

    // Fallback to localStorage
    const stored = localStorage.getItem(`auth_token_${userId}`);
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
 */
export async function clearExpiredTokens(userId) {
  try {
    await api
      .from('auth_tokens')
      .delete()
      .eq('user_id', userId)
      .lt('expires_at', new Date().toISOString());

    // Clear from localStorage too
    localStorage.removeItem(`auth_token_${userId}`);
  } catch (err) {
    console.warn('Failed to clear expired tokens:', err);
  }
}
