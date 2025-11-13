# Biometric & Offline Data (internal)

This document explains where biometric data (face images/descriptors) and offline queues are stored and how to clear them.

Locations and mechanisms
- Face descriptors: stored in the `tables` object store of IndexedDB under keys named `face_descriptors_<entityId>`. Managed by `src/utils/faceDescriptorCache.js`.
- Profile images: stored in a dedicated IndexedDB database `profile-images-cache` (see `src/utils/imageCache.js`).
- Queued mutations & file blobs: stored in the `mutations` and `files` object stores under the `GCU_Schools_offline` DB. Managed by `src/utils/tableCache.js`.

User-facing controls
- Settings → Offline & Biometric Settings provides buttons to:
  - Enable/update biometric consent (local opt-in)
  - Delete all biometric descriptors
  - Clear cached profile images
  - Clear queued mutations (discard pending offline changes)

Developer utilities
- For development you can use global helpers on the window (exposed in `src/index.js`):
  - `window.seedSchoolsCache()`
  - `window.verifySchoolsCache()`
  - `window.refreshCache()`

Commands and direct DB management
- Inspect IndexedDB: Chrome DevTools → Application → IndexedDB → `GCU_Schools_offline` / `profile-images-cache`.
- To programmatically clear everything (developer): `await import('./src/utils/tableCache').then(m => m.resetOfflineDB())` in console.
