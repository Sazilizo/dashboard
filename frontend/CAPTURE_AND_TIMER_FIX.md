# Capture Button & Timer Implementation

## Issues Fixed

### 1. Capture Button Not Working
**Problem:** User reported clicking the capture button multiple times with no response.

**Root Cause:** 
- Using async `toBlob()` callback which was unreliable for triggering state updates
- No validation of video dimensions before capture
- Potential race conditions with async operations

**Solution:**
- Changed from `toBlob()` to synchronous `toDataURL()`
- Added video dimension validation before capture
- Removed unnecessary async/await
- Added proper error handling

**Code Changes:**
```javascript
// Before: Async with toBlob
const capturePhoto = useCallback(async () => {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    setCapturedPhoto(url);
  }, 'image/jpeg', 0.92);
}, []);

// After: Synchronous with toDataURL
const capturePhoto = useCallback(() => {
  // Validate dimensions
  if (!video.videoWidth || !video.videoHeight) {
    return;
  }
  
  // Direct synchronous conversion
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  setCapturedPhoto(dataUrl);
}, []);
```

### 2. Timer Display Added
**Problem:** User wanted to see exactly how long the camera is active.

**Solution:** Added elapsed time timer with the following features:
- Updates every 100ms for smooth display
- Shows time in seconds with 1 decimal place (e.g., "2.5s")
- Starts automatically when camera initializes
- Stops when:
  - Photo is captured
  - Match is confirmed
  - Component unmounts
- Restarts when user clicks "Retake"

**Implementation Details:**

#### State Variables (Line 186-188)
```javascript
const [elapsedTime, setElapsedTime] = useState(0);
const timerRef = useRef(null);
const startTimeRef = useRef(null);
```

#### Timer Start Locations

**Fast Path** (Line 248-251) - When cached descriptors exist:
```javascript
startTimeRef.current = Date.now();
timerRef.current = setInterval(() => {
  setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 100) / 10);
}, 100);
```

**Slow Path** (Line 371-374) - When building descriptors:
```javascript
startTimeRef.current = Date.now();
timerRef.current = setInterval(() => {
  setElapsedTime((Date.now() - startTimeRef.current) / 1000);
}, 100);
```

**Retake Handler** (Line 607-610) - When user retakes photo:
```javascript
setElapsedTime(0);
startTimeRef.current = Date.now();
timerRef.current = setInterval(() => {
  setElapsedTime((Date.now() - startTimeRef.current) / 1000);
}, 100);
```

#### Timer Stop Locations

**Component Unmount** (Line 389-391):
```javascript
if (timerRef.current) {
  clearInterval(timerRef.current);
}
```

**Match Confirmed** (Line 432-434):
```javascript
if (timerRef.current) {
  clearInterval(timerRef.current);
  timerRef.current = null;
}
```

**Photo Captured** (Line 491-493):
```javascript
if (timerRef.current) {
  clearInterval(timerRef.current);
  timerRef.current = null;
}
```

#### UI Display (Line 628-632)
```javascript
{!loading && !capturedPhoto && elapsedTime > 0 && (
  <p style={{ margin: "4px 0", color: "#6b7280", fontSize: "0.85rem", fontFamily: "monospace" }}>
    ⏱️ {elapsedTime.toFixed(1)}s
  </p>
)}
```

**Display Logic:**
- Only shows when camera is active (`!loading`)
- Hidden when photo is captured (`!capturedPhoto`)
- Only appears after first update (`elapsedTime > 0`)
- Uses monospace font for consistent width
- Shows clock emoji ⏱️ for visual clarity

## Testing Recommendations

### Capture Button
1. Open biometric verification
2. Wait for camera to load
3. Click "Capture" button
4. Photo should appear instantly
5. Click "Retake" button
6. Camera should restart immediately

### Timer Display
1. Open biometric verification
2. Timer should appear when camera loads
3. Timer should increment smoothly (0.1s intervals)
4. Timer should stop when:
   - Photo is captured
   - Face match is confirmed
5. Timer should reset to 0.0s when "Retake" is clicked

### Edge Cases
- Test with slow network (descriptor caching)
- Test with fast cached path
- Test rapid capture/retake cycles
- Test navigation away during camera operation

## Performance Impact

- Timer interval: 100ms (low overhead)
- No memory leaks (proper cleanup on unmount)
- Timer stops when not needed (photo captured, match confirmed)
- Synchronous capture for instant feedback

## Files Modified

- `src/components/biometrics/WorkerBiometrics.js` (749 lines)
  - Added timer state and refs
  - Fixed capture button logic
  - Added timer management in all camera lifecycle paths
  - Added UI display for elapsed time
