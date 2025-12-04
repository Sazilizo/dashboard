// Stubbed face descriptor cache. Real implementation removed during cleanup.
export const getFaceDescriptors = async (id) => {
  if (typeof console !== 'undefined') console.warn('faceDescriptorCache.getFaceDescriptors called (stub)');
  return null;
};

export const removeFaceDescriptors = async (id) => {
  if (typeof console !== 'undefined') console.warn('faceDescriptorCache.removeFaceDescriptors called (stub)');
  return true;
};

export const clearAllFaceDescriptors = async () => {
  if (typeof console !== 'undefined') console.warn('faceDescriptorCache.clearAllFaceDescriptors called (stub)');
  return true;
};

export default { getFaceDescriptors, removeFaceDescriptors, clearAllFaceDescriptors };
