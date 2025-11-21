// src/utils/FaceApiLoader.js
import { getFaceApi } from './faceApiShim';
import { hasBiometricConsent } from './biometricConsent';
import pako from 'pako';

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

async function arrayBufferFromResponseWithGzipFallback(resp) {
  // Read raw bytes
  const raw = await resp.arrayBuffer();
  try {
    const ce = resp.headers && resp.headers.get ? resp.headers.get('content-encoding') : null;
    if (ce && /gzip/i.test(ce)) return raw;
  } catch (e) {}

  // If server omitted Content-Encoding but bytes look gzipped, decompress client-side
  if (raw && raw.byteLength >= 2) {
    const view = new Uint8Array(raw, 0, 2);
    if (view[0] === 0x1F && view[1] === 0x8B) {
      try {
        const dec = pako.ungzip(new Uint8Array(raw));
        return dec.buffer;
      } catch (err) {
        console.warn('[FaceApiLoader] pako.ungzip failed for', resp.url, err);
        return raw;
      }
    }
  }
  return raw;
}

async function parseJsonResponseWithGzipFallback(resp) {
  // Try normal json() first (fast path)
  try {
    return await resp.json();
  } catch (e) {
    // Fallback: get arrayBuffer, detect/decompress gzip, decode text and parse
    try {
      const ab = await arrayBufferFromResponseWithGzipFallback(resp);
      const text = new TextDecoder('utf-8').decode(ab);
      return JSON.parse(text);
    } catch (e2) {
      throw e2;
    }
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
    try {
      await parseJsonResponseWithGzipFallback(resp.clone());
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

  // Prefer explicit param, then REACT_APP_MODELS_URLS (plural), then REACT_APP_MODELS_URL, then default
  let BASE_URL = modelsUrl || process.env.REACT_APP_MODELS_URLS || process.env.REACT_APP_MODELS_URL || '/models/';
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

      // Attempt to fetch manifest for integrity checks (supports gzip-without-Content-Encoding)
      let manifest = null;
      try {
        const manifestUrl = workingPath + 'models-manifest.json';
        const mresp = await fetch(manifestUrl, { mode: 'cors' });
        if (mresp && mresp.ok) {
          try {
            manifest = await parseJsonResponseWithGzipFallback(mresp);
          } catch (e) {
            console.warn('[FaceApiLoader] models-manifest.json is not valid JSON or could not be parsed', e);
            return { success: false, reason: 'models_unavailable', error: 'invalid_manifest' };
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

          // Always normalize to an ArrayBuffer, decompressing client-side if needed
          const ab = await arrayBufferFromResponseWithGzipFallback(resp);

          if (manifest && manifest.files && manifest.files[f] && manifest.files[f].sha256) {
            // verify checksum against decompressed bytes
            const hex = await bufferToHex(ab);
            const expected = manifest.files[f].sha256;
            if (hex !== expected) {
              throw new Error(`Checksum mismatch for ${f}: expected ${expected} got ${hex}`);
            }
            // prepare headers for cached response (remove content-encoding since we store decompressed bytes)
            const headers = {};
            try { resp.headers.forEach((v, k) => { if (k !== 'content-encoding') headers[k] = v; }); } catch (e) {}
            // Ensure content-type present (manifest may declare it)
            if (!headers['content-type'] && manifest.files[f] && manifest.files[f].contentType) {
              headers['content-type'] = manifest.files[f].contentType;
            }
            await cache.put(url, new Response(ab, { headers }));
          } else {
            // No manifest entry — cache decompressed bytes to avoid repeated client decompression
            const headers = {};
            try { resp.headers.forEach((v, k) => { if (k !== 'content-encoding') headers[k] = v; }); } catch (e) {}
            await cache.put(url, new Response(ab, { headers }));
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
  // Return the last working path discovered during a load, or fall back to configured env values
  if (lastBaseUrl) return lastBaseUrl;
  // allow a runtime override for debugging without rebuild: window.__FACEAPI_MODELS_BASE_URL
  try {
    // eslint-disable-next-line no-undef
    const runtime = (typeof window !== 'undefined' && window.__FACEAPI_MODELS_BASE_URL) ? window.__FACEAPI_MODELS_BASE_URL : null;
    if (runtime) return ensureSlash(runtime);
  } catch (e) {}

  const cfg = process.env.REACT_APP_MODELS_URLS || process.env.REACT_APP_MODELS_URL || '/models/';
  return ensureSlash(cfg);
}

// Backwards-compatible wrapper for older imports that expect a boolean-returning
// `preloadFaceApiModels` function. Calls the new `loadFaceApiModels` and
// returns true on success, false otherwise.
export async function preloadFaceApiModels(options = {}) {
  const res = await loadFaceApiModels(options);
  return !!(res && res.success === true);
}
