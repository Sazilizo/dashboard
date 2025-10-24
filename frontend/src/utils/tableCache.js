// src/utils/tableCache.js
import { openDB, deleteDB } from "idb";
import api from "../api/client";
import UploadFileHelper from "../components/profiles/UploadHelper";

const DB_NAME = "GCU_Schools_offline";
const BASE_VERSION = 1;
const CORE_STORES = ["tables", "mutations", "files"];

/**
 * Opens the IndexedDB safely with automatic version detection and rebuild.
 */
export async function getDB(extraStores = []) {
  const requiredStores = [...new Set([...CORE_STORES, ...extraStores])];
  let db;

  try {
    db = await openDB(DB_NAME, undefined, {
      upgrade(upgradeDb) {
        requiredStores.forEach((store) => {
          if (!upgradeDb.objectStoreNames.contains(store)) {
            const opts =
              store === "tables"
                ? { keyPath: "name" }
                : store === "mutations" || store === "files"
                ? { autoIncrement: true }
                : { keyPath: "id" };
            upgradeDb.createObjectStore(store, opts);
          }
        });
      },
    });
  } catch (err) {
    console.warn("[offlineDB] open failed — resetting DB:", err);
    // Destroy and recreate DB (best-effort recovery)
    try {
      await deleteDB(DB_NAME);
    } catch (e) {
      console.warn("[offlineDB] deleteDB failed:", e);
    }
    db = await openDB(DB_NAME, BASE_VERSION, {
      upgrade(upgradeDb) {
        requiredStores.forEach((store) => {
          const opts =
            store === "tables"
              ? { keyPath: "name" }
              : store === "mutations" || store === "files"
              ? { autoIncrement: true }
              : { keyPath: "id" };
          upgradeDb.createObjectStore(store, opts);
        });
      },
    });
  }

  // 🔹 Check for missing stores again
  const missing = requiredStores.filter((s) => !db.objectStoreNames.contains(s));
  if (missing.length) {
    console.warn(
      `[offlineDB] Missing stores (${missing.join(", ")}), rebuilding DB...`
    );
    db.close();
    await deleteDB(DB_NAME);
    db = await openDB(DB_NAME, BASE_VERSION, {
      upgrade(upgradeDb) {
        requiredStores.forEach((store) => {
          const opts =
            store === "tables"
              ? { keyPath: "name" }
              : store === "mutations" || store === "files"
              ? { autoIncrement: true }
              : { keyPath: "id" };
          upgradeDb.createObjectStore(store, opts);
        });
      },
    });
  }

  return db;
}

/** Cache any table’s rows */
export async function cacheTable(name, rows) {
  const db = await getDB([name]);
  // Keep timestamp for cleanup
  await db.put("tables", { name, rows, timestamp: Date.now() });
}

/** Get cached table data (any table) */
export async function getTable(name) {
  const db = await getDB([name]);
  const entry = await db.get("tables", name);
  return entry?.rows || [];
}

/** Queue a mutation for later sync (insert/update/delete)
 *
 * - `type` is one of 'insert' | 'update' | 'delete'
 * - `payload` may contain File/Blob fields; they are extracted to `files` store
 */
export async function queueMutation(table, type, payload) {
  const db = await getDB([table]);

  // Make a shallow copy and extract files
  const fileFields = [];
  const cleanedPayload = Array.isArray(payload) ? [...payload] : { ...payload };

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

  // store file entries linked to this mutation key for later uploading
  for (const f of fileFields) {
    await db.add("files", { mutationId: key, fieldName: f.fieldName, file: f.file });
  }

  notifyChannel({ type: "queued", table, mutationKey: key, timestamp });
  return key;
}

/** Broadcast channel for queue/sync updates */
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

/** Utilities for mutation + file handling */
export async function getMutations() {
  const db = await getDB();
  const tx = db.transaction("mutations");
  const values = await tx.store.getAll();
  const keys = await tx.store.getAllKeys();
  return values.map((v, i) => ({ id: keys[i], ...v }));
}

export async function getFiles() {
  const db = await getDB();
  const tx = db.transaction("files");
  const values = await tx.store.getAll();
  const keys = await tx.store.getAllKeys();
  return values.map((v, i) => ({ id: keys[i], ...v }));
}

/** Clear helpers */
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

/** Delete a single mutation by key */
async function deleteMutationByKey(key) {
  const db = await getDB();
  const tx = db.transaction("mutations", "readwrite");
  await tx.store.delete(key);
  await tx.done;
}

/** Delete file entries for a mutation */
async function deleteFilesForMutation(mutationId) {
  const db = await getDB();
  const tx = db.transaction("files", "readwrite");
  const idx = tx.store;
  // get all and filter (idb doesn't support complex queries easily)
  const all = await idx.getAll();
  const keys = await idx.getAllKeys();
  const toDelete = [];
  all.forEach((v, i) => {
    if (v.mutationId === mutationId) toDelete.push(keys[i]);
  });
  for (const k of toDelete) await idx.delete(k);
  await tx.done;
}

/** Full sync with Supabase
 *
 * - Processes mutations in timestamp order (FIFO)
 * - Uploads files for inserts/updates after inserting/updating rows (so we have server id)
 * - Replaces local cached rows that used temp ids (e.g., "__tmp_12345") with server rows
 * - Removes successfully processed mutations and their files from IDB
 * - Broadcasts a "synced" message with tempIdMap so UI in other tabs can remap
 */
export async function syncMutations() {
  const mutations = await getMutations();
  const files = await getFiles();

  if (!mutations?.length) {
    notifyChannel({ type: "synced", tempIdMap: {} });
    return {};
  }

  // Ensure chronological order
  mutations.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const idMap = {}; // maps tempId -> serverId
  const succeeded = [];

  // Helper to replace temp ids deeply inside an object (using idMap)
  function replaceTempIds(obj) {
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
  }

  for (const m of mutations) {
    try {
      const fileEntries = files.filter((f) => f.mutationId === m.id);

      if (m.type === "insert" || m.type === "INSERT") {
        // Replace temp ids in payload if referenced
        let payload = replaceTempIds(m.payload || {});
        // If payload itself had a client-side id, remove prior to insert
        if (payload && payload.id && typeof payload.id === "string" && payload.id.startsWith("__tmp_")) {
          delete payload.id;
        }

        // Insert and request single row back (use select().single if available)
        const insertQuery = api.from(m.table).insert(payload);
        // try to chain .select().single() safely; some wrappers may return proxy
        let insertResult;
        try {
          insertResult = await insertQuery.select().single();
        } catch (e) {
          // Fallback in case wrapper doesn't support .single() chaining
          const r = await insertQuery.select();
          insertResult = { data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error };
        }

        const { data, error } = insertResult || {};
        if (error) throw error;

        const serverRow = data;
        const newId = serverRow?.id;
        // Map temp id -> server id for later replacements
        const originalTemp = (m.payload && (m.payload.id || findTempIdInPayload(m.payload))) || null;
        if (originalTemp && newId) {
          idMap[originalTemp] = newId;
        }

        // Upload files (if any) and patch server row with file urls
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

        // update cached table: replace local temp entry with serverRow (or append)
        try {
          const tableCache = await getTable(m.table);
          const replaced = (tableCache || []).map((r) =>
            (r && typeof r.id === "string" && idMap[r.id]) ? (r.id === originalTemp ? { ...serverRow } : r) : r
          );
          // if we didn't find it, add serverRow
          const found = replaced.some((r) => r && r.id === newId);
          if (!found) replaced.push(serverRow);
          await cacheTable(m.table, replaced);
        } catch (err) {
          console.warn("Failed to update cached table after insert:", err);
        }

        // remove associated file entries and mutation if success
        await deleteFilesForMutation(m.id);
        succeeded.push(m.id);
      } else if (m.type === "update" || m.type === "UPDATE") {
        const resolved = replaceTempIds(m.payload || {});
        // payload may be { id, data } or flattened
        const id = resolved.id ?? (resolved && resolved.id) ?? null;
        const updateData = resolved.data ?? resolved;
        // Upload files for this mutation before updating if any
        for (const fe of fileEntries) {
          try {
            const url = await UploadFileHelper(fe.file, m.table, id);
            updateData[fe.fieldName] = url;
          } catch (err) {
            console.error("File upload failed for update:", err);
          }
        }
        await api.from(m.table).update(updateData).eq("id", id);

        // update cache
        try {
          const tableCache = await getTable(m.table);
          const updated = (tableCache || []).map((r) => (r && r.id === id ? { ...r, ...updateData } : r));
          await cacheTable(m.table, updated);
        } catch (err) {
          console.warn("Failed to update cached table after update:", err);
        }

        await deleteFilesForMutation(m.id);
        succeeded.push(m.id);
      } else if (m.type === "delete" || m.type === "DELETE") {
        const resolved = replaceTempIds(m.payload || {});
        const id = resolved.id ?? (resolved && resolved.id) ?? null;
        await api.from(m.table).delete().eq("id", id);

        // update cache by removing
        try {
          const tableCache = await getTable(m.table);
          const filtered = (tableCache || []).filter((r) => !(r && r.id === id));
          await cacheTable(m.table, filtered);
        } catch (err) {
          console.warn("Failed to update cached table after delete:", err);
        }

        await deleteFilesForMutation(m.id);
        succeeded.push(m.id);
      } else {
        console.warn("Unknown mutation type, skipping:", m.type);
      }
    } catch (err) {
      console.error("Sync error for mutation", m, err);
      // notify about the failure for UI to surface or for retry logic
      notifyChannel({
        type: "sync-error",
        table: m.table,
        mutationKey: m.id,
        error: String(err),
      });
      // do NOT remove this mutation; it will be retried next sync
    }
  }

  // Remove only succeeded mutations from queue
  if (succeeded.length) {
    const db = await getDB();
    const tx = db.transaction("mutations", "readwrite");
    const store = tx.store;
    const keys = await store.getAllKeys();
    const all = await store.getAll();
    // mapping keys to entries; but we already have ids in `succeeded` as numbers (mutation.id)
    for (const keyToRemove of succeeded) {
      try {
        await store.delete(keyToRemove);
      } catch (e) {
        console.warn("Failed to delete processed mutation key", keyToRemove, e);
      }
    }
    await tx.done;
  }

  // Remove file entries for succeeded mutations (redundant because we removed earlier per-mutation)
  // Clear any orphaned file entries whose mutationId was removed
  try {
    const db = await getDB();
    const txf = db.transaction("files", "readwrite");
    const storef = txf.store;
    const allFiles = await storef.getAll();
    const keysFiles = await storef.getAllKeys();
    for (let i = 0; i < allFiles.length; i++) {
      const f = allFiles[i];
      if (!f || f.mutationId == null) continue;
      // if mutation was in succeeded, delete
      if (succeeded.includes(f.mutationId)) {
        try {
          await storef.delete(keysFiles[i]);
        } catch (e) {
          // continue
        }
      }
    }
    await txf.done;
  } catch (err) {
    // non-fatal
  }

  // Broadcast mapping and synced event
  notifyChannel({ type: "synced", timestamp: Date.now(), tempIdMap: idMap });
  return idMap;
}

/** Helper: attempt to find a temp id inside a payload object (shallow) */
function findTempIdInPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.id && typeof payload.id === "string" && payload.id.startsWith("__tmp_"))
    return payload.id;
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "string" && v.startsWith("__tmp_")) return v;
  }
  return null;
}

/** Manual reset: clears the entire offline DB */
export async function resetOfflineDB() {
  try {
    await deleteDB(DB_NAME);
    console.warn("[offlineDB] Database cleared. Will rebuild on next use.");
  } catch (err) {
    console.error("[offlineDB] reset failed:", err);
  }
}
