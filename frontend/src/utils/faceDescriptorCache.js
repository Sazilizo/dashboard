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
