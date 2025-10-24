// src/api/offlineClient.js
import { createClient } from "@supabase/supabase-js";
import { openDB } from "idb";
import { getStoredAuthData } from "../auth/offlineAuth";

const DB_NAME = "api-cache";
const DB_VERSION = 1;
const CACHE_STORE = "responses";
const QUEUE_STORE = "mutations";
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------
// 🔹 IndexedDB setup
// ---------------------------------------------
async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const store = db.createObjectStore(CACHE_STORE, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    },
  });
}

async function cleanupCache() {
  const db = await getDB();
  const tx = db.transaction(CACHE_STORE, "readwrite");
  const store = tx.objectStore(CACHE_STORE);
  const now = Date.now();

  for await (const cursor of store.index("timestamp")) {
    if (now - cursor.value.timestamp > MAX_CACHE_AGE) {
      store.delete(cursor.key);
    }
  }
}

async function cacheResponse(key, data) {
  const db = await getDB();
  await db.put(CACHE_STORE, { id: key, data, timestamp: Date.now() });
}

async function getCachedResponse(key) {
  const db = await getDB();
  const cached = await db.get(CACHE_STORE, key);
  return cached?.data;
}

async function queueMutation(method, path, data) {
  const db = await getDB();
  await db.add(QUEUE_STORE, {
    method,
    path,
    data,
    timestamp: Date.now(),
  });
}

// ---------------------------------------------
// 🔹 QueryBuilder (used for .select() and fallback logic)
// ---------------------------------------------
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
  }

  select(query) { this.queryString = query; return this; }
  order(field, { ascending = true } = {}) { this.orderField = field; this.orderAscending = ascending; return this; }
  range(start, end) { this.rangeStart = start; this.rangeEnd = end; return this; }
  eq(field, value) { this.filters[field] = { type: "eq", value }; return this; }
  in(field, values) { this.filters[field] = { type: "in", value: values }; return this; }
  single() { this.isSingle = true; return this; }

  async maybeSingle() {
    const res = await this.execute();
    const { data, error } = res || {};
    if (error) return { data: null, error };
    return { data: Array.isArray(data) ? data[0] ?? null : data ?? null, error: null };
  }

  then(resolve, reject) { return this.execute().then(resolve, reject); }

  async execute() {
    const cacheKey = JSON.stringify({
      table: this.table,
      query: this.queryString,
      filters: this.filters,
      order: this.orderField,
      ascending: this.orderAscending,
      range: [this.rangeStart, this.rangeEnd],
      single: this.isSingle,
    });

    try {
      let query = this.baseClient.from(this.table).select(this.queryString);
      Object.entries(this.filters).forEach(([field, filter]) => {
        if (filter.type === "in") query = query.in(field, filter.value);
        else if (filter.type === "eq") query = query.eq(field, filter.value);
      });
      if (this.orderField) query = query.order(this.orderField, { ascending: this.orderAscending });
      if (this.rangeStart !== null && this.rangeEnd !== null) query = query.range(this.rangeStart, this.rangeEnd);
      if (this.isSingle) query = query.single();

      const { data, error } = await query;
      if (error) throw error;

      await cacheResponse(cacheKey, data);
      return { data, error: null };
    } catch (error) {
      console.warn("Online query failed, using cache:", error);
      let data = await getCachedResponse(cacheKey) || [];
      Object.entries(this.filters).forEach(([field, filter]) => {
        if (filter.type === "eq") data = data.filter((row) => row[field] === filter.value);
        if (filter.type === "in") data = data.filter((row) => filter.value.includes(row[field]));
      });
      if (this.orderField) data.sort((a, b) =>
        this.orderAscending ? (a[this.orderField] > b[this.orderField] ? 1 : -1) : (a[this.orderField] < b[this.orderField] ? 1 : -1)
      );
      if (this.rangeStart !== null && this.rangeEnd !== null) data = data.slice(this.rangeStart, this.rangeEnd + 1);
      if (this.isSingle) data = Array.isArray(data) ? data[0] ?? null : data ?? null;
      return { data, error: null };
    }
  }
}

// ---------------------------------------------
// 🔹 Supabase Offline Wrapper
// ---------------------------------------------
export function createOfflineClient(supabaseUrl, supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const wrappedAuth = {
    async getUser() {
      try { return await supabase.auth.getUser(); }
      catch { const { user } = await getStoredAuthData(); return { data: { user }, error: null }; }
    },
    onAuthStateChange: (...args) => supabase.auth.onAuthStateChange(...args),
    signInWithPassword: (...args) => supabase.auth.signInWithPassword(...args),
    signOut: (...args) => supabase.auth.signOut(...args),
    refreshSession: (...args) => supabase.auth.refreshSession(...args),
    getSession: (...args) => supabase.auth.getSession(...args),
  };

  const wrapQuery = (query) => new Proxy(query, {
    get(target, prop) {
      const orig = target[prop];
      if (typeof orig !== "function") return orig;
      return (...args) => {
        try {
          const result = orig.apply(target, args);
          if (result && typeof result.then === "function") return result;
          return Promise.resolve(result);
        } catch (err) { return Promise.resolve({ data: null, error: err }); }
      };
    }
  });

  return {
    from(table) {
      const originalQuery = supabase.from(table);
      return new Proxy(originalQuery, {
        get(target, prop) {

          if (prop === "select") return (query = "*") => new QueryBuilder(table, supabase).select(query);

          if (prop === "insert") return (data) => wrapQuery(target.insert(data));
          if (prop === "upsert") return (data) => wrapQuery(target.upsert(data));

          if (prop === "update") return (data) => wrapQuery(target.update(data));
          if (prop === "delete") return () => wrapQuery(target.delete());

          return target[prop];
        },
      });
    },
    auth: wrappedAuth,
    storage: supabase.storage,
    functions: supabase.functions,
    rpc: (...args) => supabase.rpc(...args),
  };
}

// ---------------------------------------------
// 🔹 Sync queued mutations when online again
// ---------------------------------------------
async function processMutationQueue(supabase) {
  const db = await getDB();
  const tx = db.transaction(QUEUE_STORE, "readwrite");
  const store = tx.objectStore(QUEUE_STORE);

  let cursor = await store.openCursor();
  while (cursor) {
    const { method, path, data } = cursor.value;
    try {
      if (method === "INSERT") await supabase.from(path).insert(data);
      if (method === "UPSERT") await supabase.from(path).upsert(data);
      if (method === "UPDATE") { const { id, ...rest } = data || {}; await supabase.from(path).update(rest).eq("id", id); }
      if (method === "DELETE") { const [{ id }] = data || []; await supabase.from(path).delete().eq("id", id); }
      await store.delete(cursor.key);
    } catch (err) {
      console.error("Failed queued mutation:", err);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function syncOfflineChanges(supabase) {
  await processMutationQueue(supabase);
  await cleanupCache();
}
