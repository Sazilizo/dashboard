import React, { useEffect, useState } from "react";
import api from "../../api/client"; // supabase client
import { openDB } from 'idb';

const IMAGE_CACHE_DB = 'image-cache-db';
const IMAGE_CACHE_STORE = 'images';
const CACHE_VERSION = 1;

// Open IndexedDB for image caching
async function getImageCacheDB() {
  return openDB(IMAGE_CACHE_DB, CACHE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(IMAGE_CACHE_STORE)) {
        db.createObjectStore(IMAGE_CACHE_STORE);
      }
    },
  });
}

// Cache image blob
async function cacheImage(key, blob) {
  try {
    const db = await getImageCacheDB();
    await db.put(IMAGE_CACHE_STORE, blob, key);
    console.log('[Photos] Cached image:', key);
  } catch (err) {
    console.warn('[Photos] Failed to cache image:', err);
  }
}

// Get cached image
async function getCachedImage(key) {
  try {
    const db = await getImageCacheDB();
    return await db.get(IMAGE_CACHE_STORE, key);
  } catch (err) {
    console.warn('[Photos] Failed to get cached image:', err);
    return null;
  }
}

// restrictToProfileFolder: when true, only list `${folderName}/${id}/profile-picture` with no fallback
function Photos({ id, bucketName, folderName, photoCount = 1, restrictToProfileFolder = true }) {
  const [files, setFiles] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFilesAndUrls() {
      try {
        setLoading(true);
        const profileFolder = `${folderName}/${id}/profile-picture`;
        const cacheKey = `${bucketName}/${profileFolder}`;

        // Try to load cached image first for instant display
        const cachedBlob = await getCachedImage(cacheKey);
        if (cachedBlob) {
          console.log('[Photos] Using cached image for', id);
          const url = URL.createObjectURL(cachedBlob);
          setFiles([{ name: 'cached-image', cached: true }]);
          setSignedUrls({ 'cached-image': url });
          setLoading(false);
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

        // Create signed URLs per-file
        const paths = sortedFiles.map((f) => `${profileFolder}/${f.name}`);
        const signedResults = await Promise.all(
          paths.map((p) => api.storage.from(bucketName).createSignedUrl(p, 3600))
        );

        const urls = {};
        const cachePromises = [];

        for (let idx = 0; idx < signedResults.length; idx++) {
          const r = signedResults[idx];
          if (!r.error && r.data?.signedUrl) {
            urls[sortedFiles[idx].name] = r.data.signedUrl;
            
            // Cache the image blob for offline use
            cachePromises.push(
              fetch(r.data.signedUrl)
                .then(res => res.blob())
                .then(blob => cacheImage(cacheKey, blob))
                .catch(err => console.warn('[Photos] Failed to cache:', err))
            );
          }
        }

        // Wait for caching to complete in background
        Promise.all(cachePromises).catch(err => console.warn('[Photos] Caching error:', err));

        // Fallback to root signing if restricted is false
        if (!restrictToProfileFolder && Object.keys(urls).length === 0) {
          const fallbackPaths = sortedFiles.map((f) => `${folderName}/${id}/${f.name}`);
          const fallbackResults = await Promise.all(
            fallbackPaths.map((p) => api.storage.from(bucketName).createSignedUrl(p, 3600))
          );
          fallbackResults.forEach((r, idx) => {
            if (!r.error && r.data?.signedUrl) {
              urls[sortedFiles[idx].name] = r.data.signedUrl;
            }
          });
        }

        setSignedUrls(urls);
        setLoading(false);
      } catch (err) {
        console.error("[Photos] Failed to fetch photos:", err);
        setError(err.message);
        setLoading(false);
      }
    }

    if (id && bucketName && folderName) fetchFilesAndUrls();
  }, [id, bucketName, folderName, photoCount, restrictToProfileFolder]);

  if (error && !files.length) {
    return <div className="text-red-500 text-sm">Error loading images</div>;
  }
  
  if (loading && !files.length) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded overflow-hidden">
        <span className="text-gray-400 text-xs">Loading...</span>
      </div>
    );
  }
  
  if (!files.length) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded overflow-hidden">
        <span className="text-gray-500 text-sm">No image</span>
      </div>
    );
  }

  return (
    <div className="">
      {files.map((file) => {
        const url = signedUrls[file.name];
        if (!url) return null;
        return (
          <div
            key={file.name}
            className=""
          >
            <img
              src={url}
              alt={file.name}
              loading="lazy"
              className=""
              onError={(e) => {
                console.warn('[Photos] Image load error for', file.name);
                e.target.style.display = 'none';
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default Photos;
