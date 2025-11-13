import { getDB } from "./tableCache";

// Cache face descriptor arrays for offline use
export async function cacheFaceDescriptors(studentId, descriptors) {
  const db = await getDB();
  const tx = db.transaction("tables", "readwrite");
  await tx.store.put({
    name: `face_descriptors_${studentId}`,
    rows: descriptors,
  });
  await tx.done;
}

export async function getFaceDescriptors(studentId) {
  const db = await getDB();
  const entry = await db.get("tables", `face_descriptors_${studentId}`);
  return entry?.rows || [];
}

export async function removeFaceDescriptors(studentId) {
  try {
    const db = await getDB();
    const tx = db.transaction("tables", "readwrite");
    await tx.store.delete(`face_descriptors_${studentId}`);
    await tx.done;
    console.log(`[faceDescriptorCache] Removed descriptors for ${studentId}`);
    return true;
  } catch (err) {
    console.warn('[faceDescriptorCache] removeFaceDescriptors failed', err);
    return false;
  }
}

export async function clearAllFaceDescriptors() {
  try {
    const db = await getDB();
    const tx = db.transaction("tables", "readwrite");
    const keys = await tx.store.getAllKeys();
    for (const k of keys) {
      if (typeof k === 'string' && k.startsWith('face_descriptors_')) {
        await tx.store.delete(k);
      }
    }
    await tx.done;
    console.log('[faceDescriptorCache] Cleared all face descriptors');
    return true;
  } catch (err) {
    console.warn('[faceDescriptorCache] clearAllFaceDescriptors failed', err);
    return false;
  }
}
