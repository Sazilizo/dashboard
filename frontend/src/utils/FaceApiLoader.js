import * as faceapi from "face-api.js";

let modelsLoaded = false;

export async function preloadFaceApiModels() {
  if (modelsLoaded) return true;

  try {
    const MODEL_FILES = [
      "tiny_face_detector_model-weights_manifest.json",
      "face_landmark_68_model-weights_manifest.json",
      "face_recognition_model-weights_manifest.json"
    ];

    const BASE_URL = "https://pmvecwjomvyxpgzfweov.supabase.co/storage/v1/object/public/faceapi-models/";

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
