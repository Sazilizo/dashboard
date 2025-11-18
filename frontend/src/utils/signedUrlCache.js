import api from "../api/client";

// Simple in-memory signed URL cache with TTL. Shared across components to avoid
// repeated createSignedUrl calls which can produce many network requests.
const cache = new Map();

function makeKey(bucket, path) {
  return `${bucket}::${path}`;
}

export async function getSignedUrl(bucket, path, ttlSeconds = 240) {
  try {
    if (!bucket || !path) return null;
    const key = makeKey(bucket, path);
    const now = Date.now();
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now && entry.url) return entry.url;

    // Request a new signed URL from storage API
    const { data, error } = await api.storage.from(bucket).createSignedUrl(path, ttlSeconds + 30);
    if (error || !data?.signedUrl) return null;
    const url = data.signedUrl;
    cache.set(key, { url, expiresAt: now + ttlSeconds * 1000 });
    return url;
  } catch (err) {
    console.warn('[signedUrlCache] getSignedUrl failed', err?.message || err);
    return null;
  }
}

export function setSignedUrl(bucket, path, url, ttlSeconds = 240) {
  if (!bucket || !path || !url) return;
  const key = makeKey(bucket, path);
  const now = Date.now();
  cache.set(key, { url, expiresAt: now + ttlSeconds * 1000 });
}

export function clearSignedUrlCache() {
  cache.clear();
}

export function getSignedUrlCacheStats() {
  const now = Date.now();
  let valid = 0;
  for (const [k, v] of cache.entries()) if (v.expiresAt > now) valid++;
  return { entries: cache.size, valid };
}

export default { getSignedUrl, setSignedUrl, clearSignedUrlCache, getSignedUrlCacheStats };
