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
  // Use clones so we don't consume the same body stream twice.
  try {
    const tryJson = resp.clone();
    return await tryJson.json();
  } catch (e) {
    // Fallback: use a fresh clone to read ArrayBuffer and detect/decompress gzip
    try {
      const ar = resp.clone();
      const ab = await arrayBufferFromResponseWithGzipFallback(ar);
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
  // Prefer serving models from the app's public `models/` directory by default.
  if (forceLocal && !modelsUrl) {
    BASE_URL = '/models/';
  } else {
    BASE_URL = modelsUrl || process.env.REACT_APP_MODELS_URLS || process.env.REACT_APP_MODELS_URL || '/models/';
  }
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
    // Some servers may serve gzipped JSON manifests without proper
    // Content-Encoding headers. face-api.js calls `fetch(...).then(r=>r.json())`
    // internally and will throw if it receives compressed bytes. To work
    // around that, temporarily wrap `fetch` so that requests for model
    // manifest/weights JSON are normalized to a decompressed JSON Response.
    const origFetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch.bind(globalThis) : null;
    let fetchedShimInstalled = false;
    let xhrShimInstalled = false;
    let origXHROpen = null;
    let origXHRSend = null;
    // Install a temporary Response.prototype.json wrapper so that any call to
    // `response.json()` during model loading will attempt gzip-detection and
    // decompression before failing. This addresses cases where a caller calls
    // `.json()` on a response whose bytes are compressed but missing
    // Content-Encoding headers.
    const origResponseJson = (typeof Response !== 'undefined' && Response.prototype && Response.prototype.json) ? Response.prototype.json : null;
    let responseJsonShimInstalled = false;
    if (origResponseJson) {
      Response.prototype.json = async function() {
        try {
          // First try the original behavior
          return await origResponseJson.call(this);
        } catch (err) {
          // If parsing failed, attempt to read ArrayBuffer and decompress
          try {
            const ab = await arrayBufferFromResponseWithGzipFallback(this.clone());
            const text = new TextDecoder('utf-8').decode(ab);
            const obj = JSON.parse(text);
            if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) {
              try { console.warn('[FaceApiLoader shim] Response.json fallback parsed decompressed JSON for', (this.url || '(unknown)'), 'size', ab.byteLength); } catch (e) { console.warn('[FaceApiLoader shim] Response.json fallback parsed decompressed JSON'); }
            }
            return obj;
          } catch (err2) {
            if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) {
              try {
                console.error('[FaceApiLoader shim] Response.json fallback failed for', (this.url || '(unknown)'), err2);
              } catch (e) { console.error('[FaceApiLoader shim] Response.json fallback failed', err2); }
            }
            // Re-throw original error to preserve caller behavior
            throw err;
          }
        }
      };
      responseJsonShimInstalled = true;
    }
    if (origFetch) {
      globalThis.fetch = async function(resource, init) {
        try {
          const url = (typeof resource === 'string') ? resource : (resource && resource.url) || '';
          // Intercept only requests that are likely model files (manifests,
          // weight manifests, or binary shards) or that explicitly include
          // the discovered `workingPath`. This avoids trying to parse unrelated
          // network requests (favicons, third-party probes) as JSON.

          const resp = await origFetch(resource, init);
          if (!resp) return resp;

          // Decide whether this URL looks like a model asset we should normalize
          const lower = String(url).toLowerCase();
          const looksLikeModelFile = (
            (workingPath && lower.indexOf(workingPath.toLowerCase()) !== -1) ||
            MODEL_FILES.some(f => lower.endsWith(f.toLowerCase())) ||
            lower.endsWith('models-manifest.json') ||
            lower.endsWith('.bin')
          );
          if (!looksLikeModelFile) return origFetch(resource, init);

          // Try to parse as JSON quickly; if that works, return original response
          try {
            await resp.clone().json();
            if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) console.log('[FaceApiLoader shim] JSON parse succeeded without decompression for', url);
            return resp;
          } catch (e) {
            // Attempt to get ArrayBuffer and decompress if gzipped
            try {
              const ab = await arrayBufferFromResponseWithGzipFallback(resp.clone());
              // Try to parse decompressed bytes as JSON text for diagnostics
              try {
                const txt = new TextDecoder('utf-8').decode(ab);
                JSON.parse(txt);
                const headers = {};
                try { resp.headers.forEach((v, k) => { if (k !== 'content-encoding') headers[k] = v; }); } catch (ee) {}
                if (!headers['content-type']) headers['content-type'] = 'application/json';
                if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) console.log('[FaceApiLoader shim] Decompressed and parsed JSON for', url, '-> size', ab.byteLength);
                return new Response(ab, { status: resp.status, statusText: resp.statusText, headers });
              } catch (parseErr) {
                // Not valid JSON after decompression — log a hex/text snippet for debugging
                if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) {
                  const u8 = new Uint8Array(ab);
                  const hex = Array.from(u8.slice(0, 64)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                  let preview = '';
                  try { preview = new TextDecoder('utf-8', { fatal: false }).decode(u8.slice(0, 128)); } catch (_) { preview = '' }
                  console.warn('[FaceApiLoader shim] Decompressed response is not valid JSON for', url, 'size', ab.byteLength, 'hex64:', hex, 'textPreview:', preview, 'parseError:', parseErr && parseErr.message);
                }
                // Fall back to returning original response so the consumer still errors
                return resp;
              }
            } catch (ee) {
              if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) console.warn('[FaceApiLoader shim] Failed to decompress/normalize response for', url, ee);
              // If anything goes wrong, fall back to original response
              return resp;
            }
          }
        } catch (outer) {
          // If our shim fails, fallback to original fetch
          try { return origFetch(resource, init); } catch (e) { throw outer; }
        }
      };
      fetchedShimInstalled = true;
    }

    // Install XMLHttpRequest shim to diagnose and mitigate XHR-based model fetches.
    if (typeof globalThis.XMLHttpRequest !== 'undefined') {
      try {
        origXHROpen = XMLHttpRequest.prototype.open;
        origXHRSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
          try { this.__fh_url = url; } catch (e) {}
          return origXHROpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function(body) {
          const xhr = this;
          const url = String(xhr.__fh_url || '');
          const lower = url.toLowerCase();
          const looksLikeModelFile = (
            (workingPath && lower.indexOf(workingPath.toLowerCase()) !== -1) ||
            MODEL_FILES.some(f => lower.endsWith(f.toLowerCase())) ||
            lower.endsWith('models-manifest.json') ||
            lower.endsWith('.bin')
          );

          if (looksLikeModelFile) {
            const onLoadHandler = async function() {
              try {
                if (!xhr || !xhr.status || xhr.status < 200 || xhr.status >= 300) return;
                // Try parsing responseText as JSON
                try {
                  JSON.parse(xhr.responseText);
                  // parsed fine
                  return;
                } catch (parseErr) {
                  if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) console.warn('[FaceApiLoader XHR shim] XHR responseText not valid JSON for', url, parseErr && parseErr.message);
                  // Attempt to re-fetch via origFetch and decompress/cache for subsequent consumers
                  if (origFetch) {
                    try {
                      const fresp = await origFetch(url, { mode: 'cors' });
                      if (fresp && fresp.ok) {
                        const ab = await arrayBufferFromResponseWithGzipFallback(fresp.clone());
                        // Try to parse decompressed text
                        try {
                          const txt = new TextDecoder('utf-8').decode(ab);
                          JSON.parse(txt);
                          if (typeof caches !== 'undefined') {
                            try {
                              const cache = await caches.open('faceapi-models');
                              const headers = {};
                              try { fresp.headers.forEach((v, k) => { if (k !== 'content-encoding') headers[k] = v; }); } catch (e) {}
                              if (!headers['content-type']) headers['content-type'] = 'application/json';
                              await cache.put(url, new Response(ab, { headers }));
                              if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) console.warn('[FaceApiLoader XHR shim] Cached decompressed copy for', url);
                            } catch (cacheErr) {
                              if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) console.warn('[FaceApiLoader XHR shim] Failed to cache decompressed copy for', url, cacheErr);
                            }
                          }
                        } catch (parse2) {
                          if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) console.warn('[FaceApiLoader XHR shim] Re-fetched response still not valid JSON for', url, parse2 && parse2.message);
                        }
                      }
                    } catch (reErr) {
                      if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) console.warn('[FaceApiLoader XHR shim] Re-fetch failed for', url, reErr);
                    }
                  }
                }
              } catch (e) {
                if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) console.error('[FaceApiLoader XHR shim] Handler error for', url, e);
              }
            };
            try {
              xhr.addEventListener('load', onLoadHandler);
            } catch (e) {
              try { xhr.onload = onLoadHandler; } catch (ee) {}
            }
          }

          return origXHRSend.apply(this, arguments);
        };

        xhrShimInstalled = true;
      } catch (e) {
        if (typeof window !== 'undefined' && window.__FACEAPI_DEBUG) console.warn('[FaceApiLoader] Failed to install XHR shim', e);
      }
    }

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
      // Restore original fetch if we replaced it
      if (fetchedShimInstalled && origFetch) {
        try { globalThis.fetch = origFetch; } catch (e) { /* ignore */ }
      }
      // Restore Response.prototype.json if we replaced it
      if (responseJsonShimInstalled && origResponseJson) {
        try { Response.prototype.json = origResponseJson; } catch (e) { /* ignore */ }
      }
      // Restore XHR methods if we replaced them
      if (xhrShimInstalled) {
        try {
          if (origXHROpen) XMLHttpRequest.prototype.open = origXHROpen;
        } catch (e) {}
        try {
          if (origXHRSend) XMLHttpRequest.prototype.send = origXHRSend;
        } catch (e) {}
      }
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

  // Allow forcing local models at runtime or via build env
  try {
    if (typeof window !== 'undefined' && window.__FACEAPI_FORCE_LOCAL) return ensureSlash('/models/');
  } catch (e) {}
  try {
    if (process && process.env && String(process.env.REACT_APP_FORCE_LOCAL_MODELS).toLowerCase() === 'true') return ensureSlash('/public/models/');
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
