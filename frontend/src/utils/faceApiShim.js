// Lightweight shim to ensure a minimal environment exists before importing face-api.js
// Some builds or environments expect `process.env` or `navigator` to exist during
// face-api's module initialization. This shim creates minimal globals, then
// dynamically imports `face-api.js` and exposes a getter.

let faceapiPromise = null;

export async function getFaceApi() {
  if (faceapiPromise) return faceapiPromise;

  // Ensure minimal globals expected by some libs
  if (typeof globalThis.process === 'undefined') {
    try {
      globalThis.process = { env: {} };
    } catch (e) {
      /* ignore */
    }
  } else if (!globalThis.process.env) {
    globalThis.process.env = {};
  }

  if (typeof globalThis.navigator === 'undefined') {
    try {
      globalThis.navigator = { userAgent: 'browser' };
    } catch (e) {
      /* ignore */
    }
  }

  faceapiPromise = import('face-api.js').then((mod) => mod).catch((err) => {
    // reset so subsequent calls can retry
    faceapiPromise = null;
    throw err;
  });

  return faceapiPromise;
}
