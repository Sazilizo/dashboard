import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import cacheFormSchemasIfOnline from "./utils/proactiveCache";
import { preloadFaceApiModels } from "./utils/FaceApiLoader";
import { syncOfflineChanges } from "./api/offlineClient";
import { onlineApi } from "./api/client";
import { seedSchoolsCache, verifySchoolsCache } from "./utils/seedSchoolsCache";


const container = document.getElementById("root");
const root = createRoot(container);

// Fire-and-forget proactive cache; only runs when online and helps first-time
// offline usage of dynamic forms by ensuring `form_schemas` is present in IDB.
cacheFormSchemasIfOnline().catch((err) => console.warn("[index] cache error", err));

// Preload face-api models in background (useful for biometric flows)
preloadFaceApiModels().catch((err) => console.warn("[index] faceapi preload failed", err));

// Make seed utilities available globally for debugging (mobile & web)
if (typeof window !== 'undefined') {
  window.seedSchoolsCache = seedSchoolsCache;
  window.verifySchoolsCache = verifySchoolsCache;
  window.enableSchoolsDebug = () => {
    localStorage.setItem('showSchoolsDebug', 'true');
    window.location.reload();
  };
  console.log('[GCU Debug] School utilities available: window.seedSchoolsCache(), window.verifySchoolsCache(), window.enableSchoolsDebug()');
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/serviceWorker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful');
        
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
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}

root.render(<App />);
