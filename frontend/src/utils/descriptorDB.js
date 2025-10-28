// Lightweight IndexedDB helper for storing face descriptors per id
const DB_NAME = "face-descriptors-db";
const STORE_NAME = "descriptors";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getDescriptor(id) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const r = store.get(id.toString());
      r.onsuccess = () => resolve(r.result ? r.result.descriptors : null);
      r.onerror = () => reject(r.error);
    });
  } catch (err) {
    console.warn("descriptorDB.getDescriptor failed", err);
    return null;
  }
}

export async function setDescriptor(id, descriptors) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const payload = {
        id: id.toString(),
        descriptors,
        updatedAt: Date.now(),
      };
      const r = store.put(payload);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  } catch (err) {
    console.warn("descriptorDB.setDescriptor failed", err);
    return false;
  }
}

export async function clearDescriptors() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const r = store.clear();
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  } catch (err) {
    console.warn("descriptorDB.clearDescriptors failed", err);
    return false;
  }
}

export default { getDescriptor, setDescriptor, clearDescriptors };
