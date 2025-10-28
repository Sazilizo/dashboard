// Utility to pre-seed schools cache for mobile deployment
// Run this in browser console after login to ensure schools are cached

import { openDB } from 'idb';
import api from '../api/client';

const DB_NAME = "GCU_Schools_offline";
const DB_VERSION = 2;
const STORE_NAME = "schools";

export async function seedSchoolsCache() {
  console.log('[seedSchoolsCache] Starting schools cache seeding...');
  
  try {
    // Fetch schools from API
    console.log('[seedSchoolsCache] Fetching schools from Supabase...');
    const { data, error } = await api
      .from("schools")
      .select("*")
      .order("name", { ascending: true });
    
    if (error) {
      console.error('[seedSchoolsCache] Failed to fetch schools:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.warn('[seedSchoolsCache] No schools returned from API');
      return { success: false, message: 'No schools found' };
    }
    
    console.log('[seedSchoolsCache] Fetched', data.length, 'schools');
    
    // Open IndexedDB
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(upgradeDb) {
        if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
          upgradeDb.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
    });
    
    // Clear existing data and add new
    console.log('[seedSchoolsCache] Clearing existing cache...');
    const tx = db.transaction(STORE_NAME, "readwrite");
    await tx.store.clear();
    
    console.log('[seedSchoolsCache] Caching schools...');
    for (const school of data) {
      await tx.store.put(school);
    }
    await tx.done;
    
    // Verify
    const cachedCount = await db.count(STORE_NAME);
    console.log('[seedSchoolsCache] Successfully cached', cachedCount, 'schools');
    
    return { 
      success: true, 
      message: `Successfully cached ${cachedCount} schools`,
      schools: data 
    };
    
  } catch (err) {
    console.error('[seedSchoolsCache] Error:', err);
    return { 
      success: false, 
      message: err.message,
      error: err 
    };
  }
}

export async function verifySchoolsCache() {
  console.log('[verifySchoolsCache] Checking schools cache...');
  
  try {
    const db = await openDB(DB_NAME, DB_VERSION);
    const schools = await db.getAll(STORE_NAME);
    
    console.log('[verifySchoolsCache] Found', schools.length, 'schools in cache');
    console.log('[verifySchoolsCache] Schools:', schools.map(s => ({ id: s.id, name: s.name })));
    
    return { 
      success: true, 
      count: schools.length,
      schools 
    };
    
  } catch (err) {
    console.error('[verifySchoolsCache] Error:', err);
    return { 
      success: false, 
      message: err.message,
      error: err 
    };
  }
}

// Make available globally for browser console
if (typeof window !== 'undefined') {
  window.seedSchoolsCache = seedSchoolsCache;
  window.verifySchoolsCache = verifySchoolsCache;
}
