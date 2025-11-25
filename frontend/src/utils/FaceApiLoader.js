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

async function arrayBufferFromResponseWithGzipFallback(resp) {
  // No client-side gzip fallback: return raw bytes as served by the server.
  return await resp.arrayBuffer();
}

async function parseJsonResponseWithGzipFallback(resp) {
  // No gzip fallback: rely on server to return JSON with correct headers.
  return await resp.json();
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
        try { details.errorMessage = e && e.message ? e.message : String(e); } catch (ee) {}
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
export async function loadFaceApiModels({ variant = 'tiny', modelsUrl = null, baseUrl = null, requireWifi = false, requireConsent = false, allowRemote = false } = {}) {
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

  // Prefer explicit param, then environment/runtime overrides, then REACT_APP_MODELS_URLS (plural), then REACT_APP_MODELS_URL, then default
  // Support a temporary force-local flag to prefer the app's bundled `/public/models/` while hosted models are fixed.
  // - Build-time env: REACT_APP_FORCE_LOCAL_MODELS === 'true'
  // - Runtime override: window.__FACEAPI_FORCE_LOCAL === true
  let forceLocal = false;
  try {
    if (typeof window !== 'undefined' && window.__FACEAPI_FORCE_LOCAL) forceLocal = true;
  } catch (e) {}
  try {
    if (process && process.env && String(process.env.REACT_APP_FORCE_LOCAL_MODELS).toLowerCase() === 'true') forceLocal = true;
  } catch (e) {}

  let BASE_URL = null;
  // Determine whether remote models are allowed. By default, disallow remote
  // model downloads so the app uses its bundled public/models directory.
  let allowRemoteEnv = false;
  try {
    if (typeof window !== 'undefined' && window.__FACEAPI_ALLOW_REMOTE) allowRemoteEnv = true;
  } catch (e) {}
  try {
    if (process && process.env && String(process.env.REACT_APP_ALLOW_REMOTE_MODELS).toLowerCase() === 'true') allowRemoteEnv = true;
  } catch (e) {}
  const allowRemoteFinal = allowRemote || allowRemoteEnv;

  // If caller provided an explicit baseUrl use that first (e.g. caller verified it)
  if (baseUrl) {
    BASE_URL = baseUrl;
  } else if (!allowRemoteFinal) {
    // Force local public models
    BASE_URL = '/models/';
  } else {
    if (forceLocal && !modelsUrl) {
      BASE_URL = '/models/';
    } else {
      BASE_URL = modelsUrl || process.env.REACT_APP_MODELS_URLS || process.env.REACT_APP_MODELS_URL || '/models/';
    }
  }
  BASE_URL = ensureSlash(BASE_URL);
  try { console.info('[FaceApiLoader] models base URL chosen:', BASE_URL, 'allowRemote=', allowRemoteFinal); } catch (e) {}

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
    try { console.warn('[FaceApiLoader] no workingPath from probes', probeResults); } catch (e) {}
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
            // If manifest exists but cannot be parsed (e.g., server returned HTML index),
            // log a warning and continue without manifest checks rather than aborting.
            console.warn('[FaceApiLoader] models-manifest.json is not valid JSON or could not be parsed; continuing without manifest checks', e);
            manifest = null;
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

              // If this is a weights manifest, try to parse and log a compact summary
              try {
                if (f.toLowerCase().endsWith('weights_manifest.json')) {
                  try {
                    const txt = new TextDecoder('utf-8').decode(ab);
                    const parsed = JSON.parse(txt);
                    // parsed is typically an array of manifest groups; summarize names/shapes
                    const summary = (Array.isArray(parsed) ? parsed : [parsed]).map((g) => {
                      if (!g.weights) return { info: 'no weights array' };
                      return g.weights.map(w => ({ name: w.name, shape: w.shape }));
                    });
                    console.log('[FaceApiLoader] Weight manifest summary for', f, summary);
                  } catch (e) {
                    console.warn('[FaceApiLoader] Failed to parse weight manifest', f, e);
                  }
                }
              } catch (logErr) {
                console.warn('[FaceApiLoader] weight manifest logging failed', f, logErr);
              }

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
    // No fetch/Response/XHR gzip shims: rely on server to serve correct bytes and headers.

    try {
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
    } finally {
      // Nothing to restore because no runtime shims were installed.
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
  // If remote models are not explicitly allowed, always return local `/models/`.
  let allowRemoteEnv = false;
  try {
    if (typeof window !== 'undefined' && window.__FACEAPI_ALLOW_REMOTE) allowRemoteEnv = true;
  } catch (e) {}
  try {
    if (process && process.env && String(process.env.REACT_APP_ALLOW_REMOTE_MODELS).toLowerCase() === 'true') allowRemoteEnv = true;
  } catch (e) {}
  if (!allowRemoteEnv) return ensureSlash('/models/');

  // Remote models allowed: prefer last discovered working path
  if (lastBaseUrl) return lastBaseUrl;
  // allow a runtime override for debugging without rebuild: window.__FACEAPI_MODELS_BASE_URL
  try {
    // eslint-disable-next-line no-undef
    const runtime = (typeof window !== 'undefined' && window.__FACEAPI_MODELS_BASE_URL) ? window.__FACEAPI_MODELS_BASE_URL : null;
    if (runtime) return ensureSlash(runtime);
  } catch (e) {}

  // Allow forcing local models at runtime or via build env
  try {
    if (typeof window !== 'undefined' && window.__FACEAPI_FORCE_LOCAL) return ensureSlash('/models/');
  } catch (e) {}
  try {
    if (process && process.env && String(process.env.REACT_APP_FORCE_LOCAL_MODELS).toLowerCase() === 'true') return ensureSlash('/models/');
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
