let faceapi = null;
let modelsLoaded = false;

// Set up the environment for face-api.js
// More complete environment shims to handle isNodejs() and isBrowser() checks
globalThis.process = { env: {} };
globalThis.navigator = { userAgent: "worker" };
globalThis.window = globalThis;  // Make window available
globalThis.document = {          // Basic document shim
    createElement: (tag) => {
        if (tag === 'canvas') {
            return new OffscreenCanvas(1, 1);
        }
        throw new Error('Only canvas creation supported');
    }
};

// Lazy-import face-api inside the worker to avoid top-level evaluation that
// may assume a DOM/window exists. Also provide a minimal `process.env` shim
// because some libraries check it during initialization.
async function ensureFaceApi() {
  if (faceapi) return faceapi;
  try {
    // minimal polyfill for process.env if not present in the worker bundle
    if (typeof globalThis.process === "undefined") {
      try {
        globalThis.process = { env: {} };
      } catch (e) {}
    } else if (!globalThis.process.env) {
      globalThis.process.env = {};
    }

    // ensure navigator exists for browser checks
    if (typeof globalThis.navigator === "undefined") {
      try {
        globalThis.navigator = { userAgent: "worker" };
      } catch (e) {}
    }

    // Skip dynamic import and go straight to UMD bundle
    console.log('[descriptor.worker] loading face-api.js from CDN');
    
    // Try jsdelivr first (primary CDN)
    try {
      importScripts('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js');
    } catch (err) {
      console.warn('[descriptor.worker] jsdelivr failed, trying unpkg fallback');
      // Fallback to unpkg if jsdelivr fails
      importScripts('https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js');
    }

    // Ensure environment is properly set up
    globalThis.isBrowser = true;
    globalThis.isNodejs = false;

    if (!globalThis.faceapi) {
      throw new Error('UMD bundle did not expose faceapi global');
    }

    faceapi = globalThis.faceapi;
    return faceapi;
  } catch (err) {
    console.error('[descriptor.worker] failed to import face-api.js', err);
    throw err;
  }
}
async function loadModels(modelsUrl = '/models') {
  try {
    await ensureFaceApi();
    // Clean up the models URL to ensure proper path construction
    const baseUrl = modelsUrl.replace(/\/$/, '');

    // Validate modelsUrl quickly by attempting to fetch the tiny detector manifest
    // This gives a fast, clear failure mode if models aren't reachable.
    const tinyManifest = `${baseUrl}/tiny_face_detector_model-weights_manifest.json`;
    const mResp = await fetch(tinyManifest, { cache: 'force-cache' });
    if (!mResp.ok) {
      const text = await mResp.text().catch(() => '');
      const snippet = text ? text.slice(0, 240) : '';
      throw new Error(`Failed to fetch tiny_face_detector manifest (${mResp.status}) from ${tinyManifest} - ${snippet}`);
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
  
  // Handle initialization message
  if (id === 'init') {
    try {
      await loadModels(modelsUrl);
      self.postMessage({ id: 'init', success: true });
    } catch (err) {
      self.postMessage({ id: 'init', success: false, error: err?.message || String(err) });
    }
    return;
  }
  
  // Handle descriptor generation
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
          const text = await resp.text().catch(() => '');
          const snippet = text ? text.slice(0, 240) : '';
          console.warn('[descriptor.worker] fetch failed', resp.status, url, snippet);
          // post back a short diagnostic to help identify HTML/403/404 responses
          self.postMessage({ id, error: `Fetch failed ${resp.status} for ${url}`, snippet });
          continue;
        }
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          const text = await resp.text().catch(() => '');
          const snippet = text ? text.slice(0, 240) : '';
          console.warn('[descriptor.worker] expected image but got HTML', url, snippet);
          self.postMessage({ id, error: `Expected image but got HTML for ${url}`, snippet });
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
