import { getDB } from "./tableCache";

/**
 * Compress an image to JPEG and return Blob
 */
export async function compressImageBlob(blob, maxWidth = 256, quality = 0.6) {
  if (!blob) return null;
  const img = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  const scale = Math.min(maxWidth / img.width, 1);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise((resolve) => {
    canvas.toBlob(
      (resized) => resolve(resized),
      "image/jpeg",
      quality
    );
  });
}

/**
 * Save compressed image + descriptors in IndexedDB
 */
export async function cacheFaceReference(entityType, entityId, imageBlob, descriptors) {
  try {
    const db = await getDB();
    const compressed = await compressImageBlob(imageBlob);
    const tx = db.transaction("files", "readwrite");
    await tx.store.put({
      key: `${entityType}_${entityId}_face_ref`,
      image: compressed,
      descriptors,
      timestamp: Date.now(),
    });
    await tx.done;
    console.info(`[faceReferenceCache] Cached reference for ${entityType}#${entityId}`);
  } catch (err) {
    console.error("[faceReferenceCache] failed to cache reference:", err);
  }
}

/**
 * Get face reference by entity ID
 */
export async function getFaceReference(entityType, entityId) {
  try {
    const db = await getDB();
    const tx = db.transaction("files");
    const all = await tx.store.getAll();
    const ref = all.find((r) => r.key === `${entityType}_${entityId}_face_ref`);
    if (!ref) return null;
    return ref;
  } catch (err) {
    console.error("[faceReferenceCache] failed to get reference:", err);
    return null;
  }
}

/**
 * Convert Blob to ImageBitmap for face-api
 */
export async function blobToImage(blob) {
  if (!blob) return null;
  return await createImageBitmap(blob);
}

/**
 * Remove cached references
 */
export async function clearFaceReferences() {
  const db = await getDB();
  const tx = db.transaction("files", "readwrite");
  const all = await tx.store.getAllKeys();
  for (const key of all) {
    if (String(key).includes("_face_ref")) await tx.store.delete(key);
  }
  await tx.done;
  console.info("[faceReferenceCache] cleared all face refs");
}
