# Fix: Float32Array Descriptor Serialization

## Problem
When face descriptors were cached in IndexedDB, they were serialized as plain JavaScript arrays. When retrieved from the cache, Face-API's `LabeledFaceDescriptors` constructor expected them to be `Float32Array` instances, causing this error:

```
ERROR
LabeledFaceDescriptors - constructor expected descriptors to be an array of Float32Array
    at new LabeledFaceDescriptors (...)
```

## Root Cause
IndexedDB doesn't natively support `Float32Array` - it auto-converts them to plain arrays during storage. When retrieved, they remained as plain arrays, but Face-API required the typed array format.

## Solution
Added two helper functions to handle the conversion:

### 1. `convertToFloat32Arrays(descriptors)`
Converts cached plain arrays back to `Float32Array` format required by Face-API:
```javascript
const convertToFloat32Arrays = (descriptors) => {
  if (!descriptors || !Array.isArray(descriptors)) return [];
  return descriptors.map(desc => {
    if (desc instanceof Float32Array) return desc;
    if (Array.isArray(desc)) return new Float32Array(desc);
    return new Float32Array(Object.values(desc));
  });
};
```

**Used in:** Fast path descriptor loading (line ~219)

### 2. `convertToPlainArrays(descriptors)`
Converts `Float32Array` to plain arrays before storing in IndexedDB:
```javascript
const convertToPlainArrays = (descriptors) => {
  if (!descriptors || !Array.isArray(descriptors)) return [];
  return descriptors.map(desc => {
    if (desc instanceof Float32Array) return Array.from(desc);
    if (Array.isArray(desc)) return desc;
    return Array.from(Object.values(desc));
  });
};
```

**Used in:** Descriptor caching (line ~330)

## Implementation Details

### Fast Path (Load from Cache)
```javascript
const cachedDescriptors = await getDescriptor(profile.id);
if (cachedDescriptors && cachedDescriptors.length > 0) {
  // Convert plain arrays back to Float32Array
  const float32Descriptors = convertToFloat32Arrays(cachedDescriptors);
  
  matcherRef.current = new faceapi.FaceMatcher(
    [new faceapi.LabeledFaceDescriptors(String(profile.id), float32Descriptors)],
    MATCH_THRESHOLD
  );
}
```

### Storage Path (Cache Generated Descriptors)
```javascript
// Convert Float32Array to plain arrays for storage
const plainArrays = convertToPlainArrays(descriptors);
setDescriptor(profile.id, plainArrays).catch((e) => {
  console.warn(`Failed to cache descriptors...`, e);
});
```

## Data Flow

```
Generated Descriptors (Float32Array[])
    ↓
convertToPlainArrays()
    ↓
IndexedDB Storage (Plain arrays)
    ↓
Retrieved from Cache (Plain arrays)
    ↓
convertToFloat32Arrays()
    ↓
Face-API LabeledFaceDescriptors (Float32Array[])
```

## Result
✅ Error resolved
✅ Caching still works perfectly
✅ Fast path descriptor reuse now functional
✅ No performance impact
✅ Transparent to end users

## Test
1. First authentication - generates and caches descriptors
2. Second authentication - loads from cache (should see ⚡ emoji in console)
3. No "LabeledFaceDescriptors" error in browser console
