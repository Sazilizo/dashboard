import { openDB } from "idb";
import api from "../api/client";

const DB_NAME = "GCU_Schools_offline";
const DB_VERSION = 2;
const TABLE_STORE = "tables";
const MUTATION_STORE = "mutations";

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(TABLE_STORE)) {
        db.createObjectStore(TABLE_STORE, { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains(MUTATION_STORE)) {
        db.createObjectStore(MUTATION_STORE, { autoIncrement: true });
      }
    },
  });
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
  await db.add(MUTATION_STORE, { table, type, payload, timestamp: Date.now() });
}

// Get all queued mutations
export async function getMutations() {
  const db = await getDB();
  return await db.getAll(MUTATION_STORE);
}

// Clear mutations after sync
export async function clearMutations() {
  const db = await getDB();
  const tx = db.transaction(MUTATION_STORE, "readwrite");
  await tx.store.clear();
  await tx.done;
}

// Sync queued mutations to Supabase
export async function syncMutations() {
  const mutations = await getMutations();
  for (const m of mutations) {
    try {
      if (m.type === "insert") {
        await api.from(m.table).insert(m.payload);
      } else if (m.type === "update") {
        await api.from(m.table).update(m.payload.data).eq("id", m.payload.id);
      } else if (m.type === "delete") {
        await api.from(m.table).delete().eq("id", m.payload.id);
      }
    } catch (err) {
      // Optionally handle sync errors
      console.error("Sync error:", err);
    }
  }
  await clearMutations();
}