// src/auth/offlineAuth.js
import { openDB } from 'idb';

const DB_NAME = 'auth-store';
const DB_VERSION = 1;
const STORE_NAME = 'auth';

async function getAuthDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function storeAuthData(authData) {
  const db = await getAuthDB();
  await db.put(STORE_NAME, authData, 'current-user');
  await db.put(STORE_NAME, Date.now(), 'last-sync');
}

export async function getStoredAuthData() {
  const db = await getAuthDB();
  return {
    user: await db.get(STORE_NAME, 'current-user'),
    lastSync: await db.get(STORE_NAME, 'last-sync'),
  };
}

export async function clearStoredAuthData() {
  const db = await getAuthDB();
  await db.delete(STORE_NAME, 'current-user');
  await db.delete(STORE_NAME, 'last-sync');
}