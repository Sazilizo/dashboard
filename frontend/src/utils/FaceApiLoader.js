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
  const url = baseUrl + testFile;
  const details = { url, ok: false, status: null, contentType: null, contentLength: null, error: null };
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp) {
      details.error = 'no_response';
      return details;
    }
    details.status = resp.status;
    const ct = resp.headers && resp.headers.get ? resp.headers.get('content-type') : null;
    details.contentType = ct;
    const cl = resp.headers && resp.headers.get ? resp.headers.get('content-length') : null;
    details.contentLength = cl;

    if (!resp.ok) {
      details.error = `http_${resp.status}`;
      return details;
    }

    // Prefer JSON manifests; if we get HTML (e.g., 403/404 page), reject
    if (ct && !/application\/json/i.test(ct)) {
      try {
        await resp.clone().json();
        details.ok = true;
        return details;
      } catch (e) {
        details.error = 'non_json_response';
        return details;
      }
    }

    try {
      await resp.clone().json();
      details.ok = true;
      return details;
    } catch (e) {
      details.error = 'json_parse_error';
      return details;
    }
  } catch (e) {
    details.error = String(e);
    return details;
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

  if (requireConsent && !hasBiometricConsent()) {
    return { success: false, reason: 'consent_required' };
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
  const probeResults = [];
  for (const p of candidatePaths) {
    const candidate = ensureSlash(p);
    const res = await probeModelUrl(candidate, MODEL_FILES[0]);
    probeResults.push(res);
    if (res && res.ok) {
      workingPath = candidate;
      break;
    }
  }

  if (!workingPath) {
    return { success: false, reason: 'models_unavailable', details: { probes: probeResults } };
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
              // content-type indicates non-JSON; attempt parse once, then fail clearly
              try {
                manifest = await mresp.clone().json();
              } catch (e) {
                console.warn('[FaceApiLoader] models-manifest.json is not valid JSON (content-type:', ct, ')');
                return { success: false, reason: 'models_unavailable', error: 'invalid_manifest' };
              }
            } else {
              // try parse; if it fails, return a clear failure so UI can guide the user
              try {
                manifest = await mresp.json();
              } catch (e) {
                console.warn('[FaceApiLoader] Failed to parse models-manifest.json', e);
                return { success: false, reason: 'models_unavailable', error: 'invalid_manifest' };
              }
            }
          } catch (e) {
            console.warn('[FaceApiLoader] Unexpected error while reading manifest headers', e);
            return { success: false, reason: 'models_unavailable', error: String(e) };
          }
        }
      } catch (e) {
        // no manifest available; we'll continue without checks
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
            // prepare headers for cached response
            const headers = {};
            try { resp.headers.forEach((v, k) => { headers[k] = v; }); } catch (e) {}
            // If the server served gzipped bytes but omitted the content-encoding header
            // detect gzip via magic bytes and set the header so future fetches (or the
            // service worker cache) will allow the browser to transparently decompress.
            try {
              if ((!headers['content-encoding'] || headers['content-encoding'] === '') && ab && ab.byteLength >= 2) {
                const view = new Uint8Array(ab, 0, 2);
                if (view[0] === 0x1F && view[1] === 0x8B) {
                  headers['content-encoding'] = 'gzip';
                }
              }
            } catch (e) {}
            // Ensure content-type present (manifest may declare it)
            if (!headers['content-type'] && manifest.files[f] && manifest.files[f].contentType) {
              headers['content-type'] = manifest.files[f].contentType;
            }
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
