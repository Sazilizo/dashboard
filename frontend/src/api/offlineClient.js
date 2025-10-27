import { openDB } from "idb";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/* Configuration */
export const DB_NAME = "GCU_Schools_offline";
export const DB_VERSION = 2;
const TABLES_STORE = "tables"; // shape: { name, rows, timestamp }
const MUTATIONS_STORE = "mutations"; // queued mutations
const FILES_STORE = "files"; // file blobs for mutations
const CACHED_FILES_STORE = "cached_files"; // file metadata/cache
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/* DB helpers */
export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(TABLES_STORE)) db.createObjectStore(TABLES_STORE, { keyPath: "name" });
        if (!db.objectStoreNames.contains(MUTATIONS_STORE)) db.createObjectStore(MUTATIONS_STORE, { keyPath: "id", autoIncrement: true });
        if (!db.objectStoreNames.contains(FILES_STORE)) db.createObjectStore(FILES_STORE, { keyPath: "id", autoIncrement: true });
        if (!db.objectStoreNames.contains(CACHED_FILES_STORE)) db.createObjectStore(CACHED_FILES_STORE, { keyPath: "key" });
      }
      if (oldVersion < 2) {
        try {
          const tablesStore = db.objectStoreNames.contains(TABLES_STORE) ? db.transaction(TABLES_STORE).objectStore(TABLES_STORE) : null;
          if (tablesStore && !tablesStore.indexNames.contains("timestamp")) tablesStore.createIndex("timestamp", "timestamp");
        } catch (e) {}
        if (!db.objectStoreNames.contains("background_sync")) db.createObjectStore("background_sync", { keyPath: "id", autoIncrement: true });
      }
    },
    blocked() { console.warn("[offlineClient] openDB blocked"); },
    blocking() { console.warn("[offlineClient] openDB blocking"); },
  });
}

/* Cache helpers */
export async function cacheResponse(key, rows) {
  try {
    const db = await getDB();
    await db.put(TABLES_STORE, { name: key, rows, timestamp: Date.now() });
  } catch (err) { console.warn("[offlineClient] cacheResponse failed:", err); }
}

export async function getCachedResponse(key) {
  try {
    const db = await getDB();
    const entry = await db.get(TABLES_STORE, key);
    return entry?.rows ?? null;
  } catch (err) { console.warn("[offlineClient] getCachedResponse failed:", err); return null; }
}

export async function cleanupCache() {
  try {
    const db = await getDB();
    const tx = db.transaction(TABLES_STORE, "readwrite");
    const store = tx.objectStore(TABLES_STORE);
    const allKeys = await store.getAllKeys();
    const now = Date.now();
    for (const key of allKeys) {
      const entry = await store.get(key);
      if (!entry) continue;
      if (now - (entry.timestamp || 0) > MAX_CACHE_AGE) await store.delete(key);
    }
    await tx.done;
  } catch (err) { console.warn("[offlineClient] cleanupCache failed:", err); }
}

/* Mutation queueing */
export async function queueMutation(method, path, data) {
  const db = await getDB();
  const tx = db.transaction([MUTATIONS_STORE, FILES_STORE], "readwrite");
  const mutationsStore = tx.objectStore(MUTATIONS_STORE);
  const filesStore = tx.objectStore(FILES_STORE);

  const fileFields = [];
  const cleaned = Array.isArray(data) ? [...data] : { ...data };
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v instanceof File || v instanceof Blob) {
      cleaned[k] = { __file_pending: true };
      fileFields.push({ fieldName: k, file: v });
    }
  });

  const timestamp = Date.now();
  const key = await mutationsStore.add({ method, path, payload: cleaned, timestamp });
  for (const f of fileFields) await filesStore.add({ mutationId: key, fieldName: f.fieldName, file: f.file });
  await tx.done;

  if ("serviceWorker" in navigator && "SyncManager" in window) {
    navigator.serviceWorker.ready.then((reg) => { try { reg.sync.register("sync-mutations").catch(() => {}); } catch {} });
  }
  if (typeof BroadcastChannel !== "undefined") {
    try { new BroadcastChannel("offline-sync").postMessage({ type: "queued", mutationId: key, path }); } catch {}
  }
  return key;
}

/* Mutation helpers */
export async function getMutations() {
  const db = await getDB();
  const tx = db.transaction(MUTATIONS_STORE);
  const vals = await tx.store.getAll();
  const keys = await tx.store.getAllKeys();
  return vals.map((v, i) => ({ id: keys[i], ...v }));
}

export async function getFilesForMutation(mutationId) {
  const db = await getDB();
  const tx = db.transaction(FILES_STORE);
  const vals = await tx.store.getAll();
  const keys = await tx.store.getAllKeys();
  return vals.map((v, i) => ({ id: keys[i], ...v })).filter((f) => f.mutationId === mutationId);
}

async function deleteFilesForMutation(mutationId) {
  const db = await getDB();
  const tx = db.transaction(FILES_STORE, "readwrite");
  const all = await tx.store.getAll();
  const keys = await tx.store.getAllKeys();
  const toRemove = all.map((v, i) => (v.mutationId === mutationId ? keys[i] : null)).filter(Boolean);
  for (const k of toRemove) await tx.store.delete(k);
  await tx.done;
}

/* QueryBuilder */
class QueryBuilder {
  constructor(table, baseClient) {
    this.table = table;
    this.baseClient = baseClient;
    this.queryString = "*";
    this.orderField = null;
    this.orderAscending = true;
    this.filters = {};
    this.rangeStart = null;
    this.rangeEnd = null;
    this.isSingleFlag = false;
    this.isMaybeSingleFlag = false;
  }

  select(q = "*") { this.queryString = q; return this; }
  order(field, { ascending = true } = {}) { this.orderField = field; this.orderAscending = ascending; return this; }
  range(s, e) { this.rangeStart = s; this.rangeEnd = e; return this; }
  eq(f, v) { this.filters[f] = { type: "eq", value: v }; return this; }
  in(f, vals) { this.filters[f] = { type: "in", value: vals }; return this; }
  single() { this.isSingleFlag = true; return this; }
  maybeSingle() { this.isMaybeSingleFlag = true; return this; }

  async execute() {
    const cacheKey = JSON.stringify({
      table: this.table,
      query: this.queryString,
      filters: this.filters,
      order: this.orderField,
      ascending: this.orderAscending,
      range: [this.rangeStart, this.rangeEnd],
      single: this.isSingleFlag,
      maybeSingle: this.isMaybeSingleFlag,
    });

    // OFFLINE-FIRST: Try cache first, then attempt network
    let cachedData = (await getCachedResponse(cacheKey)) || [];
    
    // Always prepare offline fallback
    let offlineResult = [...cachedData];
    Object.entries(this.filters).forEach(([f, filter]) => {
      if (filter.type === "eq") offlineResult = offlineResult.filter(r => r[f] === filter.value);
      if (filter.type === "in") offlineResult = offlineResult.filter(r => filter.value.includes(r[f]));
    });
    if (this.orderField) {
      offlineResult.sort((a, b) => (
        this.orderAscending 
          ? (a[this.orderField] > b[this.orderField] ? 1 : -1) 
          : (a[this.orderField] < b[this.orderField] ? 1 : -1)
      ));
    }
    if (this.rangeStart !== null && this.rangeEnd !== null) {
      offlineResult = offlineResult.slice(this.rangeStart, this.rangeEnd + 1);
    }

    let finalResult;
    if (this.isSingleFlag || this.isMaybeSingleFlag) {
      finalResult = Array.isArray(offlineResult) ? offlineResult[0] ?? null : offlineResult ?? null;
    } else {
      finalResult = offlineResult;
    }

    // Check if we should even try network
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log(`[offlineClient] Using cache for ${this.table} (navigator.onLine=false)`);
      return { data: finalResult, error: null, fromCache: true };
    }

    // Try network with aggressive timeout (3 seconds)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      let q = this.baseClient.from(this.table).select(this.queryString).abortSignal(controller.signal);
      
      Object.entries(this.filters).forEach(([f, filter]) => {
        if (filter.type === "eq") q = q.eq(f, filter.value);
        else if (filter.type === "in") q = q.in(f, filter.value);
      });
      if (this.orderField) q = q.order(this.orderField, { ascending: this.orderAscending });
      if (this.rangeStart !== null && this.rangeEnd !== null) q = q.range(this.rangeStart, this.rangeEnd);
      if (this.isSingleFlag) q = q.single();
      if (this.isMaybeSingleFlag && typeof q.maybeSingle === "function") q = q.maybeSingle();

      const { data, error } = await q;
      
      clearTimeout(timeoutId);

      if (error) throw error;

      // Success! Update cache in background
      if (Array.isArray(data)) {
        cacheResponse(cacheKey, data).catch(err => 
          console.warn('[offlineClient] Cache update failed:', err)
        );
      } else if (data != null) {
        cacheResponse(cacheKey, Array.isArray(data) ? data : [data]).catch(err =>
          console.warn('[offlineClient] Cache update failed:', err)
        );
      }

      return { data, error: null, fromCache: false };
    } catch (err) {
      // Network failed (timeout, no internet, etc.) - use cached data
      if (err.name === 'AbortError') {
        console.warn(`[offlineClient] ${this.table} query timed out (3s) - using cache`);
      } else {
        console.warn(`[offlineClient] ${this.table} query failed - using cache:`, err.message);
      }
      
      return { data: finalResult, error: null, fromCache: true };
    }
  }

  then(resolve, reject) { return this.execute().then(resolve, reject); }
}

/* Offline Client factory */
export function createOfflineClient(supabaseUrl, supabaseKey) {
  const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  return {
    from(table) {
      const original = supabase.from(table);
      return new Proxy(original, {
        get(target, prop) {
          if (prop === "select") return (q = "*") => new QueryBuilder(table, supabase).select(q);
          if (prop === "insert") return data => target.insert(data);
          if (prop === "upsert") return data => target.upsert(data);
          if (prop === "update") return data => target.update(data);
          if (prop === "delete") return () => target.delete();
          if (prop === "maybeSingle") return () => new QueryBuilder(table, supabase).maybeSingle();
          if (prop === "single") return () => new QueryBuilder(table, supabase).single();
          return target[prop];
        }
      });
    },
    auth: supabase.auth,
    storage: supabase.storage,
    rpc: (...args) => supabase.rpc(...args),
    functions: supabase.functions,
    _raw: supabase
  };
}


/* Utility */
function findTempIdInPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.id?.startsWith?.("__tmp_")) return payload.id;
  for (const [k, v] of Object.entries(payload)) if (typeof v === "string" && v.startsWith("__tmp_")) return v;
  return null;
}

// Add near the bottom of offlineClient.js
export async function syncOfflineChanges(supabaseClient) {
  try {
    const mutations = await getMutations();
    for (const mutation of mutations) {
      // Reconstruct payload including any pending files
      const files = await getFilesForMutation(mutation.id);
      const payload = { ...mutation.payload };
      for (const f of files) {
        payload[f.fieldName] = f.file;
      }

      try {
        const { data, error } = await supabaseClient.from(mutation.path)[mutation.method](payload);
        if (!error) {
          // Remove mutation and associated files
          await deleteFilesForMutation(mutation.id);
          const db = await getDB();
          await db.delete(MUTATIONS_STORE, mutation.id);
        }
      } catch (err) {
        console.warn("[offlineClient] sync mutation failed", err);
      }
    }
  } catch (err) {
    console.warn("[offlineClient] syncOfflineChanges error", err);
  }
}


/* Background Sync */
export function registerBackgroundSync() {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    navigator.serviceWorker.ready.then(reg => reg.sync.register("sync-mutations")).catch(err => console.warn("background sync failed", err));
  }
}

export default {
  getDB,
  cacheResponse,
  getCachedResponse,
  cleanupCache,
  queueMutation,
  getMutations,
  getFilesForMutation,
  deleteFilesForMutation,
  createOfflineClient,
  registerBackgroundSync,
  getTableCached: getCachedResponse,
  syncOfflineChanges
};
