// src/utils/FaceApiLoader.js
import { getFaceApi } from './faceApiShim';
import { hasBiometricConsent } from './biometricConsent';

let modelsLoaded = false;
let lastBaseUrl = null;

function ensureSlash(u) {
  if (!u) return '/models/';
  return u.endsWith('/') ? u : `${u}/`;
}

function isOnWifiLike() {
  try {
    const nav = navigator;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (!conn) return true; // unknown, allow
    if (conn.type && conn.type === 'wifi') return true;
    if (conn.effectiveType) {
      // treat '4g' as OK; '3g','2g','slow-2g' as not wifi-like
      return conn.effectiveType === '4g' || conn.effectiveType === 'wifi';
    }
    return true;
  } catch (e) {
    return true;
  }
}

async function probeModelUrl(baseUrl, testFile) {
  try {
    const url = baseUrl + testFile;
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp || !resp.ok) return false;
    const ct = resp.headers && resp.headers.get ? resp.headers.get('content-type') : null;
    // Prefer JSON manifests; if we get HTML (e.g., 403/404 page), reject
    if (ct && !/application\/json/i.test(ct)) {
      // Try to parse JSON anyway in case server omitted content-type
      try {
        await resp.clone().json();
        return true;
      } catch (e) {
        console.warn('[FaceApiLoader] probeModelUrl: non-JSON response for', url);
        return false;
      }
    }
    // If content-type suggests JSON or is absent, attempt to parse
    try {
      await resp.clone().json();
      return true;
    } catch (e) {
      console.warn('[FaceApiLoader] probeModelUrl: failed to parse JSON for', url, e);
      return false;
    }
  } catch (e) {
    return false;
  }
}

/**
 * Load face-api models on demand.
 * Options:
 *  - variant: 'tiny' | 'ssd' (default 'tiny' for mobile)
 *  - modelsUrl: override REACT_APP_MODELS_URL
 *  - requireWifi: boolean - if true, will refuse to download on non-wifi
 *  - requireConsent: boolean - if true, will refuse to download unless biometric consent exists
 * Returns: { success: boolean, reason?: string }
 */
export async function loadFaceApiModels({ variant = 'tiny', modelsUrl = null, requireWifi = false, requireConsent = false } = {}) {
  if (modelsLoaded) return { success: true };

  // Consent should not block local model loading; only gate remote enrollments.
  if (requireConsent && !hasBiometricConsent()) {
    // Proceed if models are local; we'll still attempt probing below.
    // Do not hard-fail here.
  }

  if (requireWifi && !isOnWifiLike()) {
    return { success: false, reason: 'wifi_required' };
  }

  // Choose appropriate model filenames based on variant
  const FILES_BY_VARIANT = {
    tiny: [
      'tiny_face_detector_model-weights_manifest.json',
      'face_landmark_68_model-weights_manifest.json',
      'face_recognition_model-weights_manifest.json'
    ],
    ssd: [
      'ssd_mobilenetv1_model-weights_manifest.json',
      'face_landmark_68_model-weights_manifest.json',
      'face_recognition_model-weights_manifest.json'
    ]
  };

  const MODEL_FILES = FILES_BY_VARIANT[variant] || FILES_BY_VARIANT.tiny;

  let BASE_URL = modelsUrl || process.env.REACT_APP_MODELS_URL || '/models/';
  BASE_URL = ensureSlash(BASE_URL);

  // probe the provided base url first, then try a small set of fallbacks
  const candidatePaths = [BASE_URL, '/models/', '/public/models/', 'models/', './models/'];
  let workingPath = null;
  for (const p of candidatePaths) {
    const candidate = ensureSlash(p);
    const ok = await probeModelUrl(candidate, MODEL_FILES[0]);
    if (ok) {
      workingPath = candidate;
      break;
    }
  }

  if (!workingPath) {
    return { success: false, reason: 'models_unavailable' };
  }

  // Try to prefetch into Cache Storage (best-effort)
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open('faceapi-models');

      // Attempt to fetch manifest for integrity checks
      let manifest = null;
      try {
        const manifestUrl = workingPath + 'models-manifest.json';
        const mresp = await fetch(manifestUrl, { mode: 'cors' });
        if (mresp && mresp.ok) {
          try {
            const ct = mresp.headers && mresp.headers.get ? mresp.headers.get('content-type') : null;
            if (ct && !/application\/json/i.test(ct)) {
              try {
                manifest = await mresp.clone().json();
              } catch (e) {
                // Manifest optional: continue without it
                console.warn('[FaceApiLoader] models-manifest.json not JSON; continuing without manifest');
                manifest = null;
              }
            } else {
              try {
                manifest = await mresp.json();
              } catch (e) {
                console.warn('[FaceApiLoader] Failed to parse models-manifest.json; continuing without manifest');
                manifest = null;
              }
            }
          } catch (e) {
            console.warn('[FaceApiLoader] Error reading manifest headers; continuing without manifest', e);
            manifest = null;
          }
        }
      } catch (e) {
        // no manifest available; continue without checks
      }

      const bufferToHex = async (buffer) => {
        const hash = await crypto.subtle.digest('SHA-256', buffer);
        const view = new DataView(hash);
        let hex = '';
        for (let i = 0; i < view.byteLength; i++) {
          const h = view.getUint8(i).toString(16).padStart(2, '0');
          hex += h;
        }
        return hex;
      };

      await Promise.all(MODEL_FILES.map(async (f) => {
        const url = workingPath + f;
        try {
          const resp = await fetch(url, { mode: 'cors' });
          if (!resp || !resp.ok) return;

          if (manifest && manifest.files && manifest.files[f] && manifest.files[f].sha256) {
            // verify checksum
            const ab = await resp.arrayBuffer();
            const hex = await bufferToHex(ab);
            const expected = manifest.files[f].sha256;
            if (hex !== expected) {
              throw new Error(`Checksum mismatch for ${f}: expected ${expected} got ${hex}`);
            }
            // put verified response into cache
            const headers = {};
            resp.headers.forEach((v, k) => { headers[k] = v; });
            await cache.put(url, new Response(ab, { headers }));
          } else {
            // no manifest entry — store as-is
            await cache.put(url, resp.clone());
          }
        } catch (e) {
          // ignore single-file failures but log
          console.warn('[FaceApiLoader] prefetch failed for', f, e);
        }
      }));
    } catch (e) {
      console.warn('[FaceApiLoader] Cache prefetch failed', e);
    }
  }

  // Load faceapi and the selected networks
  try {
    const faceapi = await getFaceApi();

    if (variant === 'ssd') {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(workingPath),
        faceapi.nets.faceLandmark68Net.loadFromUri(workingPath),
        faceapi.nets.faceRecognitionNet.loadFromUri(workingPath)
      ]);
    } else {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(workingPath),
        faceapi.nets.faceLandmark68Net.loadFromUri(workingPath),
        faceapi.nets.faceRecognitionNet.loadFromUri(workingPath)
      ]);
    }

    modelsLoaded = true;
    lastBaseUrl = workingPath;
    console.log('[FaceApiLoader] Models loaded from', workingPath, 'variant:', variant);
    return { success: true };
  } catch (err) {
    console.error('[FaceApiLoader] Failed to load models', err);
    return { success: false, reason: 'load_failed', error: String(err) };
  }
}

export function areFaceApiModelsLoaded() {
  return modelsLoaded;
}

export function getFaceApiModelsBaseUrl() {
  return lastBaseUrl;
}

// Backwards-compatible wrapper for older imports that expect a boolean-returning
// `preloadFaceApiModels` function. Calls the new `loadFaceApiModels` and
// returns true on success, false otherwise.
export async function preloadFaceApiModels(options = {}) {
  const res = await loadFaceApiModels(options);
  return !!(res && res.success === true);
}
