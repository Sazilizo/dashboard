import React, { useEffect, useState } from "react";
import '../../styles/profile-avatars.css';
import api from "../../api/client"; // supabase client
import { getCachedImage, cacheImage } from "../../utils/imageCache";
import signedUrlCache from "../../utils/signedUrlCache";

// restrictToProfileFolder: when true, only list `${folderName}/${id}/profile-picture` with no fallback
function Photos({ id, bucketName, folderName, photoCount = 1, restrictToProfileFolder = true }) {
  const [files, setFiles] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Try to read legacy cache used by the previous Photos implementation.
    // Legacy DB: 'image-cache-db', store 'images', key was `${bucket}/${profileFolder}` and value was the Blob.
    async function getLegacyCachedImage(bucket, keyPath) {
      try {
        if (typeof indexedDB === 'undefined') return null;
        return await new Promise((resolve) => {
          const req = indexedDB.open('image-cache-db');
          req.onsuccess = () => {
            try {
              const db = req.result;
              if (!db.objectStoreNames.contains('images')) return resolve(null);
              const tx = db.transaction('images', 'readonly');
              const store = tx.objectStore('images');
              // Try a few legacy key formats used historically
              const candidates = [
                `${bucket}/${keyPath}`,
                `${bucket}/${keyPath}`.replace(/\\/g, '/'),
                // also try the raw keyPath alone
                `${keyPath}`
              ];

              (async () => {
                for (const key of candidates) {
                  const getReq = store.get(key);
                  // wrap in promise
                  const val = await new Promise((res) => {
                    getReq.onsuccess = () => res(getReq.result);
                    getReq.onerror = () => res(null);
                  });
                  if (val) {
                    // Some older writes stored the raw Blob, others an object with `.blob`
                    if (val instanceof Blob) return resolve(val);
                    if (val && typeof val === 'object' && val.blob instanceof Blob) return resolve(val.blob);
                    // if value itself is the record that contains `blob` nested deeper
                    if (val && val.blob) return resolve(val.blob);
                    // otherwise return the whole value
                    return resolve(val);
                  }
                }
                return resolve(null);
              })();
            } catch (e) {
              resolve(null);
            }
          };
          req.onerror = () => resolve(null);
        });
      } catch (e) {
        return null;
      }
    }

    // Normalize various legacy cache shapes into a Blob
    async function normalizeCachedBlob(val) {
      try {
        if (!val) return null;
        if (val instanceof Blob) return val;
        if (val && typeof val === 'object' && val.blob instanceof Blob) return val.blob;
        // idb may return objects where the blob is under `.data` or `.body`
        if (val && val.data instanceof ArrayBuffer) return new Blob([val.data], { type: val.type || 'image/jpeg' });
        if (val && ArrayBuffer.isView && ArrayBuffer.isView(val.data)) return new Blob([val.data.buffer], { type: val.type || 'image/jpeg' });
        if (val && val instanceof ArrayBuffer) return new Blob([val], { type: 'image/jpeg' });
        if (typeof val === 'string' && val.startsWith('data:')) {
          // data URL -> fetch to blob
          try {
            const res = await fetch(val);
            return await res.blob();
          } catch (e) {
            return null;
          }
        }
        return null;
      } catch (e) {
        return null;
      }
    }
    async function fetchFilesAndUrls() {
      try {
        setLoading(true);
        const profileFolder = `${folderName}/${id}/profile-picture`;
        const cacheKey = `${bucketName}/${profileFolder}`;

        // Try to load cached image first for instant display (uses shared imageCache)
        let cachedBlob = await getCachedImage(bucketName, profileFolder);
        // fallback to legacy cache if new cache missed (older app versions used a different DB/key)
        if (!cachedBlob) {
          cachedBlob = await getLegacyCachedImage(bucketName, profileFolder);
        }
        if (cachedBlob) {
          // normalize legacy/cache shapes into a Blob
          const blob = await normalizeCachedBlob(cachedBlob) || cachedBlob;
          console.log('[Photos] Using cached image for', id);
          const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'image/jpeg' }));
          setFiles([{ name: 'cached-image', cached: true }]);
          setSignedUrls({ 'cached-image': url });
          // migrate legacy blob into new imageCache for future loads
          try { cacheImage(bucketName, `${folderName}/${id}/profile-picture/profile.jpg`, blob, id).catch(()=>{}); } catch(e) {}
          setLoading(false);
          // still continue to refresh when online
        }

        // Check if online
        const isOnline = navigator.onLine;
        
        if (!isOnline) {
          // Offline - use cached only
          if (!cachedBlob) {
            setFiles([]);
            setSignedUrls({});
          }
          setLoading(false);
          return;
        }

        // Online - fetch fresh images
        let { data: dataPrimary, error: errorPrimary } = await api.storage
          .from(bucketName)
          .list(profileFolder, { limit: 100 });

        if (errorPrimary) {
          console.warn("[Photos] Error listing profile pictures:", errorPrimary.message);
          setError(errorPrimary.message);
          setLoading(false);
          return;
        }

        // Helper to filter to likely file entries only
        const toImageFiles = (arr) =>
          (arr || [])
            .filter((f) => !!f?.name && f.name !== ".emptyFolderPlaceholder")
            .filter((f) => {
              const isFileByMeta = typeof f?.metadata?.size === "number";
              const lower = String(f.name).toLowerCase();
              const isImageExt = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".heic"].some((ext) =>
                lower.endsWith(ext)
              );
              return isFileByMeta || isImageExt;
            });

        let imageFiles = toImageFiles(dataPrimary);

        // Optional fallback: only when explicitly allowed
        if (!restrictToProfileFolder && !imageFiles.length) {
          const recordRoot = `${folderName}/${id}`;
          const { data: dataFallback, error: errorFallback } = await api.storage
            .from(bucketName)
            .list(recordRoot, { limit: 100 });

          if (errorFallback) {
            console.warn("[Photos] Error listing record root:", errorFallback.message);
          } else {
            imageFiles = toImageFiles(dataFallback);
          }
        }

        if (!imageFiles.length) {
          setFiles([]);
          setSignedUrls({});
          setLoading(false);
          return;
        }

        // Sort by created_at desc if available, else by name
        const sortedFiles = imageFiles
          .sort((a, b) => (new Date(b.created_at || 0) - new Date(a.created_at || 0)) || (String(b.name).localeCompare(String(a.name))))
          .slice(0, photoCount);

        setFiles(sortedFiles);

        // Build signed URLs using shared signed URL cache and fetch blobs to populate persistent cache
        const urls = {};
        const cachePromises = [];

        for (let i = 0; i < sortedFiles.length; i++) {
          const f = sortedFiles[i];
          const path = `${folderName}/${id}/profile-picture/${f.name}`;

          // prefer persistent cache (new DB)
          let cached = await getCachedImage(bucketName, path);
          // fallback to legacy cache which may have stored folder-level blobs
          if (!cached) cached = await getLegacyCachedImage(bucketName, `${folderName}/${id}/profile-picture`);
          if (cached) {
            const blob = await normalizeCachedBlob(cached) || cached;
            urls[f.name] = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'image/jpeg' }));
            // migrate this blob into the new imageCache under the canonical path
            try { cacheImage(bucketName, path, blob, id).catch(()=>{}); } catch(e) {}
            continue;
          }

          // acquire signed url from central cache
          const signed = await signedUrlCache.getSignedUrl(bucketName, path, 3600);
          if (!signed) continue;
          urls[f.name] = signed;

          // fetch and persist blob in background
          cachePromises.push(
            fetch(signed)
              .then(res => res.blob())
              .then(blob => cacheImage(bucketName, path, blob, id).catch(() => false))
              .catch(err => console.warn('[Photos] Failed to fetch/cache image:', err))
          );
        }

        // run cache promises in background
        Promise.all(cachePromises).catch(err => console.warn('[Photos] Caching error:', err));

        // Fallback to root signing if restricted is false and no urls produced
        if (!restrictToProfileFolder && Object.keys(urls).length === 0) {
          for (let i = 0; i < sortedFiles.length; i++) {
            const f = sortedFiles[i];
            const path = `${folderName}/${id}/${f.name}`;
            const signed = await signedUrlCache.getSignedUrl(bucketName, path, 3600);
            if (signed) urls[f.name] = signed;
          }
        }

        setSignedUrls(urls);
        setLoading(false);
      } catch (err) {
        console.error("[Photos] Failed to fetch photos:", err);
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    if (id && bucketName && folderName) fetchFilesAndUrls();

    return () => { cancelled = true; };
  }, [id, bucketName, folderName, photoCount, restrictToProfileFolder]);
  
  // If no image is available (or still loading), render nothing so the
  // parent can decide the layout instead of showing a grey placeholder.
  if (loading && !files.length) return null;
  if (!files.length) return null;

  // Return the first available image element only. Parent components
  // should provide an outer wrapper/placeholder to control sizing.
  for (const file of files) {
    const url = signedUrls[file.name];
    if (!url) continue;
    return (
      <img
        src={url}
        alt={file.name}
        loading="lazy"
        className="avatar-img"
        onError={(e) => {
          console.warn('[Photos] Image load error for', file.name);
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  }

  return null;
}

export default Photos;
