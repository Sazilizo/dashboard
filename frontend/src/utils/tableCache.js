// src/utils/tableCache.js
import { openDB } from "idb";
import api from "../api/client";
import UploadFileHelper from "../components/profiles/UploadHelper";


const DB_NAME = "GCU_Schools_offline";
const DB_VERSION = 2; // bump this when adding new stores/indexes/migrations
const CORE_STORES = ["tables", "mutations", "files", "cached_files"];

const INDEX_CONFIG = {
  students: ["school_id", "grade", "category", "full_name"],
  workers: ["school_id", "role", "full_name"],
  schools: ["name"],
  meals: ["school_id", "date"],
  roles: ["name"],
};

const memoryCache = new Map();

const MIGRATIONS = {
  1: (upgradeDb, oldVersion) => {
    // initial schema (if DB didn't exist)
    if (!upgradeDb.objectStoreNames.contains("tables")) {
      upgradeDb.createObjectStore("tables", { keyPath: "name" });
    }
    if (!upgradeDb.objectStoreNames.contains("mutations")) {
      upgradeDb.createObjectStore("mutations", { autoIncrement: true });
    }
    if (!upgradeDb.objectStoreNames.contains("files")) {
      upgradeDb.createObjectStore("files", { autoIncrement: true });
    }
    if (!upgradeDb.objectStoreNames.contains("cached_files")) {
      upgradeDb.createObjectStore("cached_files", { keyPath: "key" });
    }
    // create common example table stores (data stores can be used to index rows individually)
    if (!upgradeDb.objectStoreNames.contains("students")) {
      const s = upgradeDb.createObjectStore("students", { keyPath: "id" });
      // create indexes for students as initial set
      if (Array.isArray(INDEX_CONFIG.students)) {
        for (const idx of INDEX_CONFIG.students) {
          try { s.createIndex(idx, idx); } catch (e) {}
        }
      }
    }
  },

  // migration for DB_VERSION = 2: add more indexes or stores
  2: (upgradeDb, oldVersion) => {
    // Ensure 'workers' exists with indexes
    if (!upgradeDb.objectStoreNames.contains("workers")) {
      const w = upgradeDb.createObjectStore("workers", { keyPath: "id" });
      if (Array.isArray(INDEX_CONFIG.workers)) {
        for (const idx of INDEX_CONFIG.workers) {
          try { w.createIndex(idx, idx); } catch (e) {}
        }
      }
    } else {
      // create missing indexes on existing store safely
      const w = upgradeDb.transaction.objectStoreNames?.contains("workers")
        ? upgradeDb.transaction.objectStore("workers")
        : null;
      // can't access objectStore directly here in some browsers - safe guard: just attempt to create index via try/catch
      try {
        const ss = upgradeDb.createObjectStore ? upgradeDb.createObjectStore("workers", { keyPath: "id" }) : null;
      } catch (e) {}
    }

    // Add indexes to "students" if missing
    if (upgradeDb.objectStoreNames.contains("students")) {
      const s = upgradeDb.transaction?.objectStore ? upgradeDb.transaction.objectStore("students") : null;
      // Note: Some IDB wrappers don't allow direct objectStore access here — create indexes defensively in upgrade callback
      try {
        const obj = upgradeDb.createObjectStore ? null : null; // noop (kept to show intent)
      } catch (e) {}
    }
  },
};

/* --------------------------- Utility: open DB ---------------------- */
export async function getDB() {
  // Try to open DB with fixed DB_VERSION and run migrations in upgrade handler.
  // If openDB fails (e.g., IndexedDB disabled or unavailable), fall back to a
  // lightweight in-memory shim so callers don't throw synchronously and the
  // app can continue to function in a degraded (non-persistent) mode.
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(upgradeDb, oldVersion, newVersion, transaction) {
      // Create core stores if missing
      for (const store of CORE_STORES) {
        if (!upgradeDb.objectStoreNames.contains(store)) {
          const opts = store === "tables" ? { keyPath: "name" } : { autoIncrement: true };
          upgradeDb.createObjectStore(store, opts);
        }
      }

      // Ensure cached_files store
      if (!upgradeDb.objectStoreNames.contains("cached_files")) {
        upgradeDb.createObjectStore("cached_files", { keyPath: "key" });
      }

      // Create per-table object stores for configured indexes (non-destructive)
      for (const [tableName, fields] of Object.entries(INDEX_CONFIG)) {
        if (!upgradeDb.objectStoreNames.contains(tableName)) {
          const store = upgradeDb.createObjectStore(tableName, { keyPath: "id" });
          for (const f of fields) {
            try { store.createIndex(f, f); } catch (e) { /* ignore existing */ }
          }
        } else {
          // if store exists, attempt to add missing indexes
          try {
            const existing = upgradeDb.objectStoreNames.contains(tableName) && upgradeDb.transaction ? upgradeDb.transaction.objectStore(tableName) : null;
            // Creating indexes on already-existing stores in upgrade() context is allowed; just do it defensively
            const store = upgradeDb.createObjectStore ? null : null; // no-op, handled above
          } catch (e) {
            // ignore - browser-specific behaviors
          }
        }
      }

      // Run migrations for each version > oldVersion and <= DB_VERSION
      for (let v = (oldVersion || 0) + 1; v <= DB_VERSION; v++) {
        const migrateFn = MIGRATIONS[v];
        if (typeof migrateFn === "function") {
          try {
            migrateFn(upgradeDb, oldVersion);
          } catch (err) {
            console.warn(`[offlineDB] migration ${v} failed:`, err);
            // continue: don't abort other migrations
          }
        }
      }
    },
    blocked() {
      console.warn("[offlineDB] openDB blocked (another tab has DB open with older version)");
    },
    blocking() {
      console.warn("[offlineDB] openDB blocking (newer version overriding this page)");
    },
    terminated() {
      console.warn("[offlineDB] DB connection terminated");
    },
  });
    return db;
  } catch (err) {
    // If IDB/openDB fails, log and return an in-memory shim implementation
    // that supports the minimal subset of the API used by the app.
    console.warn('[offlineDB] openDB failed, falling back to in-memory DB:', err?.message || err);
    return createInMemoryDB();
  }
}

function createInMemoryDB() {
  // Map of storeName -> Map(key -> value)
  const stores = new Map();
  const autoIncCounters = new Map();

  // Ensure core stores exist
  for (const s of CORE_STORES) stores.set(s, new Map());
  for (const s of Object.keys(INDEX_CONFIG)) stores.set(s, new Map());
  stores.set('cached_files', new Map());

  function ensureStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
  }

  const db = {
    objectStoreNames: {
      contains: (n) => stores.has(n),
    },

    async get(storeName, key) {
      ensureStore(storeName);
      const store = stores.get(storeName);
      return store.get(key);
    },

    async put(storeName, value, key) {
      ensureStore(storeName);
      const store = stores.get(storeName);
      let k = key;
      if (k === undefined || k === null) {
        // attempt to infer key from common keyPaths
        k = value?.id ?? value?.name ?? value?.key ?? undefined;
      }
      if (k === undefined || k === null) {
        // fallback to auto-increment
        const cur = autoIncCounters.get(storeName) || 1;
        k = cur;
        autoIncCounters.set(storeName, cur + 1);
      }
      store.set(k, value);
      return k;
    },

    async add(storeName, value) {
      ensureStore(storeName);
      const cur = autoIncCounters.get(storeName) || 1;
      const k = cur;
      autoIncCounters.set(storeName, cur + 1);
      stores.get(storeName).set(k, value);
      return k;
    },

    transaction(names, mode = 'readonly') {
      // names may be a single store or array; normalize to first store
      const storeName = Array.isArray(names) ? names[0] : names;
      ensureStore(storeName);
      const store = stores.get(storeName);

      const tx = {
        store: {
          async get(key) {
            return store.get(key);
          },
          async getAll() {
            return Array.from(store.values());
          },
          async getAllKeys() {
            return Array.from(store.keys());
          },
          async put(value, key) {
            let k = key;
            if (k === undefined || k === null) {
              k = value?.id ?? value?.name ?? value?.key ?? undefined;
            }
            if (k === undefined || k === null) {
              const cur = autoIncCounters.get(storeName) || 1;
              k = cur;
              autoIncCounters.set(storeName, cur + 1);
            }
            store.set(k, value);
            return k;
          },
          async add(value) {
            const cur = autoIncCounters.get(storeName) || 1;
            const k = cur;
            autoIncCounters.set(storeName, cur + 1);
            store.set(k, value);
            return k;
          },
          async delete(key) {
            return store.delete(key);
          },
          async clear() {
            store.clear();
          },
        },
        done: Promise.resolve(),
      };

      return tx;
    },
  };

  return db;
}

/* --------------------------- Cache helpers ------------------------- */

/** Cache any table’s rows into the generic 'tables' store and into per-table store + memoryCache */
export async function cacheTable(name, rows) {
  try {
    memoryCache.set(name, rows);
    const db = await getDB();

    // Save generic table snapshot
    await db.put("tables", { name, rows, timestamp: Date.now() });

    // Also write rows into a per-table store (if exists) for indexed queries
    if (db.objectStoreNames.contains(name)) {
      const tx = db.transaction(name, "readwrite");
      const store = tx.objectStore(name);
      // Clear then re-put for simplicity (could be optimized to diff)
      await store.clear();
      for (const r of rows) {
        try {
          await store.put(r);
        } catch (e) {
          // fallback: rows may lack keyPath - ignore
        }
      }
      await tx.done;
    }
  } catch (err) {
    console.warn("[offlineDB] cacheTable failed:", err);
  }
}

/**
 * Clear cached snapshots for specific tables (memory + 'tables' store) without resetting full DB.
 * Useful when switching users to avoid leaking previous user's rows while keeping other offline state.
 */
export async function clearTableSnapshots(tableNames = []) {
  try {
    // Remove from memory cache first
    for (const t of tableNames) memoryCache.delete(t);

    const db = await getDB();
    const tx = db.transaction('tables', 'readwrite');
    for (const t of tableNames) {
      try { await tx.store.delete(t); } catch (e) { /* ignore individual delete errors */ }
    }
    await tx.done;
  } catch (err) {
    console.warn('[offlineDB] clearTableSnapshots failed:', err);
  }
}

/** Get cached table data (fast: memoryCache -> tables store) */
export async function getTable(name) {
  if (memoryCache.has(name)) return memoryCache.get(name);
  const db = await getDB();
  const entry = await db.get("tables", name);
  const rows = entry?.rows || [];
  memoryCache.set(name, rows);
  return rows;
}

/* ---------------------- Indexed lookups & filtering ----------------- */
/**
 * getTableFiltered(tableName, filters, options)
 * - filters: { fieldName: value | [values] }
 * - options: { limit, offset, sortBy, sortOrder }
 *
 * This uses IDB indexes when possible. If no indexes match, it falls back to scanning the in-memory/table snapshot.
 */
export async function getTableFiltered(tableName, filters = {}, options = {}) {
  const { limit = 100, offset = 0, sortBy, sortOrder = "asc" } = options;
  const db = await getDB();

  // If per-table store exists and we have an index for a filter key, use a cursor query
  const storeExists = db.objectStoreNames.contains(tableName);
  if (storeExists) {
    try {
      const tx = db.transaction(tableName);
      const store = tx.objectStore(tableName);

      // try to pick a filter key that has an index
      const filterKeys = Object.keys(filters);
      let chosenKey = null;
      for (const k of filterKeys) {
        if (store.indexNames && store.indexNames.contains && store.indexNames.contains(k)) {
          chosenKey = k;
          break;
        }
      }

      if (chosenKey) {
        // Use that index to bound result set, then post-filter other filters
        const idx = store.index(chosenKey);
        const val = filters[chosenKey];
        let range = null;
        if (Array.isArray(val)) {
          // use IDBKeyRange only for single value queries; for arrays we'll do multiple getAll
          // fallback: gather results by running multiple getAll on index
          const results = [];
          for (const v of val) {
            try {
              const hits = await idx.getAll(v);
              results.push(...hits);
            } catch (e) {}
          }
          // post-filter others
          const filtered = results.filter((r) => matchFilters(r, filters));
          return postProcessResults(filtered, { offset, limit, sortBy, sortOrder });
        } else {
          // single value
          const hits = await idx.getAll(val);
          const filtered = hits.filter((r) => matchFilters(r, filters));
          return postProcessResults(filtered, { offset, limit, sortBy, sortOrder });
        }
      }
      // No suitable index found; fall through to scanning
    } catch (err) {
      console.warn("[offlineDB] indexed lookup failed, falling back to scan:", err);
    }
  }

  // Fallback: in-memory / tables store scan (fast because we cache)
  const rows = await getTable(tableName);
  const filtered = rows.filter((r) => matchFilters(r, filters));
  return postProcessResults(filtered, { offset, limit, sortBy, sortOrder });
}

function matchFilters(row, filters = {}) {
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "") continue;
    const val = row?.[k];
    // support arrays (in / equals)
    if (Array.isArray(v)) {
      if (!v.includes(val)) return false;
    } else {
      // simple equality (can expand to regex / contains later)
      if (val !== v) return false;
    }
  }
  return true;
}

function postProcessResults(rows, { offset = 0, limit = 100, sortBy, sortOrder = "asc" }) {
  let out = rows;
  if (sortBy) {
    out = [...out].sort((a, b) => {
      const av = a?.[sortBy];
      const bv = b?.[sortBy];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      if (sortOrder === "asc") return av > bv ? 1 : -1;
      else return av < bv ? 1 : -1;
    });
  }
  return out.slice(offset, offset + limit);
}

/* ------------------------- Mutations + files ------------------------ */

/** Queue a mutation for offline sync */
export async function queueMutation(table, type, payload) {
  const db = await getDB();

  const fileFields = [];
  const cleanedPayload = Array.isArray(payload) ? [...payload] : { ...payload };

  // Normalize common field aliases and build required fields for specific tables
  try {
    if (table === 'students' && cleanedPayload) {
      // If the app sometimes uses studentId or student_id, map to id
      if (cleanedPayload.studentId && !cleanedPayload.id) {
        cleanedPayload.id = cleanedPayload.studentId;
        delete cleanedPayload.studentId;
      }
      if (cleanedPayload.student_id && !cleanedPayload.id) {
        cleanedPayload.id = cleanedPayload.student_id;
        delete cleanedPayload.student_id;
      }

      // Build full_name when first_name/last_name present
      if (!cleanedPayload.full_name) {
        const fn = (cleanedPayload.first_name || cleanedPayload.firstName || '').trim();
        const ln = (cleanedPayload.last_name || cleanedPayload.lastName || '').trim();
        const combined = `${fn} ${ln}`.trim();
        if (combined) cleanedPayload.full_name = combined;
      }
    }

    if (table === 'academic_session_participants' && cleanedPayload) {
      // Map known aliases
      if (cleanedPayload.studentId && !cleanedPayload.student_id) {
        cleanedPayload.student_id = cleanedPayload.studentId;
        delete cleanedPayload.studentId;
      }
      if (cleanedPayload.sessionId && !cleanedPayload.session_id) {
        cleanedPayload.session_id = cleanedPayload.sessionId;
        delete cleanedPayload.sessionId;
      }

      // Coerce numeric-ish ID strings to numbers to avoid type mismatches
      try {
        if (cleanedPayload.student_id && typeof cleanedPayload.student_id === 'string' && /^\d+$/.test(cleanedPayload.student_id)) {
          cleanedPayload.student_id = Number(cleanedPayload.student_id);
        }
        if (cleanedPayload.session_id && typeof cleanedPayload.session_id === 'string' && /^\d+$/.test(cleanedPayload.session_id)) {
          cleanedPayload.session_id = Number(cleanedPayload.session_id);
        }
        if (cleanedPayload.school_id && typeof cleanedPayload.school_id === 'string' && /^\d+$/.test(cleanedPayload.school_id)) {
          cleanedPayload.school_id = Number(cleanedPayload.school_id);
        }
      } catch (e) {
        // ignore coercion errors
      }

      // Deduplicate: if an identical participant already exists, convert insert -> update
      try {
        if (memoryCache.has(table)) {
          const rows = memoryCache.get(table) || [];
          const sid = cleanedPayload.session_id || cleanedPayload.sessionId;
          const stud = cleanedPayload.student_id || cleanedPayload.studentId;
          if (sid && stud) {
            const existing = rows.find((r) => (r.session_id === sid || r.sessionId === sid) && (r.student_id === stud || r.studentId === stud));
            if (existing) {
              // switch to update targeting the existing id
              type = 'update';
              cleanedPayload.id = existing.id;
            }
          }
        }
      } catch (e) {
        // ignore dedupe failures
      }
    }
  } catch (e) {
    console.warn('[tableCache] queueMutation normalization failed:', e);
  }

  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value instanceof Blob || value instanceof File) {
      cleanedPayload[key] = { __file_pending: true };
      fileFields.push({ fieldName: key, file: value });
    }
  });

  const timestamp = Date.now();
  const key = await db.add("mutations", {
    table,
    type,
    payload: cleanedPayload,
    timestamp,
  });

  for (const f of fileFields) {
    await db.add("files", { mutationId: key, fieldName: f.fieldName, file: f.file });
  }

  notifyChannel({ type: "queued", table, mutationKey: key, timestamp });

  // Immediate optimistic local cache update if we have the table in memory
  if (memoryCache.has(table)) {
    const rows = memoryCache.get(table) || [];
    if (type.toLowerCase() === "insert") {
      const tempId = cleanedPayload.id || `__tmp_${timestamp}`;
      const queuedRow = { ...cleanedPayload, id: tempId, __queued: true, __mutationKey: key };
      const newRows = rows.concat([queuedRow]);
      memoryCache.set(table, newRows);
      // also persist snapshot to 'tables'
      await cacheTable(table, newRows);
    } else if (type.toLowerCase() === "update") {
      const resolvedId = cleanedPayload.id ?? cleanedPayload?.id;
      const newRows = rows.map((r) => (r.id === resolvedId ? { ...r, ...(cleanedPayload.data || cleanedPayload), __queued: true } : r));
      memoryCache.set(table, newRows);
      await cacheTable(table, newRows);
    } else if (type.toLowerCase() === "delete") {
      const id = cleanedPayload.id;
      const newRows = rows.filter((r) => r.id !== id);
      memoryCache.set(table, newRows);
      await cacheTable(table, newRows);
    }
  }

  // Kick off an in-page background sync attempt (non-blocking)
  try {
    attemptBackgroundSync(); // fire-and-forget
  } catch (e) {}

  return key;
}

/* -------------------------- Mutation helpers ----------------------- */

export async function getMutations() {
  const db = await getDB();
  const tx = db.transaction("mutations");
  const values = await tx.store.getAll();
  const keys = await tx.store.getAllKeys();
  return values.map((v, i) => ({ id: keys[i], ...v }));
}

export async function getMutation(id) {
  const db = await getDB();
  const tx = db.transaction('mutations');
  const val = await tx.store.get(id);
  if (!val) return null;
  return { id, ...val };
}

export async function updateMutation(id, changes = {}) {
  const db = await getDB();
  const tx = db.transaction('mutations', 'readwrite');
  const existing = await tx.store.get(id);
  if (!existing) {
    await tx.done;
    return null;
  }
  const merged = { ...existing, ...changes };
  try {
    await tx.store.put(merged, id);
  } catch (e) {
    // some stores are keyPath-based; fall back to put without explicit key
    await tx.store.put(merged);
  }
  await tx.done;
  return { id, ...merged };
}

export async function deleteMutation(id) {
  const db = await getDB();
  const tx = db.transaction('mutations', 'readwrite');
  try {
    await tx.store.delete(id);
  } catch (e) {
    console.warn('[tableCache] deleteMutation failed', e);
  }
  await tx.done;
}

export async function getFiles() {
  const db = await getDB();
  const tx = db.transaction("files");
  const values = await tx.store.getAll();
  const keys = await tx.store.getAllKeys();
  return values.map((v, i) => ({ id: keys[i], ...v }));
}

export async function clearMutations() {
  const db = await getDB();
  const tx = db.transaction("mutations", "readwrite");
  await tx.store.clear();
  await tx.done;
}

export async function clearFiles() {
  const db = await getDB();
  const tx = db.transaction("files", "readwrite");
  await tx.store.clear();
  await tx.done;
}

/* ----------------------------- Syncing ----------------------------- */

/**
 * syncMutations: synchronize queued mutations with server.
 * - preserves order (timestamp)
 * - uploads files via UploadFileHelper
 * - updates table caches (memory + tables store)
 * - uses aggressive timeouts to handle slow/fake WiFi connections
 */
export async function syncMutations() {
  // Check if we're truly online before attempting sync
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('[tableCache] syncMutations skipped - navigator.onLine=false');
    return {};
  }

  const mutations = await getMutations();
  const files = await getFiles();

  if (!mutations?.length) {
    notifyChannel({ type: "synced", tempIdMap: {} });
    return {};
  }

  console.log(`[tableCache] Starting sync for ${mutations.length} mutations...`);

  mutations.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const idMap = {};
  const succeeded = [];
  const failed = [];

  const replaceTempIds = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      return obj.map((v) =>
        typeof v === "string" && v.startsWith("__tmp_") ? idMap[v] ?? v : replaceTempIds(v)
      );
    }
    const out = {};
    Object.entries(obj).forEach(([k, v]) => {
      if (typeof v === "string" && v.startsWith("__tmp_")) {
        out[k] = idMap[v] ?? v;
      } else if (typeof v === "object" && v !== null) {
        out[k] = replaceTempIds(v);
      } else {
        out[k] = v;
      }
    });
    return out;
  };

  for (const m of mutations) {
    try {
      // Create timeout for each mutation (10 seconds max)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const fileEntries = files.filter((f) => f.mutationId === m.id);

      if (["insert", "INSERT"].includes(m.type)) {
        let payload = replaceTempIds(m.payload || {});
        if (payload?.id?.startsWith("__tmp_")) delete payload.id;
        // Best-effort server-side duplicate detection to avoid duplicate inserts
        try {
          if (m.table === 'students') {
            const fn = (payload.full_name || '').trim();
            const grade = payload.grade;
            const school = payload.school_id || payload.schoolId || null;
            if (fn && grade) {
              const q = api.from('students').select('id').eq('full_name', fn).eq('grade', grade);
              if (school) q.eq('school_id', school);
              const resp = await q.limit(1).maybeSingle();
              const existingId = resp?.data?.id || (Array.isArray(resp?.data) && resp.data[0]?.id) || null;
              if (existingId) {
                // Convert this insert into an update against the existing record
                payload.id = existingId;
                // perform update instead of insert
                try {
                  for (const fe of fileEntries) {
                    try {
                      const url = await UploadFileHelper(fe.file, m.table, existingId);
                      payload[fe.fieldName] = url;
                    } catch (err) {
                      console.error('File upload failed during dedupe-update:', err);
                    }
                  }
                  await api.from(m.table).update(payload).eq('id', existingId);
                  clearTimeout(timeoutId);

                  const tableCache = await getTable(m.table);
                  const updated = (tableCache || []).map((r) => (r.id === existingId ? { ...r, ...payload } : r));
                  await cacheTable(m.table, updated);
                  await deleteFilesForMutation(m.id);
                  succeeded.push(m.id);
                  console.log(`[tableCache] ✓ Converted insert -> update for existing ${m.table} ${existingId}`);
                  continue; // move to next mutation
                } catch (uerr) {
                  console.warn('[tableCache] dedupe update failed, will try insert:', uerr?.message || uerr);
                  // fall-through to attempt insert
                }
              }
            }
          }

          if (m.table === 'workers' && payload && payload.id_number) {
            const resp = await api.from('workers').select('id').eq('id_number', payload.id_number).limit(1).maybeSingle();
            const existingId = resp?.data?.id || (Array.isArray(resp?.data) && resp.data[0]?.id) || null;
            if (existingId) {
              payload.id = existingId;
              try {
                for (const fe of fileEntries) {
                  try {
                    const url = await UploadFileHelper(fe.file, m.table, existingId);
                    payload[fe.fieldName] = url;
                  } catch (err) {
                    console.error('File upload failed during dedupe-update:', err);
                  }
                }
                await api.from(m.table).update(payload).eq('id', existingId);
                clearTimeout(timeoutId);

                const tableCache = await getTable(m.table);
                const updated = (tableCache || []).map((r) => (r.id === existingId ? { ...r, ...payload } : r));
                await cacheTable(m.table, updated);
                await deleteFilesForMutation(m.id);
                succeeded.push(m.id);
                console.log(`[tableCache] ✓ Converted worker insert -> update for existing worker ${existingId}`);
                continue; // move to next mutation
              } catch (uerr) {
                console.warn('[tableCache] dedupe worker update failed, will try insert:', uerr?.message || uerr);
                // fall-through
              }
            }
          }
        } catch (dedupeErr) {
          console.warn('[tableCache] dedupe check failed:', dedupeErr?.message || dedupeErr);
          // proceed with insert attempt
        }

        let insertQuery = api.from(m.table).insert(payload);
        
        // Add abort signal if supported
        if (typeof insertQuery.abortSignal === 'function') {
          insertQuery = insertQuery.abortSignal(controller.signal);
        }

        // support Supabase returning .select().single() or array
        let insertResult;
        try {
          insertResult = await insertQuery.select().single();
        } catch {
          const r = await insertQuery.select();
          insertResult = { data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error };
        }

        clearTimeout(timeoutId);

        const { data, error } = insertResult || {};
        if (error) throw error;

        const serverRow = data;
        const newId = serverRow?.id;
        const tempId = findTempIdInPayload(m.payload);
        if (tempId && newId) idMap[tempId] = newId;

        const fileUpdates = {};
        for (const fe of fileEntries) {
          try {
            const url = await UploadFileHelper(fe.file, m.table, newId);
            fileUpdates[fe.fieldName] = url;
          } catch (err) {
            console.error("File upload failed:", err);
          }
        }

        if (Object.keys(fileUpdates).length) {
          await api.from(m.table).update(fileUpdates).eq("id", newId);
        }

        // update table cache: replace tempId rows with serverRow or append
        const tableCache = await getTable(m.table);
        const updated = (tableCache || []).map((r) =>
          idMap[r.id] ? (r.id === tempId ? serverRow : r) : r
        );
        const found = updated.some((r) => r.id === newId);
        if (!found) updated.push(serverRow);

        // persist updated cache
        await cacheTable(m.table, updated);

        await deleteFilesForMutation(m.id);
        succeeded.push(m.id);
        
        console.log(`[tableCache] ✓ Synced mutation ${m.id} (${m.type} ${m.table})`);
      } else if (["update", "UPDATE"].includes(m.type)) {
        const resolved = replaceTempIds(m.payload || {});
        const id = resolved.id;
        const updateData = resolved.data ?? resolved;

        for (const fe of fileEntries) {
          const url = await UploadFileHelper(fe.file, m.table, id);
          updateData[fe.fieldName] = url;
        }

        await api.from(m.table).update(updateData).eq("id", id);
        clearTimeout(timeoutId);

        const tableCache = await getTable(m.table);
        const updated = (tableCache || []).map((r) =>
          r.id === id ? { ...r, ...updateData } : r
        );
        await cacheTable(m.table, updated);
        await deleteFilesForMutation(m.id);
        succeeded.push(m.id);
        
        console.log(`[tableCache] ✓ Synced mutation ${m.id} (${m.type} ${m.table})`);
      } else if (["delete", "DELETE"].includes(m.type)) {
        const resolved = replaceTempIds(m.payload || {});
        const id = resolved.id;
        await api.from(m.table).delete().eq("id", id);
        clearTimeout(timeoutId);
        
        const tableCache = await getTable(m.table);
        const filtered = (tableCache || []).filter((r) => r.id !== id);
        await cacheTable(m.table, filtered);
        await deleteFilesForMutation(m.id);
        succeeded.push(m.id);
        
        console.log(`[tableCache] ✓ Synced mutation ${m.id} (${m.type} ${m.table})`);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn(`[tableCache] ✗ Mutation ${m.id} timed out (10s) - will retry later`);
        failed.push({ id: m.id, reason: 'timeout' });
      } else {
        console.error(`[tableCache] ✗ Sync error for mutation ${m.id}:`, err.message);
        failed.push({ id: m.id, reason: err.message });
        // Persist failure metadata on the mutation record so UI can show retries/diagnostics
        try {
          const dbu = await getDB();
          const txu = dbu.transaction('mutations', 'readwrite');
          const existing = await txu.store.get(m.id);
          if (existing) {
            existing.attempts = (existing.attempts || 0) + 1;
            existing.lastError = String(err.message || err);
            existing.lastAttempt = Date.now();
            await txu.store.put(existing, m.id);
          }
          await txu.done;
        } catch (uerr) {
          console.warn('[tableCache] failed to persist mutation failure metadata', uerr);
        }
      }
      
      notifyChannel({
        type: "sync-error",
        table: m.table,
        mutationKey: m.id,
        error: String(err),
        attempts: (m.attempts || 0) + 1,
      });
      // don't throw — continue other mutations
    }
  }

  console.log(`[tableCache] Sync complete: ${succeeded.length} succeeded, ${failed.length} failed`);
  if (failed.length > 0) {
    console.log('[tableCache] Failed mutations will be retried on next sync');
  }

  // Remove succeeded mutations
  const db = await getDB();
  if (succeeded.length) {
    const tx = db.transaction("mutations", "readwrite");
    for (const keyToRemove of succeeded) await tx.store.delete(keyToRemove);
    await tx.done;
  }

  // Remove orphaned file entries
  const txf = db.transaction("files", "readwrite");
  const allFiles = await txf.store.getAll();
  const keysFiles = await txf.store.getAllKeys();
  for (let i = 0; i < allFiles.length; i++) {
    if (succeeded.includes(allFiles[i]?.mutationId)) {
      await txf.store.delete(keysFiles[i]);
    }
  }
  await txf.done;

  notifyChannel({ type: "synced", timestamp: Date.now(), tempIdMap: idMap });
  return idMap;
}

/* ------------------------ Helper mutation utils -------------------- */

async function deleteFilesForMutation(mutationId) {
  const db = await getDB();
  const tx = db.transaction("files", "readwrite");
  const all = await tx.store.getAll();
  const keys = await tx.store.getAllKeys();
  const toDelete = [];
  all.forEach((v, i) => {
    if (v.mutationId === mutationId) toDelete.push(keys[i]);
  });
  for (const k of toDelete) await tx.store.delete(k);
  await tx.done;
}

function findTempIdInPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.id?.startsWith("__tmp_")) return payload.id;
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "string" && v.startsWith("__tmp_")) return v;
  }
  return null;
}

/* ------------------------- BroadcastChannel ------------------------ */
const bc =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel("offline-sync")
    : null;

function notifyChannel(msg) {
  try {
    if (bc) bc.postMessage(msg);
  } catch (err) {
    console.warn("BroadcastChannel post failed", err);
  }
}

/* ----------------------- Background sync runner -------------------- */
/**
 * attemptBackgroundSync:
 * - Checks real connectivity before attempting sync
 * - Uses debouncing and exponential backoff to avoid hammering fake WiFi connections
 * - If offline or no real internet => do nothing
 */
let bgSyncRunning = false;
let lastBgSync = 0;
let bgSyncRetryTimeout = null;
let consecutiveFailures = 0;

/** Minimum interval between auto-sync attempts (ms) */
const BG_SYNC_MIN_INTERVAL = 10 * 1000; // 10s (to avoid hammering fake WiFi)

/**
 * Check if we have real internet connectivity (not just WiFi connection)
 */
async function checkRealConnectivity() {
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    // First try a same-origin lightweight fetch (more reliable behind captive portals)
    const sameOriginUrl = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? `${window.location.origin}/favicon.ico`
      : null;

    if (sameOriginUrl) {
      try {
        await fetch(sameOriginUrl, { method: 'GET', cache: 'no-cache', signal: controller.signal });
        clearTimeout(timeoutId);
        return true;
      } catch (e) {
        // ignore and fall back to external check
        console.warn('[tableCache] same-origin connectivity check failed, falling back to external check:', e?.message || e);
      }
    }

    // Fallback: external resource (may be blocked in some networks)
    try {
      await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return true; // Successfully connected
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('[tableCache] external connectivity check failed:', err?.message || err);
      return false;
    }

  } catch (err) {
    console.warn('[tableCache] Real connectivity check failed (outer):', err?.message || err);
    return false; // No real internet
  }
}

export async function attemptBackgroundSync({ force = false } = {}) {
  const now = Date.now();
  
  // Quick checks before expensive operations
  if (bgSyncRunning) {
    console.log('[tableCache] Sync already running, skipping');
    return;
  }
  
  if (!force && now - lastBgSync < BG_SYNC_MIN_INTERVAL) {
    console.log('[tableCache] Sync called too soon, debouncing');
    return;
  }

  // Check real connectivity first
  const hasInternet = await checkRealConnectivity();
  if (!hasInternet && !force) {
    console.log('[tableCache] No real internet connectivity, skipping sync');
    consecutiveFailures++;
    return;
  }

  bgSyncRunning = true;
  console.log('[tableCache] Starting background sync...');
  
  try {
    const idMap = await syncMutations();
    lastBgSync = Date.now();
    consecutiveFailures = 0; // Reset on success
    notifyChannel({ type: "synced", tempIdMap: idMap });
    console.log('[tableCache] Background sync completed successfully');
  } catch (err) {
    consecutiveFailures++;
    console.warn(`[tableCache] Background sync failed (attempt ${consecutiveFailures}):`, err.message);
    
    // Exponential backoff: wait longer after each failure
    const backoffDelay = Math.min(
      2000 * Math.pow(2, consecutiveFailures - 1), // 2s, 4s, 8s, 16s...
      60000 // Max 1 minute
    );
    
    if (bgSyncRetryTimeout) clearTimeout(bgSyncRetryTimeout);
    bgSyncRetryTimeout = setTimeout(() => {
      bgSyncRunning = false;
      console.log(`[tableCache] Retrying sync after ${backoffDelay}ms backoff...`);
      attemptBackgroundSync();
    }, backoffDelay + Math.random() * 1000);
  } finally {
    bgSyncRunning = false;
  }
}

/* Auto-run sync when the browser goes online */
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    attemptBackgroundSync({ force: true });
  });

  // Also respond to BroadcastChannel 'synced' messages from other tabs
  if (bc) {
    bc.addEventListener("message", (ev) => {
      if (!ev?.data) return;
      if (ev.data.type === "queued") {
        // other tab queued something -> try to sync
        attemptBackgroundSync({ force: false });
      } else if (ev.data.type === "synced") {
        // remote tab synced -> we can refresh relevant caches (consumer handles getting from tables)
        notifyChannel({ type: "peer-synced", tempIdMap: ev.data.tempIdMap || {} });
      }
    });
  }
}

/* --------------------------- Cached files ------------------------- */
export async function cacheFiles(key, files) {
  const db = await getDB();
  const tx = db.transaction("cached_files", "readwrite");
  const payload = { key: String(key), files, timestamp: Date.now() };
  try {
    // If the object store uses a keyPath, ensure the payload contains that keyPath value
    const store = tx.store;
    try {
      const kp = store.keyPath;
      if (kp) {
        // support compound keyPath (array) or single keyPath
        if (Array.isArray(kp)) {
          // for compound keys, we won't try to populate — rely on explicit key param
        } else if (!(kp in payload)) {
          // set the required keyPath value so put(payload) won't fail
          payload[kp] = payload.key;
        }
      }
    } catch (inner) {
      // ignore introspection errors
    }

    // Try to put using explicit key (works for both autoIncrement and keyPath stores)
    try {
      await tx.store.put(payload, payload.key);
    } catch (err) {
      // If explicit-key put fails, attempt to put the payload (we ensured keyPath is present above)
      await tx.store.put(payload);
    }

    await tx.done;
  } catch (err) {
    console.error('[tableCache] cacheFiles failed:', err);
    throw err;
  }
}

export async function getCachedFiles(key) {
  const db = await getDB();
  const tx = db.transaction("cached_files");
  const entry = await tx.store.get(key);
  return entry?.files || null;
}

/* -------------------- Developer utility: reset DB ------------------ */
/** Reset the entire offline DB manually (developer use; doesn't run in normal flows) */
export async function resetOfflineDB() {
  console.warn("[offlineDB] resetOfflineDB called — clearing memory cache and tables store snapshots.");
  memoryCache.clear();
  const db = await getDB();
  // Clear core stores but keep DB version
  try {
    const tx = db.transaction(CORE_STORES, "readwrite");
    for (const s of CORE_STORES) {
      try { await tx.objectStore(s).clear(); } catch (e) {}
    }
    await tx.done;
  } catch (err) {
    console.warn("resetOfflineDB partial clear failed:", err);
  }
}

/* ----------------------- Exported for convenience ------------------ */
export default {
  getDB,
  cacheTable,
  getTable,
  queueMutation,
  getMutations,
  getFiles,
  clearMutations,
  clearFiles,
  cacheFiles,
  getCachedFiles,
  resetOfflineDB,
  syncMutations,
  getTableFiltered,
  attemptBackgroundSync,
};
