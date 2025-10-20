import * as faceapi from "face-api.js";

let modelsLoaded = false;

/**
 * Preload FaceAPI models once per session.
 * Uses Cache Storage API for offline support and localStorage flag to persist across reloads.
 */
export async function preloadFaceApiModels() {
  // Avoid reloading within the same session
  if (modelsLoaded) {
    console.info("[FaceApiLoader] already loaded this session, skipping");
    return true;
  }

  // Avoid reloading if previously cached in localStorage
  const cachedOnce = localStorage.getItem("faceApiModelsCachedOnce");
  if (cachedOnce) {
    console.info("[FaceApiLoader] models were already cached previously, skipping");
    modelsLoaded = true;
    return true;
  }

  try {
    const MODEL_FILES = [
      "tiny_face_detector_model-weights_manifest.json",
      "face_landmark_68_model-weights_manifest.json",
      "face_recognition_model-weights_manifest.json",
    ];

    const BASE_URL =
      "https://pmvecwjomvyxpgzfweov.supabase.co/storage/v1/object/public/faceapi-models/";

    // Pre-cache model files using Cache Storage API (if available)
    if (typeof caches !== "undefined") {
      try {
        const cache = await caches.open("faceapi-models");
        await Promise.all(
          MODEL_FILES.map(async (file) => {
            const url = BASE_URL + file;
            const resp = await fetch(url, { mode: "cors" });
            if (resp && resp.ok) {
              await cache.put(url, resp.clone());
              console.info(`[FaceApiLoader] cached ${file}`);
            }
          })
        );
      } catch (cacheErr) {
        console.warn("[FaceApiLoader] Cache Storage not available or failed:", cacheErr);
      }
    }

    // Load models from the cached or network source
    console.info("[FaceApiLoader] loading FaceAPI networks...");
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(BASE_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(BASE_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(BASE_URL),
    ]);

    modelsLoaded = true;
    localStorage.setItem("faceApiModelsCachedOnce", "true");
    console.info("[FaceApiLoader] ✅ models preloaded successfully");

    return true;
  } catch (err) {
    console.error("[FaceApiLoader] ❌ failed to preload models:", err);
    return false;
  }
}

/**
 * Returns whether FaceAPI models have been loaded this session.
 */
export function areFaceApiModelsLoaded() {
  return modelsLoaded;
}
export async function resetFaceApiCache() {
  try {
    localStorage.removeItem("faceApiModelsCachedOnce");
    if (typeof caches !== "undefined") {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.startsWith("faceapi-models")) {
          await caches.delete(name);
        }
      }
    }
    modelsLoaded = false;
    console.info("[FaceApiLoader] 🔄 cache reset completed");
  } catch (err) {
    console.error("[FaceApiLoader] cache reset failed:", err);
  }
}
