let faceapi = null;
let modelsLoaded = false;

// Lazy-import face-api inside the worker to avoid top-level evaluation that
// may assume a DOM/window exists. Also provide a minimal `process.env` shim
// because some libraries check it during initialization.
async function ensureFaceApi() {
  if (faceapi) return faceapi;
  try {
    // minimal polyfill for process.env if not present in the worker bundle
    if (typeof globalThis.process === "undefined") {
      // keep it small: only env is needed for some libs
      // eslint-disable-next-line no-undef
      globalThis.process = { env: {} };
    } else if (!globalThis.process.env) {
      globalThis.process.env = {};
    }

    // ensure navigator exists for browser checks
    if (typeof globalThis.navigator === "undefined") {
      globalThis.navigator = { userAgent: "worker" };
    }

    // dynamic import to avoid top-level side-effects
    const mod = await import('face-api.js');
    faceapi = mod;
    return faceapi;
  } catch (err) {
    console.error('[descriptor.worker] failed to import face-api.js', err);
    throw err;
  }
}

async function loadModels(modelsUrl = '/models') {
  try {
    await ensureFaceApi();
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
