// IndexedDB helper for caching profile images locally
// Enables offline biometric authentication by storing image blobs

const DB_NAME = "profile-images-cache";
const STORE_NAME = "images";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Create object store with compound key: bucket + path
        const store = db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
        store.createIndex("entityId", "entityId", { unique: false });
        store.createIndex("bucket", "bucket", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Generate a unique cache key for an image
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path within bucket
 * @returns {string} Unique cache key
 */
function getCacheKey(bucket, path) {
  return `${bucket}::${path}`;
}

/**
 * Get a cached image blob
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path within bucket
 * @returns {Promise<Blob|null>} Image blob or null if not cached
 */
export async function getCachedImage(bucket, path) {
  try {
    const db = await openDb();
    const cacheKey = getCacheKey(bucket, path);
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);
      
      req.onsuccess = () => {
        const result = req.result;
        if (result?.blob) {
          console.log(`[imageCache] Cache hit for ${bucket}/${path}`);
          resolve(result.blob);
        } else {
          resolve(null);
        }
      };
      
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[imageCache] getCachedImage failed", err);
    return null;
  }
}

/**
 * Get all cached images for a specific entity (user/student)
 * @param {string|number} entityId - User or student ID
 * @returns {Promise<Array>} Array of cached image records
 */
export async function getCachedImagesByEntity(entityId) {
  try {
    const db = await openDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("entityId");
      const req = index.getAll(String(entityId));
      
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[imageCache] getCachedImagesByEntity failed", err);
    return [];
  }
}

/**
 * Cache an image blob with metadata
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path within bucket
 * @param {Blob} blob - Image blob to cache
 * @param {string|number} entityId - Associated user/student ID
 * @param {object} metadata - Additional metadata (optional)
 * @returns {Promise<boolean>} Success status
 */
export async function cacheImage(bucket, path, blob, entityId, metadata = {}) {
  try {
    const db = await openDb();
    const cacheKey = getCacheKey(bucket, path);
    // If the blob is an image and relatively large, compress it before storing to save space.
    let storeBlob = blob;
    try {
      if (blob && blob.type && blob.type.startsWith('image/') && blob.size > 80 * 1024) {
        const compressed = await compressImageBlob(blob, { maxWidthOrHeight: 1024, quality: 0.75, outputType: 'image/webp' });
        if (compressed) {
          storeBlob = compressed;
        }
      }
    } catch (e) {
      console.warn('[imageCache] image compression before cache failed', e);
      storeBlob = blob;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const record = {
        cacheKey,
        bucket,
        path,
        blob: storeBlob,
        entityId: String(entityId),
        updatedAt: Date.now(),
        size: storeBlob.size,
        type: storeBlob.type,
        ...metadata
      };

      const req = store.put(record);

      req.onsuccess = () => {
        console.log(`[imageCache] Cached ${bucket}/${path} (${(storeBlob.size / 1024).toFixed(1)}KB)`);
        resolve(true);
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[imageCache] cacheImage failed", err);
    return false;
  }
}

/**
 * Compress an image Blob by drawing it to a canvas and exporting as a smaller WebP/JPEG blob.
 * Returns a new Blob or null if compression failed.
 */
export async function compressImageBlob(blob, { maxWidthOrHeight = 800, quality = 0.8, outputType = 'image/webp' } = {}) {
  try {
    // Create an image bitmap for better performance when available
    let imgBitmap;
    if (typeof createImageBitmap === 'function') {
      imgBitmap = await createImageBitmap(blob);
    } else {
      // Fallback: load into HTMLImageElement
      await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve({ canvas, img });
          } catch (e) { reject(e); }
        };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
      });
    }

    // Use canvas to resize
    const sourceWidth = imgBitmap ? imgBitmap.width : null;
    const sourceHeight = imgBitmap ? imgBitmap.height : null;
    const ratio = sourceWidth && sourceHeight ? Math.min(1, maxWidthOrHeight / Math.max(sourceWidth, sourceHeight)) : 1;

    const outWidth = sourceWidth ? Math.round(sourceWidth * ratio) : undefined;
    const outHeight = sourceHeight ? Math.round(sourceHeight * ratio) : undefined;

    const canvas = document.createElement('canvas');
    canvas.width = outWidth || maxWidthOrHeight;
    canvas.height = outHeight || maxWidthOrHeight;
    const ctx = canvas.getContext('2d');

    if (imgBitmap) {
      ctx.drawImage(imgBitmap, 0, 0, canvas.width, canvas.height);
      try { imgBitmap.close && imgBitmap.close(); } catch (e) {}
    } else {
      // In the fallback branch above we created a canvas and image; reuse if available
      // Create an image from blob and draw
      const url = URL.createObjectURL(blob);
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
        el.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        el.src = url;
      });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    // Export as blob
    const compressedBlob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), outputType, quality);
    });

    if (!compressedBlob) return null;
    // Ensure filename/type consistent: keep original name unknown here, return blob
    return compressedBlob;
  } catch (err) {
    console.warn('[imageCache] compressImageBlob failed', err);
    return null;
  }
}

/**
 * Check if an image is cached
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path within bucket
 * @returns {Promise<boolean>} True if cached
 */
export async function isImageCached(bucket, path) {
  try {
    const db = await openDb();
    const cacheKey = getCacheKey(bucket, path);
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);
      
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[imageCache] isImageCached failed", err);
    return false;
  }
}

/**
 * Remove a cached image
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path within bucket
 * @returns {Promise<boolean>} Success status
 */
export async function removeCachedImage(bucket, path) {
  try {
    const db = await openDb();
    const cacheKey = getCacheKey(bucket, path);
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(cacheKey);
      
      req.onsuccess = () => {
        console.log(`[imageCache] Removed ${bucket}/${path}`);
        resolve(true);
      };
      
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[imageCache] removeCachedImage failed", err);
    return false;
  }
}

/**
 * Remove all cached images for a specific entity
 * @param {string|number} entityId - User or student ID
 * @returns {Promise<number>} Number of images removed
 */
export async function removeCachedImagesByEntity(entityId) {
  try {
    const images = await getCachedImagesByEntity(entityId);
    let removed = 0;
    
    for (const img of images) {
      const success = await removeCachedImage(img.bucket, img.path);
      if (success) removed++;
    }
    
    console.log(`[imageCache] Removed ${removed} image(s) for entity ${entityId}`);
    return removed;
  } catch (err) {
    console.warn("[imageCache] removeCachedImagesByEntity failed", err);
    return 0;
  }
}

/**
 * Clear all cached images
 * @returns {Promise<boolean>} Success status
 */
export async function clearImageCache() {
  try {
    const db = await openDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      
      req.onsuccess = () => {
        console.log("[imageCache] Cleared all cached images");
        resolve(true);
      };
      
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[imageCache] clearImageCache failed", err);
    return false;
  }
}

/**
 * Get cache statistics
 * @returns {Promise<object>} Cache stats
 */
export async function getCacheStats() {
  try {
    const db = await openDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      
      req.onsuccess = () => {
        const images = req.result || [];
        const totalSize = images.reduce((sum, img) => sum + (img.size || 0), 0);
        const byBucket = {};
        
        images.forEach(img => {
          if (!byBucket[img.bucket]) {
            byBucket[img.bucket] = { count: 0, size: 0 };
          }
          byBucket[img.bucket].count++;
          byBucket[img.bucket].size += img.size || 0;
        });
        
        resolve({
          totalImages: images.length,
          totalSize,
          totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
          byBucket,
          oldestCache: images.length ? Math.min(...images.map(i => i.updatedAt)) : null,
          newestCache: images.length ? Math.max(...images.map(i => i.updatedAt)) : null
        });
      };
      
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[imageCache] getCacheStats failed", err);
    return {
      totalImages: 0,
      totalSize: 0,
      totalSizeMB: "0.00",
      byBucket: {},
      oldestCache: null,
      newestCache: null
    };
  }
}

/**
 * Remove cached images older than specified days
 * @param {number} days - Age threshold in days
 * @returns {Promise<number>} Number of images removed
 */
export async function cleanOldCache(days = 30) {
  try {
    const db = await openDb();
    const threshold = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("updatedAt");
      const req = index.openCursor();
      
      let removed = 0;
      
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.updatedAt < threshold) {
            cursor.delete();
            removed++;
          }
          cursor.continue();
        } else {
          console.log(`[imageCache] Cleaned ${removed} old image(s) (>${days} days)`);
          resolve(removed);
        }
      };
      
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[imageCache] cleanOldCache failed", err);
    return 0;
  }
}

export default {
  getCachedImage,
  getCachedImagesByEntity,
  cacheImage,
  isImageCached,
  removeCachedImage,
  removeCachedImagesByEntity,
  clearImageCache,
  getCacheStats,
  cleanOldCache
};
