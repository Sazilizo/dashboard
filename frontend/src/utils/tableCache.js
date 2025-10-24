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

  // 🔹 Check for missing stores again
  const missing = requiredStores.filter((s) => !db.objectStoreNames.contains(s));
  if (missing.length) {
    console.warn(`[offlineDB] Missing stores (${missing.join(", ")}), rebuilding DB...`);
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
  await db.put("tables", { name, rows });
}

/** Get cached table data (any table) */
export async function getTable(name) {
  const db = await getDB([name]);
  const entry = await db.get("tables", name);
  return entry?.rows || [];
}

/** Queue a mutation for later sync (insert/update/delete) */
export async function queueMutation(table, type, payload) {
  const db = await getDB([table]);

  const fileFields = [];
  const cleanedPayload = Array.isArray(payload)
    ? [...payload]
    : { ...payload };

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

/** Full sync with Supabase */
export async function syncMutations() {
  const mutations = await getMutations();
  const files = await getFiles();

  mutations.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const idMap = {};

  function replaceTempIds(obj) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      return obj.map((v) =>
        typeof v === "string" && v.startsWith("__tmp_")
          ? idMap[v] ?? v
          : replaceTempIds(v)
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

      if (m.type === "insert") {
        let payload = replaceTempIds(m.payload);
        if (payload.id?.startsWith("__tmp_")) delete payload.id;
        const { data, error } = await api
          .from(m.table)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;

        const newId = data?.id;
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
      } else if (m.type === "update") {
        const resolved = replaceTempIds(m.payload);
        const id = resolved.id;
        const updateData = resolved.data ?? resolved;
        for (const fe of fileEntries) {
          const url = await UploadFileHelper(fe.file, m.table, id);
          updateData[fe.fieldName] = url;
        }
        await api.from(m.table).update(updateData).eq("id", id);
      } else if (m.type === "delete") {
        const resolved = replaceTempIds(m.payload);
        await api.from(m.table).delete().eq("id", resolved.id);
      }
    } catch (err) {
      console.error("Sync error:", err);
      notifyChannel({
        type: "sync-error",
        table: m.table,
        mutationKey: m.id,
        error: String(err),
      });
    }
  }

  await clearMutations();
  await clearFiles();
  notifyChannel({ type: "synced", timestamp: Date.now() });
}

/** Manual reset: clears the entire offline DB */
export async function resetOfflineDB() {
  await deleteDB(DB_NAME);
  console.warn("[offlineDB] Database cleared. Will rebuild on next use.");
}
