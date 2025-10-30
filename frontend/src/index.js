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
    window.location.reload();
  };
  if (process.env.NODE_ENV === 'development') {
    console.log('[GCU Debug] School utilities available: window.seedSchoolsCache(), window.verifySchoolsCache(), window.enableSchoolsDebug()');
  }
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/serviceWorker.js')
      .then(registration => {
        if (process.env.NODE_ENV === 'development') {
          console.log('ServiceWorker registration successful');
        }
        
        // Sync offline changes when coming back online (use onlineApi client)
        window.addEventListener('online', () => {
          try {
            syncOfflineChanges(onlineApi);
          } catch (err) {
            console.warn('Failed to sync offline changes automatically', err);
          }
        });
      })
      .catch(err => {
        if (process.env.NODE_ENV === 'development') {
          console.log('ServiceWorker registration failed: ', err);
        }
      });
  });
}

root.render(<App />);

// Monitor performance in development
measurePerformance();
