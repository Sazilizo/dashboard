import { getFaceApi } from './faceApiShim';

let modelsLoaded = false;

export async function preloadFaceApiModels() {
  if (modelsLoaded) return true;

  try {
    const MODEL_FILES = [
      "tiny_face_detector_model-weights_manifest.json",
      "face_landmark_68_model-weights_manifest.json",
      "face_recognition_model-weights_manifest.json"
    ];

    const BASE_URL = process.env.REACT_APP_MODELS_URL || "/models/";

    // Prefetch model files into the Cache Storage so subsequent loads can be
    // served from the browser cache when offline or on slow connections.
    if (typeof caches !== "undefined") {
      try {
        const cache = await caches.open("faceapi-models");
        await Promise.all(MODEL_FILES.map(async (f) => {
          const url = BASE_URL + f;
          const resp = await fetch(url, { mode: "cors" });
          if (resp && resp.ok) await cache.put(url, resp.clone());
        }));
      } catch (err) {
        // cache may be unavailable in some environments; continue anyway
        console.warn("FaceAPI model caching failed:", err);
      }
    }

    // dynamic import of face-api through the shim
    const faceapi = await getFaceApi();

    // Load networks (face-api will use the cached responses if available)
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(BASE_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(BASE_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(BASE_URL)
    ]);

    console.log("✅ FaceAPI models preloaded");
    modelsLoaded = true;
    return true;
  } catch (err) {
    console.error("❌ Failed to preload FaceAPI models", err);
    return false;
  }
}

export function areFaceApiModelsLoaded() {
  return modelsLoaded;
}
