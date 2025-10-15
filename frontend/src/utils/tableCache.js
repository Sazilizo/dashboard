import { openDB } from "idb";
import api from "../api/client";
import UploadFileHelper from "../components/profiles/UploadHelper";

const DB_NAME = "GCU_Schools_offline";
const DB_VERSION = 2;
const TABLE_STORE = "tables";
const MUTATION_STORE = "mutations";
const FILE_STORE = "files";

export async function getDB() {
  // Attempt to open at our target version. If the existing DB is at a higher
  // version this will throw; in that case fall back to opening the DB at its
  // current version (no upgrade). After we have a DB handle we check for any
  // missing stores and perform a controlled version bump (+1) to create them.
  let db;
  try {
    db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(upgradeDb) {
        if (!upgradeDb.objectStoreNames.contains(TABLE_STORE)) {
          upgradeDb.createObjectStore(TABLE_STORE, { keyPath: "name" });
        }
        if (!upgradeDb.objectStoreNames.contains(MUTATION_STORE)) {
          upgradeDb.createObjectStore(MUTATION_STORE, { autoIncrement: true });
        }
        if (!upgradeDb.objectStoreNames.contains(FILE_STORE)) {
          upgradeDb.createObjectStore(FILE_STORE, { autoIncrement: true });
        }
      },
    });
  } catch (err) {
    // If the error is due to requesting a lower version than the existing DB,
    // fall back to opening without specifying a version so we can inspect the
    // current DB and decide whether an upgrade is actually necessary.
    try {
      db = await openDB(DB_NAME);
    } catch (err2) {
      // Re-throw the original error if we can't open the DB.
      throw err2 || err;
    }
  }

  // If some stores are missing (possible when the DB was created elsewhere
  // with a higher version that didn't include our stores), bump the version
  // by one and create only the missing stores.
  const requiredStores = [TABLE_STORE, MUTATION_STORE, FILE_STORE];
  const missing = requiredStores.filter((s) => !db.objectStoreNames.contains(s));
  if (missing.length) {
    const newVersion = db.version + 1;
    console.info(`[tableCache] DB missing stores ${missing.join(",")}, bumping version ${db.version} -> ${newVersion}`);
    db.close();
    db = await openDB(DB_NAME, newVersion, {
      upgrade(upgradeDb) {
        if (!upgradeDb.objectStoreNames.contains(TABLE_STORE)) {
          upgradeDb.createObjectStore(TABLE_STORE, { keyPath: "name" });
        }
        if (!upgradeDb.objectStoreNames.contains(MUTATION_STORE)) {
          upgradeDb.createObjectStore(MUTATION_STORE, { autoIncrement: true });
        }
        if (!upgradeDb.objectStoreNames.contains(FILE_STORE)) {
          upgradeDb.createObjectStore(FILE_STORE, { autoIncrement: true });
        }
      },
    });
  }

  return db;
}

// Cache table data
export async function cacheTable(name, rows) {
  const db = await getDB();
  await db.put(TABLE_STORE, { name, rows });
}

// Get cached table data
export async function getTable(name) {
  const db = await getDB();
  const entry = await db.get(TABLE_STORE, name);
  return entry?.rows || [];
}

// Queue mutation (insert/update/delete)
export async function queueMutation(table, type, payload) {
  const db = await getDB();

  // Separate file/blob fields and store them in FILE_STORE, keep placeholders in payload
  const fileFields = [];
  const cleanedPayload = Array.isArray(payload) ? [...payload] : { ...payload };

  Object.entries(payload || {}).forEach(([key, value]) => {
    // Detect File/Blob (File inherits from Blob in browsers)
    if (value instanceof Blob || (value && value instanceof File)) {
      // replace with placeholder; actual blob stored separately
      cleanedPayload[key] = { __file_pending: true };
      fileFields.push({ fieldName: key, file: value });
    }
  });

  const timestamp = Date.now();
  const key = await db.add(MUTATION_STORE, { table, type, payload: cleanedPayload, timestamp });

  // store files referencing the mutation key
  for (const f of fileFields) {
    await db.add(FILE_STORE, { mutationId: key, fieldName: f.fieldName, file: f.file });
  }

  // return the mutation key so callers can reference it if needed
  // notify UI about new queued mutation
  notifyChannel({ type: "queued", table, mutationKey: key, timestamp });
  return key;
}

// Broadcast channel for notifying UI about queue/sync changes
const bc = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("offline-sync") : null;

function notifyChannel(msg) {
  try {
    if (bc) bc.postMessage(msg);
  } catch (err) {
    console.warn("BroadcastChannel post failed", err);
  }
}

// Get all queued mutations
export async function getMutations() {
  const db = await getDB();
  const tx = db.transaction(MUTATION_STORE);
  const values = await tx.store.getAll();
  const keys = await tx.store.getAllKeys();
  return values.map((v, i) => ({ id: keys[i], ...v }));
}

export async function getFiles() {
  const db = await getDB();
  const tx = db.transaction(FILE_STORE);
  const values = await tx.store.getAll();
  const keys = await tx.store.getAllKeys();
  return values.map((v, i) => ({ id: keys[i], ...v }));
}

// Clear mutations after sync
export async function clearMutations() {
  const db = await getDB();
  const tx = db.transaction(MUTATION_STORE, "readwrite");
  await tx.store.clear();
  await tx.done;
}

export async function clearFiles() {
  const db = await getDB();
  const tx = db.transaction(FILE_STORE, "readwrite");
  await tx.store.clear();
  await tx.done;
}

// Sync queued mutations to Supabase
export async function syncMutations() {
  const mutations = await getMutations();
  const files = await getFiles();
  // Process mutations in chronological order and keep a map of client-temp ids
  // to server ids so subsequent queued mutations referencing temp ids are
  // rewritten to the real ids before being sent to the server.
  mutations.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const idMap = {};

  function replaceTempIds(obj) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      return obj.map((v) => (typeof v === "string" && v.startsWith("__tmp_") ? idMap[v] ?? v : replaceTempIds(v)));
    }
    const out = Array.isArray(obj) ? [] : {};
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
      // find files linked to this mutation
      const fileEntries = files.filter((f) => f.mutationId === m.id);
      if (m.type === "insert") {
        // remove file placeholders from payload for initial insert
        let payload = { ...m.payload };
        // Replace any temp ids in payload with mapped ids if known
        payload = replaceTempIds(payload);
        // If the payload contains a client-temp id, delete it so the server
        // will generate a numeric id (and avoid sending a string to an int column).
        if (payload.id && typeof payload.id === "string" && payload.id.startsWith("__tmp_")) {
          const origTemp = payload.id;
          delete payload.id;

          const { data, error } = await api.from(m.table).insert(payload).select().single();
          if (error) throw error;
          const newId = data?.id;
          if (newId !== undefined && origTemp) {
            idMap[origTemp] = newId;
          }

          // upload files and then update record with URLs
          const fileUpdates = {};
          for (const fe of fileEntries) {
            try {
              const url = await UploadFileHelper(fe.file, m.table, newId);
              fileUpdates[fe.fieldName] = url;
            } catch (err) {
              console.error("File upload during sync failed:", err);
            }
          }
          if (Object.keys(fileUpdates).length) {
            await api.from(m.table).update(fileUpdates).eq("id", newId);
          }
        } else {
          // No temp id present: normal insert
          const payloadNoFiles = { ...replaceTempIds(m.payload) };
          fileEntries.forEach((fe) => delete payloadNoFiles[fe.fieldName]);
          const { data, error } = await api.from(m.table).insert(payloadNoFiles).select().single();
          if (error) throw error;
          const newId = data?.id;
          const fileUpdates = {};
          for (const fe of fileEntries) {
            try {
              const url = await UploadFileHelper(fe.file, m.table, newId);
              fileUpdates[fe.fieldName] = url;
            } catch (err) {
              console.error("File upload during sync failed:", err);
            }
          }
          if (Object.keys(fileUpdates).length) {
            await api.from(m.table).update(fileUpdates).eq("id", newId);
          }
        }
      } else if (m.type === "update") {
        // m.payload may be { id, data } or plain object
        // Replace temp ids in payload first
        const resolvedPayload = replaceTempIds(m.payload);
        const id = resolvedPayload.id || resolvedPayload?.data?.id;
        const updateData = resolvedPayload.data ? { ...resolvedPayload.data } : { ...resolvedPayload };

        for (const fe of fileEntries) {
          try {
            // upload files; if id is still a temp id (shouldn't be if inserts processed before updates), this will error
            const actualId = id && typeof id === "string" && id.startsWith("__tmp_") ? idMap[id] : id;
            const url = await UploadFileHelper(fe.file, m.table, actualId);
            updateData[fe.fieldName] = url;
          } catch (err) {
            console.error("File upload during sync failed:", err);
          }
        }

        if (id) {
          const actualId = typeof id === "string" && id.startsWith("__tmp_") ? idMap[id] : id;
          if (actualId === undefined || actualId === null) {
            throw new Error(`Missing mapping for temp id ${id} while processing update`);
          }
          await api.from(m.table).update(updateData).eq("id", actualId);
        } else {
          // fallback: try update with whatever is in payload
          await api.from(m.table).update(updateData);
        }
      } else if (m.type === "delete") {
        const resolved = replaceTempIds(m.payload);
        const idToDelete = resolved.id;
        const actualId = typeof idToDelete === "string" && idToDelete.startsWith("__tmp_") ? idMap[idToDelete] : idToDelete;
        if (actualId === undefined || actualId === null) {
          throw new Error(`Missing mapping for temp id ${idToDelete} while processing delete`);
        }
        await api.from(m.table).delete().eq("id", actualId);
      }
    } catch (err) {
      // Optionally handle sync errors per-mutation
      console.error("Sync error:", err);
      notifyChannel({ type: "sync-error", table: m.table, mutationKey: m.id, error: String(err) });
    }
  }

  // clear both mutations and file entries after attempting sync
  await clearMutations();
  await clearFiles();
  notifyChannel({ type: "synced", timestamp: Date.now() });
}