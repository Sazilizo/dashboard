import * as faceapi from 'face-api.js';

let modelsLoaded = false;

async function loadModels(modelsUrl = '/models') {
  try {
    // Validate modelsUrl quickly by attempting to fetch the tiny detector manifest
    // This gives a fast, clear failure mode if models aren't reachable.
    const tinyManifest = `${modelsUrl.replace(/\/$/, '')}/tiny_face_detector_model-weights_manifest.json`;
    const mResp = await fetch(tinyManifest, { cache: 'no-cache' });
    if (!mResp.ok) {
      throw new Error(`Failed to fetch tiny_face_detector manifest (${mResp.status}) from ${tinyManifest}`);
    }

    // load tiny detector + landmarks + recognition
    await faceapi.nets.tinyFaceDetector.loadFromUri(modelsUrl);
    await faceapi.nets.faceLandmark68Net.loadFromUri(modelsUrl);
    await faceapi.nets.faceRecognitionNet.loadFromUri(modelsUrl);
    modelsLoaded = true;
    console.log('[descriptor.worker] models loaded from', modelsUrl);
  } catch (err) {
    console.error('[descriptor.worker] failed to load models', err);
    throw err;
  }
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  const { id, signedUrls, modelsUrl, inputSize = 128, scoreThreshold = 0.45, maxDescriptors = 3 } = msg;
  if (!signedUrls || !signedUrls.length) {
    self.postMessage({ id, descriptors: [] });
    return;
  }

  try {
    if (!modelsLoaded) await loadModels(modelsUrl);

    const descriptors = [];
    // limit to maxDescriptors
    const limited = signedUrls.slice(0, maxDescriptors);

    for (const url of limited) {
      try {
        const resp = await fetch(url, { cache: 'no-cache' });
        if (!resp.ok) {
          console.warn('[descriptor.worker] fetch failed', resp.status, url);
          continue;
        }
        const blob = await resp.blob();
        // createImageBitmap available in module workers in modern browsers
        const bitmap = await createImageBitmap(blob);

        const det = await faceapi
          .detectSingleFace(bitmap, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (det && det.descriptor) {
          // convert Float32Array to plain array for structured cloning
          descriptors.push(Array.from(det.descriptor));
        }
      } catch (err) {
        console.warn('[descriptor.worker] skipped url', url, err);
      }
    }

    self.postMessage({ id, descriptors });
  } catch (err) {
    console.error('[descriptor.worker] error', err);
    self.postMessage({ id, descriptors: [], error: err?.message || String(err) });
  }
};
