// src/auth/offlineAuth.js
import { openDB } from 'idb';

const DB_NAME = 'auth-store';
const DB_VERSION = 2;
const STORE_NAME = 'auth';
const SESSION_STORE = 'session';

async function getAuthDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Create auth store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      // Create session store if it doesn't exist
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE);
      }
    },
  });
}

export async function storeAuthData(authData) {
  try {
    const db = await getAuthDB();
    await db.put(STORE_NAME, authData, 'current-user');
    await db.put(STORE_NAME, Date.now(), 'last-sync');
    console.log('[offlineAuth] Stored auth data successfully');
  } catch (err) {
    console.error('[offlineAuth] Failed to store auth data:', err);
  }
}

export async function getStoredAuthData() {
  try {
    const db = await getAuthDB();
    const user = await db.get(STORE_NAME, 'current-user');
    const lastSync = await db.get(STORE_NAME, 'last-sync');
    return { user, lastSync };
  } catch (err) {
    console.error('[offlineAuth] Failed to get stored auth data:', err);
    return { user: null, lastSync: null };
  }
}

export async function clearStoredAuthData() {
  try {
    const db = await getAuthDB();
    await db.delete(STORE_NAME, 'current-user');
    await db.delete(STORE_NAME, 'last-sync');
    console.log('[offlineAuth] Cleared auth data');
  } catch (err) {
    console.error('[offlineAuth] Failed to clear auth data:', err);
  }
}

// Store session data for offline login
export async function storeSessionData(session) {
  try {
    const db = await getAuthDB();
    await db.put(SESSION_STORE, session, 'current-session');
    await db.put(SESSION_STORE, Date.now(), 'session-timestamp');
    console.log('[offlineAuth] Stored session data successfully');
  } catch (err) {
    console.error('[offlineAuth] Failed to store session data:', err);
  }
}

export async function getStoredSession() {
  try {
    const db = await getAuthDB();
    const session = await db.get(SESSION_STORE, 'current-session');
    const timestamp = await db.get(SESSION_STORE, 'session-timestamp');
    
    // Check if session is still valid (within 7 days)
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (session && timestamp && (Date.now() - timestamp < SEVEN_DAYS)) {
      return session;
    }
    return null;
  } catch (err) {
    console.error('[offlineAuth] Failed to get stored session:', err);
    return null;
  }
}

export async function clearStoredSession() {
  try {
    const db = await getAuthDB();
    await db.delete(SESSION_STORE, 'current-session');
    await db.delete(SESSION_STORE, 'session-timestamp');
    console.log('[offlineAuth] Cleared session data');
  } catch (err) {
    console.error('[offlineAuth] Failed to clear session data:', err);
  }
}