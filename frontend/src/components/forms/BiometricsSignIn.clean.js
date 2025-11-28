// Minimal, match-only BiometricsSignIn (clean copy)
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { preloadFaceApiModels } from '../../utils/FaceApiLoader';
import { getFaceApi } from '../../utils/faceApiShim';
import descriptorDB from '../../utils/descriptorDB';

export default function BiometricsSignIn({
  ids = [],
  scoreThreshold = 0.6,
  onResult = () => {},
  onCompleted = () => {},
  onCancel = () => {},
  inputSize = 160,
  debug = false,
  // Controls for parents that orchestrate group sign-ins
  startRecordingRequest = 0,
  stopRecordingRequest = 0,
  forceOperation = null,
  hidePrimaryControls = false,
  scrollIntoViewOnMount = false,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceapiRef = useRef(null);
  const matcherRef = useRef(null);
  const intervalRef = useRef(null);
  const startReqRef = useRef(startRecordingRequest);
  const stopReqRef = useRef(stopRecordingRequest);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('loading');
  const [lastMatch, setLastMatch] = useState(null);
  const lastActionRef = useRef({ time: 0, id: null, type: null });

  const stopCamera = useCallback(() => {
    try {
      if (debug) console.debug('[BiometricsSignIn] stopCamera called');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    } catch (e) {
      if (debug) console.warn('stopCamera', e);
    }
  }, [debug]);

  const buildMatcher = useCallback(async () => {
    const faceapi = faceapiRef.current;
    if (!faceapi) return null;
    const labeled = [];
    for (const id of ids) {
      try {
        const raw = await descriptorDB.getDescriptor(id);
        if (!raw || !Array.isArray(raw) || raw.length === 0) continue;
        const arrs = raw.map((r) => new Float32Array(r));
        labeled.push(new faceapi.LabeledFaceDescriptors(String(id), arrs));
      } catch (e) {
        if (debug) console.warn('descriptor load failed for', id, e);
      }
    }
    if (!labeled.length) return null;
    const fm = new faceapi.FaceMatcher(labeled, scoreThreshold);
    matcherRef.current = fm;
    return fm;
  }, [ids, scoreThreshold, debug]);

  const startCamera = useCallback(async () => {
    try {
      if (debug) console.debug('[BiometricsSignIn] startCamera requested');
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        try { await videoRef.current.play(); } catch (_) {}
      }
      if (debug) console.debug('[BiometricsSignIn] startCamera success');
      return true;
    } catch (e) {
      if (debug) console.error('startCamera failed', e);
      return false;
    }
  }, [debug]);

  useEffect(() => {
    let mounted = true;
    if (debug) console.debug('[BiometricsSignIn] mount/init');
    (async () => {
      setStatus('loading');
      try {
        const ok = await preloadFaceApiModels({ variant: 'tiny' });
        if (!ok) { setStatus('models-unavailable'); return; }
        faceapiRef.current = await getFaceApi();
        await buildMatcher();
        const camOk = await startCamera();
        if (!camOk) { setStatus('camera-error'); return; }
        if (mounted) setStatus('ready');
        if (debug) console.debug('[BiometricsSignIn] models loaded and camera ready');
      } catch (err) {
        if (debug) console.error('init error', err);
        setStatus('error');
      }
    })();
    return () => { mounted = false; if (debug) console.debug('[BiometricsSignIn] unmount'); stopCamera(); if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [buildMatcher, startCamera, stopCamera, debug]);

  useEffect(() => {
    if (status !== 'ready' || !isRecording) return;
    const faceapi = faceapiRef.current;
    if (!faceapi || !matcherRef.current || !videoRef.current) return;
    let running = true;
    const detect = async () => {
      try {
        if (!running || !videoRef.current || videoRef.current.readyState < 2) return;
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.5 });
        const res = await faceapi.detectSingleFace(videoRef.current, options).withFaceLandmarks().withFaceDescriptor();
        if (!res || !res.descriptor) return;
        const match = matcherRef.current.findBestMatch(res.descriptor);
        if (match && match.label && match.label !== 'unknown') {
          const payload = { id: match.label, distance: match.distance };
          setLastMatch(payload);
          try { onResult(payload); } catch (e) { if (debug) console.error('onResult cb', e); }
        }
      } catch (e) { if (debug) console.warn('detect error', e); }
    };
    intervalRef.current = setInterval(detect, 350);
    return () => { running = false; if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [status, inputSize, onResult, scoreThreshold, debug]);

  // React to parent start/stop requests (incrementing counters)
  useEffect(() => {
    if (startRecordingRequest !== startReqRef.current) {
      startReqRef.current = startRecordingRequest;
      // start detection (keep camera running)
      if (status === 'ready') setIsRecording(true);
      else {
        // if models/camera not ready yet, mark recording for when ready
        const unlisten = () => setIsRecording(true);
        // no direct subscription; rely on existing init flow — set flag now
        setIsRecording(true);
      }
    }
  }, [startRecordingRequest, status]);

  useEffect(() => {
    if (stopRecordingRequest !== stopReqRef.current) {
      stopReqRef.current = stopRecordingRequest;
      // stop detection but keep camera mounted if desired; parent decides
      setIsRecording(false);
      // optionally stop camera if not continuous (no future starts expected)
    }
  }, [stopRecordingRequest]);

  const captureSnapshot = useCallback(() => {
    try {
      const v = videoRef.current; if (!v) return null;
      const w = v.videoWidth || 320; const h = v.videoHeight || 240;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.drawImage(v, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.8);
    } catch (e) { if (debug) console.warn('snapshot failed', e); return null; }
  }, [debug]);

  const handleAction = useCallback(async (type) => {
    const now = Date.now(); const match = lastMatch; if (!match || !match.id) return;
    const last = lastActionRef.current; if (last.id === match.id && last.type === type && now - last.time < 4000) { if (debug) return; }
    lastActionRef.current = { time: now, id: match.id, type };
    const snapshot = captureSnapshot();
    try { onCompleted({ id: match.id, type, time: now, snapshot }); } catch (e) { if (debug) console.error('onCompleted cb', e); }
    // Do not automatically stop camera here — parent controls stopRecordingRequest.
    if (!isRecording && !forceOperation) stopCamera();
  }, [captureSnapshot, lastMatch, onCompleted, stopCamera, debug, isRecording, forceOperation]);

  const handleCancel = useCallback(() => { stopCamera(); try { onCancel(); } catch (e) { if (debug) console.error('onCancel', e); } }, [onCancel, stopCamera, debug]);

  // scroll into view if requested
  useEffect(() => {
    if (scrollIntoViewOnMount && videoRef.current && typeof videoRef.current.scrollIntoView === 'function') {
      try { videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* ignore */ }
    }
  }, [scrollIntoViewOnMount]);

  // Only show textual status messages when the camera/video is not present; when
  // the video is mounted we prefer to overlay status inline (avoid flicker and
  // stray 'Loading models...' text under the video).
  const videoMounted = !!(videoRef.current && (videoRef.current.srcObject || videoRef.current.src));

  return (
    React.createElement('div', { className: 'biometrics-signin' },
      !videoMounted && status === 'loading' && React.createElement('div', null, 'Loading models...'),
      !videoMounted && status === 'models-unavailable' && React.createElement('div', null, 'Face models unavailable.'),
      !videoMounted && status === 'camera-error' && React.createElement('div', null, 'Camera access denied.'),
      !videoMounted && status === 'error' && React.createElement('div', null, 'Biometrics failed to initialize.'),
      React.createElement('div', { style: { display: status === 'ready' ? 'block' : 'none' } },
        React.createElement('video', { ref: videoRef, style: { width: '320px', height: '240px', background: '#000' }, autoPlay: true, muted: true }),
        !hidePrimaryControls && React.createElement('div', { style: { marginTop: 8 } },
          React.createElement('button', { type: 'button', onClick: () => { setIsRecording(true); handleAction('sign_in'); } }, 'Sign In'),
          React.createElement('button', { type: 'button', onClick: () => { setIsRecording(true); handleAction('sign_out'); }, style: { marginLeft: 8 } }, 'Sign Out'),
          React.createElement('button', { type: 'button', onClick: () => { setIsRecording(false); handleCancel(); }, style: { marginLeft: 8 } }, 'Cancel')
        ),
        lastMatch && React.createElement('div', { style: { marginTop: 6 } }, `Match: ${lastMatch.id} (distance ${Number(lastMatch.distance).toFixed(3)})`)
      )
    )
  );
}
