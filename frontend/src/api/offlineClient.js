// src/api/offlineClient.js
import { createClient } from '@supabase/supabase-js';
import { openDB } from 'idb';
import { getStoredAuthData } from '../auth/offlineAuth';

const DB_NAME = 'api-cache';
const DB_VERSION = 1;
const CACHE_STORE = 'responses';
const QUEUE_STORE = 'mutations';
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const store = db.createObjectStore(CACHE_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

async function cleanupCache() {
  const db = await getDB();
  const tx = db.transaction(CACHE_STORE, 'readwrite');
  const store = tx.objectStore(CACHE_STORE);
  const now = Date.now();

  for await (const cursor of store.index('timestamp')) {
    if (now - cursor.value.timestamp > MAX_CACHE_AGE) {
      store.delete(cursor.key);
    }
  }
}

async function cacheResponse(key, data) {
  const db = await getDB();
  await db.put(CACHE_STORE, {
    id: key,
    data,
    timestamp: Date.now(),
  });
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

class QueryBuilder {
  constructor(table, baseClient) {
    this.table = table;
    this.baseClient = baseClient;
    this.queryString = '*';
    this.orderField = null;
    this.orderAscending = true;
    this.filters = {};
    this.rangeStart = null;
    this.rangeEnd = null;
  }

  select(query) {
    this.queryString = query;
    return this;
  }

  order(field, { ascending = true } = {}) {
    this.orderField = field;
    this.orderAscending = ascending;
    return this;
  }

  range(start, end) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

  eq(field, value) {
    this.filters[field] = { type: 'eq', value };
    return this;
  }

  in(field, values) {
    this.filters[field] = { type: 'in', value: values };
    return this;
  }

  // Add single() method
  single() {
    this.isSingle = true;
    return this;
  }

  async maybeSingle(options = {}) {
    const res = await this.execute();
    const { data, error } = res || {};
    if (error) return { data: null, error };
    const single = Array.isArray(data) ? data[0] ?? null : data ?? null;
    return { data: single, error: null };
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    try {
      let query = this.baseClient.from(this.table).select(this.queryString);
      
      Object.entries(this.filters).forEach(([field, filter]) => {
        if (filter.type === 'in') {
          query = query.in(field, filter.value);
        } else if (filter.type === 'eq') {
          query = query.eq(field, filter.value);
        }
      });

      if (this.orderField) {
        query = query.order(this.orderField, { ascending: this.orderAscending });
      }

      if (this.rangeStart !== null && this.rangeEnd !== null) {
        query = query.range(this.rangeStart, this.rangeEnd);
      }

      // Add single() if requested
      if (this.isSingle) {
        query = query.single();
      }

      const { data, error } = await query;
      if (error) throw error;

      const cacheKey = JSON.stringify({
        table: this.table,
        query: this.queryString,
        order: this.orderField,
        ascending: this.orderAscending,
        filters: this.filters,
        range: [this.rangeStart, this.rangeEnd],
        single: this.isSingle
      });
      await cacheResponse(cacheKey, data);
      return { data, error: null };
    } catch (error) {
      console.warn('Online query failed, falling back to cache:', error);
      const cacheKey = JSON.stringify({
        table: this.table,
        query: this.queryString,
        order: this.orderField,
        ascending: this.orderAscending,
        filters: this.filters,
        range: [this.rangeStart, this.rangeEnd],
        single: this.isSingle
      });
      
      let data = await getCachedResponse(cacheKey);
      if (!data) {
        const allCacheKey = JSON.stringify({ table: this.table, query: '*' });
        data = await getCachedResponse(allCacheKey) || [];
      }

      Object.entries(this.filters).forEach(([field, filter]) => {
        if (filter.type === 'in') {
          data = data.filter(row => filter.value.includes(row[field]));
        } else if (filter.type === 'eq') {
          data = data.filter(row => row[field] === filter.value);
        }
      });

      if (this.orderField) {
        data.sort((a, b) => {
          const aVal = a[this.orderField];
          const bVal = b[this.orderField];
          if (this.orderAscending) {
            return aVal > bVal ? 1 : -1;
          }
          return aVal < bVal ? 1 : -1;
        });
      }

      if (this.rangeStart !== null && this.rangeEnd !== null) {
        data = data.slice(this.rangeStart, this.rangeEnd + 1);
      }

      // Apply single() logic
      if (this.isSingle) {
        data = Array.isArray(data) ? data[0] ?? null : data ?? null;
      }

      return { data, error: null };
    }
  }
}

export function createOfflineClient(supabaseUrl, supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  
  // Create wrapper with offline-enhanced auth
  const wrappedAuth = {
    getUser: async () => {
      try {
        const result = await supabase.auth.getUser();
        return result;
      } catch (error) {
        const { user } = await getStoredAuthData();
        return { data: { user }, error: null };
      }
    },
    signInWithPassword: (...args) => supabase.auth.signInWithPassword(...args),
    signOut: (...args) => supabase.auth.signOut(...args),
    signUp: (...args) => supabase.auth.signUp(...args),
    resetPasswordForEmail: (...args) => supabase.auth.resetPasswordForEmail(...args),
    updateUser: (...args) => supabase.auth.updateUser(...args),
    onAuthStateChange: (...args) => supabase.auth.onAuthStateChange(...args),
    getSession: (...args) => supabase.auth.getSession(...args),
    refreshSession: (...args) => supabase.auth.refreshSession(...args),
    setSession: (...args) => supabase.auth.setSession(...args),
  };
  
  // Create a wrapper for the client using Proxy
  const wrappedClient = {
    // Intercept `from` to add offline support
    from: (table) => {
      const originalQuery = supabase.from(table);
      
      // Return a proxy that intercepts methods
      return new Proxy(originalQuery, {
        get(target, prop) {
          // Intercept select to use our offline-capable QueryBuilder
          if (prop === 'select') {
            return (query = '*') => new QueryBuilder(table, supabase).select(query);
          }
          
          // Intercept insert to add offline queueing
          if (prop === 'insert') {
            return async (data) => {
              try {
                return await target.insert(data);
              } catch (error) {
                console.warn('Insert failed, queuing for later:', error);
                await queueMutation('INSERT', table, data);
                return { error: null, data: [{ ...data, id: `offline_${Date.now()}` }] };
              }
            };
          }
          
          // Intercept update to add offline queueing
          if (prop === 'update') {
            return (data) => {
              const updateQuery = target.update(data);
              // Return proxy for chaining
              return new Proxy(updateQuery, {
                get(updateTarget, updateProp) {
                  // Allow chaining methods like eq(), match()
                  if (typeof updateTarget[updateProp] === 'function') {
                    return (...args) => {
                      const result = updateTarget[updateProp](...args);
                      // If it returns a thenable, wrap it for error handling
                      if (result && typeof result.then === 'function') {
                        return result.catch(async (error) => {
                          console.warn('Update failed, queuing for later:', error);
                          await queueMutation('UPDATE', table, { ...data, ...args });
                          return { error: null };
                        });
                      }
                      return result;
                    };
                  }
                  return updateTarget[updateProp];
                }
              });
            };
          }
          
          // Intercept delete to add offline queueing
          if (prop === 'delete') {
            return () => {
              const deleteQuery = target.delete();
              return new Proxy(deleteQuery, {
                get(deleteTarget, deleteProp) {
                  if (typeof deleteTarget[deleteProp] === 'function') {
                    return (...args) => {
                      const result = deleteTarget[deleteProp](...args);
                      if (result && typeof result.then === 'function') {
                        return result.catch(async (error) => {
                          console.warn('Delete failed, queuing for later:', error);
                          await queueMutation('DELETE', table, args);
                          return { error: null };
                        });
                      }
                      return result;
                    };
                  }
                  return deleteTarget[deleteProp];
                }
              });
            };
          }
          
          // Pass through everything else (eq, single, etc.)
          return target[prop];
        }
      });
    },
    auth: wrappedAuth,
    storage: supabase.storage,
    functions: supabase.functions,
    rpc: (...args) => supabase.rpc(...args),
  };
  
  return wrappedClient;
}

async function processMutationQueue(supabase) {
  const db = await getDB();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(QUEUE_STORE);

  let cursor = await store.openCursor();
  while (cursor) {
    const mutation = cursor.value;
    try {
      if (mutation.method === 'INSERT') {
        await supabase.from(mutation.path).insert(mutation.data);
      } else if (mutation.method === 'UPDATE') {
        const { id, ...data } = mutation.data || {};
        await supabase.from(mutation.path).update(data).eq('id', id);
      } else if (mutation.method === 'DELETE') {
        const { id } = mutation.data || {};
        await supabase.from(mutation.path).delete().eq('id', id);
      }
      await store.delete(cursor.key);
    } catch (err) {
      console.error('Failed to process queued mutation', err);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function syncOfflineChanges(supabase) {
  await processMutationQueue(supabase);
  await cleanupCache();
}