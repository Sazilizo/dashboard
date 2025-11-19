import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import cacheFormSchemasIfOnline from "./utils/proactiveCache";
import { preloadFaceApiModels } from "./utils/FaceApiLoader";
import { syncOfflineChanges } from "./api/offlineClient";
import { onlineApi } from "./api/client";
import { seedSchoolsCache, verifySchoolsCache } from "./utils/seedSchoolsCache";
import { measurePerformance } from "./utils/performanceMonitor";


const container = document.getElementById("root");
const root = createRoot(container);

// Defer heavy caching operations until after initial render to improve First Contentful Paint
// Use requestIdleCallback for non-critical background tasks
const deferBackgroundTasks = () => {
  const runWhenIdle = (callback) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(callback, { timeout: 3000 });
    } else {
      setTimeout(callback, 1);
    }
  };

  // Defer cache refresh - not needed for initial login render
  runWhenIdle(() => {
    cacheFormSchemasIfOnline().catch((err) => console.warn("[index] cache error", err));
  });

  // Defer face-api model loading - only needed when biometrics are actually used
  // Models will lazy-load on first biometric screen anyway
  runWhenIdle(() => {
    preloadFaceApiModels().catch((err) => console.warn("[index] faceapi preload failed", err));
  });
};

// Start background tasks after a short delay to prioritize initial render
setTimeout(deferBackgroundTasks, 100);

// Make seed utilities available globally for debugging (mobile & web)
if (typeof window !== 'undefined') {
  window.seedSchoolsCache = seedSchoolsCache;
  window.verifySchoolsCache = verifySchoolsCache;
  window.enableSchoolsDebug = () => {
    localStorage.setItem('showSchoolsDebug', 'true');
    // Soft-refresh: trigger background cache refresh instead of full page reload
    if (typeof window.refreshCache === 'function') {
      console.log('[GCU Debug] Soft-refresh: triggering cache refresh');
      window.refreshCache();
    } else {
      console.log('[GCU Debug] Soft-refresh fallback: reloading page');
      window.location.reload();
    }
  };
  
  // Make cache refresh available globally for manual triggers
  window.refreshCache = () => {
    console.log('[GCU Debug] Manual cache refresh triggered...');
    return cacheFormSchemasIfOnline();
  };

  // Developer helper: dump offline mutations to console for diagnosis
  try {
    // lazy import to avoid circular deps at module eval time
    const { getMutations } = require('./utils/tableCache');
    window.dumpOfflineMutations = async () => {
      try {
        const muts = await getMutations();
        console.table(muts.map(m => ({ id: m.id, table: m.table, type: m.type, attempts: m.attempts || 0, lastError: m.lastError || '', lastAttempt: m.lastAttempt || '' })));
        return muts;
      } catch (err) {
        console.warn('[dumpOfflineMutations] failed', err);
        return null;
      }
    };
  } catch (e) {
    // ignore require errors in environments without CommonJS require
  }

  // Helper: retry a single offline mutation by id after optional payload override
  try {
    const { getMutation, updateMutation } = require('./utils/tableCache');
    window.retryOfflineMutation = async (id, overridePayload = null) => {
      try {
        const m = await getMutation(id);
        if (!m) {
          console.warn('[retryOfflineMutation] no mutation with id', id);
          return null;
        }
        const newPayload = overridePayload || m.payload;
        // reset failure metadata so it will be re-attempted cleanly
        await updateMutation(id, { payload: newPayload, attempts: 0, lastError: null, lastAttempt: null });
        // trigger background sync
        if (typeof window.attemptBackgroundSync === 'function') {
          window.attemptBackgroundSync({ force: true });
        } else if (typeof require === 'function') {
          const { attemptBackgroundSync } = require('./utils/tableCache');
          attemptBackgroundSync({ force: true });
        }
        return await getMutation(id);
      } catch (err) {
        console.warn('[retryOfflineMutation] failed', err);
        return null;
      }
    };
  } catch (e) {
    // ignore
  }

  // Developer helper: delete a queued mutation by id
  try {
    const { deleteMutation } = require('./utils/tableCache');
    window.deleteOfflineMutation = async (id) => {
      try {
        await deleteMutation(id);
        console.log('[deleteOfflineMutation] deleted', id);
        return true;
      } catch (err) {
        console.warn('[deleteOfflineMutation] failed', err);
        return false;
      }
    };
  } catch (e) {
    // ignore
  }

  // Soft refresh helper: runs non-disruptive background refreshes and emits events
  window.softRefresh = async (opts = { syncOffline: true }) => {
    try {
      window.dispatchEvent(new CustomEvent('soft-refresh-start'));
      if (opts.syncOffline && navigator.onLine) {
        try {
          await syncOfflineChanges(onlineApi);
        } catch (err) {
          console.warn('[softRefresh] syncOfflineChanges failed', err);
        }
      }

      // Run cache refresh but don't force a page reload
      try {
        await cacheFormSchemasIfOnline();
      } catch (err) {
        console.warn('[softRefresh] cacheFormSchemasIfOnline failed', err);
      }

      window.dispatchEvent(new CustomEvent('soft-refresh-complete'));
      return true;
    } catch (err) {
      console.warn('[softRefresh] unexpected error', err);
      window.dispatchEvent(new CustomEvent('soft-refresh-failed', { detail: err }));
      return false;
    }
  };
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[GCU Debug] School utilities available: window.seedSchoolsCache(), window.verifySchoolsCache(), window.enableSchoolsDebug()');
    console.log('[GCU Debug] Cache utilities available: window.refreshCache()');
  }
}

// Register service worker (only in production to avoid dev reload loops)
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/serviceWorker.js')
      .then((registration) => {
        console.log('ServiceWorker registration successful');

        // Sync offline changes and refresh cache when coming back online
        window.addEventListener('online', () => {
          console.log('[index] Device back online - syncing and refreshing cache...');

          try {
            // Sync any pending offline changes first
            syncOfflineChanges(onlineApi);
          } catch (err) {
            console.warn('Failed to sync offline changes automatically', err);
          }

          // Then refresh the cache with latest data from Supabase
          setTimeout(() => {
            cacheFormSchemasIfOnline().catch((err) => {
              console.warn('[index] Cache refresh failed after coming online:', err);
            });
          }, 2000); // Wait 2 seconds for sync to complete first
        });
      })
      .catch((err) => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}

root.render(
  <App />
);

// Monitor performance in development
measurePerformance();
