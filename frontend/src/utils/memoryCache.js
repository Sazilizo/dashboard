// In-memory instant cache between route changes
const memoryCache = new Map();

export function setMemoryCache(table, rows) {
  memoryCache.set(table, { rows, timestamp: Date.now() });
}

export function getMemoryCache(table) {
  return memoryCache.get(table)?.rows || null;
}

export function clearMemoryCache() {
  memoryCache.clear();
}
