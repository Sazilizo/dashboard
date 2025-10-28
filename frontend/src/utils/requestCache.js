// Request cache and deduplication layer
// Prevents duplicate API requests and caches results

const cache = new Map();
const pendingRequests = new Map();

const DEFAULT_TTL = 30000; // 30 seconds cache
const LONG_TTL = 300000; // 5 minutes for static data

/**
 * Cache key generator from query params
 */
function generateCacheKey(table, query, params = {}) {
  return JSON.stringify({ table, query, params, timestamp: Math.floor(Date.now() / DEFAULT_TTL) });
}

/**
 * Deduplicated fetch - if same request is in flight, return the existing promise
 */
export async function cachedFetch(key, fetchFn, ttl = DEFAULT_TTL) {
  const now = Date.now();
  
  // Check cache first
  const cached = cache.get(key);
  if (cached && now - cached.timestamp < ttl) {
    console.log('[RequestCache] Cache HIT:', key.slice(0, 100));
    return cached.data;
  }

  // Check if request is already pending
  if (pendingRequests.has(key)) {
    console.log('[RequestCache] Deduplicating request:', key.slice(0, 100));
    return pendingRequests.get(key);
  }

  // Execute new request
  console.log('[RequestCache] Cache MISS, fetching:', key.slice(0, 100));
  const promise = fetchFn()
    .then(data => {
      cache.set(key, { data, timestamp: now });
      pendingRequests.delete(key);
      return data;
    })
    .catch(err => {
      pendingRequests.delete(key);
      throw err;
    });

  pendingRequests.set(key, promise);
  return promise;
}

/**
 * Invalidate cache for a specific key or pattern
 */
export function invalidateCache(keyPattern) {
  if (!keyPattern) {
    cache.clear();
    console.log('[RequestCache] Cleared entire cache');
    return;
  }

  let count = 0;
  for (const key of cache.keys()) {
    if (key.includes(keyPattern)) {
      cache.delete(key);
      count++;
    }
  }
  console.log(`[RequestCache] Invalidated ${count} cache entries matching:`, keyPattern);
}

/**
 * Clear expired cache entries
 */
export function cleanCache() {
  const now = Date.now();
  let count = 0;
  
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > DEFAULT_TTL * 2) {
      cache.delete(key);
      count++;
    }
  }
  
  if (count > 0) {
    console.log(`[RequestCache] Cleaned ${count} expired entries`);
  }
}

// Auto-clean every 5 minutes
setInterval(cleanCache, 300000);

export { DEFAULT_TTL, LONG_TTL, generateCacheKey };
