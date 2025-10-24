// src/utils/FaceApiLoader.js
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

    let BASE_URL = process.env.REACT_APP_MODELS_URL || "/models/";
    // Ensure BASE_URL ends with a slash
    if (!BASE_URL.endsWith('/')) {
      BASE_URL += '/';
    }

    // First verify that at least one model file is accessible
    try {
      const testUrl = BASE_URL + MODEL_FILES[0];
      const testResp = await fetch(testUrl, { mode: "cors" });
      if (!testResp.ok) {
        throw new Error(`Model file not accessible at ${testUrl}`);
      }
    } catch (err) {
      console.error('Failed to access model file, checking alternative paths...', err);
      
      // Try alternative paths
      const alternativePaths = [
        '/models/',
        '/public/models/',
        'models/',
        './models/'
      ];

      let modelFound = false;
      for (const path of alternativePaths) {
        try {
          const testUrl = path + MODEL_FILES[0];
          const testResp = await fetch(testUrl, { mode: "cors" });
          if (testResp.ok) {
            BASE_URL = path;
            modelFound = true;
            console.log(`Found working model path at: ${BASE_URL}`);
            break;
          }
        } catch {}
      }

      if (!modelFound) {
        throw new Error('Could not find accessible model files in any location');
      }
    }

    // Prefetch model files into the Cache Storage
    if (typeof caches !== "undefined") {
      try {
        const cache = await caches.open("faceapi-models");
        await Promise.all(MODEL_FILES.map(async (f) => {
          const url = BASE_URL + f;
          const resp = await fetch(url, { mode: "cors" });
          if (resp && resp.ok) await cache.put(url, resp.clone());
        }));
      } catch (err) {
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