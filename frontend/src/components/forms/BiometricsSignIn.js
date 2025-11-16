import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { getFaceApi } from "../../utils/faceApiShim";
import descriptorDB from "../../utils/descriptorDB";
import imageCache from "../../utils/imageCache";
import { validateAuthToken } from "../../utils/authTokenGenerator";
// worker path (webpack friendly) - descriptor worker runs face-api inside the worker
let DescriptorWorker = null;
try {
  DescriptorWorker = new Worker(new URL("../../workers/descriptor.worker.js", import.meta.url), { type: "module" });
} catch (err) {
  console.warn("Descriptor worker not available, falling back to main-thread processing", err);
  DescriptorWorker = null;
}
// models URL (can be configured via env var REACT_APP_MODELS_URL)
const MODELS_URL = process.env.REACT_APP_MODELS_URL || "/models";

// Bucket/folder mapping for different entity types
const STORAGE_PATHS = {
  'student-uploads': (id) => `students/${id}/profile-picture`,
  'worker-uploads': (id) => `workers/${id}/profile-picture`,
  'profile-avatars': (id) => ''  // For users, files are directly in the bucket root
};
import {
  preloadFaceApiModels,
  areFaceApiModelsLoaded,
} from "../../utils/FaceApiLoader";
import { getTable, cacheTable } from "../../utils/tableCache";
import useOfflineTable from "../../hooks/useOfflineTable";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import useToast from "../../hooks/useToast";
import "../../styles/BiometricsSignIn.css";

// Toggle verbose logs for debugging
const DEBUG = false;
// Lightweight in-app performance overlay for timing key steps
const PERF_UI = false;

// Component wrapper (was accidentally removed during edits) — recreate component and needed hooks/refs
const BiometricsSignIn = ({
  entityType = 'student',
  studentId = null,
  userId = null,
  schoolId = null,
  academicSessionId = null,
  // sessionType controls which participants table to write to (e.g. 'academic_session_participants' or 'pe_session_participants')
  sessionType = 'academic_session_participants',
  onCompleted = null,
  onCancel = null,
  forceOperation = null,
  // initial mode: 'snapshot' or 'continuous'
  mode: initialMode = 'snapshot',
  // UI customization props
  primaryActionLabel = null, // override main capture button label (e.g., 'Log In')
  primaryRecordStartLabel = null, // override 'Record Session' label
  primaryRecordEndLabel = null, // override 'End Session' label
  closeOnStart = true, // whether to close/unmount the biometric UI when recording session starts
  onRecordingStart = null, // optional callback fired when continuous recording starts
  onRecordingStop = null, // optional callback fired when continuous recording stops
  // parent can request recording stop by incrementing this counter
  stopRecordingRequest = 0,
  // parent can request a cancel-stop (stop recording but do NOT commit attendance/participants)
  stopRecordingCancelRequest = 0,
  // storage customization (optional) - used when loading student images
  bucketName = null, // e.g. 'student-uploads' or 'worker-uploads'
  // Optional hooks parents can pass to receive structured events
  onSignIn = null, // (info) => {}
  onSignOut = null, // (info) => {}
  folderName = null,
}) => {
  // External control: parent or global events can request sign-in/sign-out operations.
  const [externalForceOperation, setExternalForceOperation] = useState(null);
  const effectiveForceOperation = externalForceOperation || forceOperation;
  // basic UI/state refs
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [captureDone, setCaptureDone] = useState(false);
  const [referencesReady, setReferencesReady] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [studentNames, setStudentNames] = useState({});
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(null);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [facingMode, setFacingMode] = useState('user');
  const [webcamError, setWebcamError] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [showAttendancePrompt, setShowAttendancePrompt] = useState(false);
  const [pendingAttendanceData, setPendingAttendanceData] = useState(null);
  const [pendingSignIns, setPendingSignIns] = useState({});
  // Recorded participants for the active session (local UI view)
  const [recordedParticipants, setRecordedParticipants] = useState([]);
  const [tick, setTick] = useState(0); // used to refresh elapsed times

  // Helper to add a participant to the recorded list (start)
  const addRecordedParticipant = (student_id, displayName, signInTime, attendanceId = null, isWorker = false) => {
    setRecordedParticipants((prev) => {
      // avoid duplicates for same active student
      const exists = prev.find(p => String(p.student_id) === String(student_id) && !p.signOutTime);
      if (exists) return prev;
      return [...prev, { student_id: String(student_id), displayName, signInTime, attendanceId, signOutTime: null, durationMinutes: null, isWorker }];
    });
  };

  // Helper to mark a participant as completed (stop)
  const completeRecordedParticipant = (student_id, signOutTime) => {
    setRecordedParticipants((prev) => prev.map(p => {
      if (String(p.student_id) === String(student_id) && !p.signOutTime) {
        const start = new Date(p.signInTime).getTime();
        const end = signOutTime ? new Date(signOutTime).getTime() : Date.now();
        const minutes = start && end ? ((end - start) / (1000 * 60)) : null;
        return { ...p, signOutTime, durationMinutes: minutes !== null ? Number(minutes.toFixed(2)) : null };
      }
      return p;
    }));
  };

  // Live tick to refresh UI durations while recording
  useEffect(() => {
    let intv;
    if (mode === 'continuous') {
      intv = setInterval(() => setTick(t => t + 1), 2000);
    }
    return () => { if (intv) clearInterval(intv); };
  }, [mode]);
  const [workerAvailable, setWorkerAvailable] = useState(false);
  const [workerError, setWorkerError] = useState(null);
  const [workerReloadKey, setWorkerReloadKey] = useState(0);
  const [mode, setMode] = useState(initialMode);
  
  // Retry indicators for loading face references
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryInSec, setRetryInSec] = useState(null);
  const retryIntervalRef = useRef(null);
  // small retry tuning
  const maxRetries = 3;
  const retryTimeouts = [2000, 4000, 8000];
  // Recording start timestamp (ISO) when continuous recording begins
  const recordingStartRef = useRef(null);
  // Face matcher distance threshold (lower = stricter). 0.6 is a common default for face-api
  const threshold = 0.6;

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const processIntervalRef = useRef(null);
  const perfRef = useRef({});
  const descriptorWorkerRef = useRef(null);
  const faceapiRef = useRef(null);

  // small helpers / hooks
  const isSmallScreen = window && window.innerWidth && window.innerWidth < 640;
  const isOnline = useOnlineStatus();
  const toast = useToast();
  const navigate = useNavigate();

  // Determine effective storage bucket to use when fetching images
  const effectiveBucket = bucketName || (entityType === 'user' ? 'profile-avatars' : 'student-uploads');

  // Listen for global signout/signin requests so overlays mounted anywhere can respond.
  useEffect(() => {
    const onRequest = (ev) => {
      try {
        const detail = ev?.detail || {};
        if (detail?.operation === 'signout' || detail?.operation === 'signin') {
          setExternalForceOperation(detail.operation);
          // If a profile/entity id was provided, update local ids so the component can load references
          if (detail.profileId || detail.entityId || detail.userId) {
            // prefer userId for entityType 'user'
            if (detail.userId) {
              // update userId prop is not writable; instead, store requested IDs for immediate use
              // set temporary ids to trigger reference loading
              // Use refs to avoid re-rendering parent props
              // Note: we rely on consumer to pass updated props when available; this is a best-effort notification
            }
          }
          // also surface token input when applicable
          if (detail && detail.forceShowToken) setShowTokenInput(true);
        }
      } catch (e) {
        if (DEBUG) console.warn('app:request-signout handler failed', e);
      }
    };

    window.addEventListener('app:request-signout', onRequest);
    return () => window.removeEventListener('app:request-signout', onRequest);
  }, []);

  // Listen for completion events so we can clear external request state
  useEffect(() => {
    const onComplete = (ev) => {
      try {
        setExternalForceOperation(null);
        // hide token input if it was shown for this operation
        setShowTokenInput(false);
      } catch (e) {
        if (DEBUG) console.warn('app:request-signout-complete handler failed', e);
      }
    };
    window.addEventListener('app:request-signout-complete', onComplete);
    return () => window.removeEventListener('app:request-signout-complete', onComplete);
  }, []);

  // Offline table hooks for attendance and worker attendance
  const { addRow, updateRow } = useOfflineTable('attendance_records');
  const { addRow: addWorkerRow, updateRow: updateWorkerRow } = useOfflineTable('worker_attendance_records');
  // offline hook for session participants (academic_session_participants)
  const { addRow: addParticipantRow, updateRow: updateParticipantRow } = useOfflineTable(sessionType);

  // cache for descriptors (module-level in original; keep per-instance here)
  const faceDescriptorCache = {};


  useEffect(() => {
    let cancelled = false;
    const ensureModelsReady = async () => {
      perfRef.current.modelsStart = (performance.now ? performance.now() : Date.now());
      if (areFaceApiModelsLoaded()) {
        // ensure faceapi module is available
        try {
          faceapiRef.current = await getFaceApi();
        } catch (e) {
          if (DEBUG) console.warn('Failed to get faceapi module after models loaded', e);
        }
        setLoadingModels(false);
        perfRef.current.modelsEnd = (performance.now ? performance.now() : Date.now());
        if (PERF_UI) snapPerf();
        return;
      }
      try {
        await preloadFaceApiModels();
        try {
          faceapiRef.current = await getFaceApi();
        } catch (e) {
          if (DEBUG) console.warn('Failed to import faceapi after preloading models', e);
        }
        if (!cancelled) setLoadingModels(false);
        perfRef.current.modelsEnd = (performance.now ? performance.now() : Date.now());
        if (PERF_UI) snapPerf();
      } catch (err) {
        console.error("Failed to load face-api models:", err);
        if (!cancelled) setMessage("Failed to load face detection models.");
      }
    };
    ensureModelsReady();
    return () => {
      cancelled = true;
    };
  }, []);

  // Helper: make sure face-api models and the faceapi module are fully ready
  const ensureModelsReadyForInference = async () => {
    try {
      // Quick check using the shared loader flag
      if (!areFaceApiModelsLoaded() || !faceapiRef.current) {
        setMessage('Preparing face detection models...');
        const ok = await preloadFaceApiModels();
        if (!ok) {
          setMessage('Failed to load face detection models. Please download models in Offline Settings.');
          return false;
        }
        try {
          faceapiRef.current = await getFaceApi();
        } catch (e) {
          console.warn('ensureModelsReadyForInference: failed to import faceapi after preload', e);
        }
      }

      // Final defensive guard: ensure the expected detector network is present
      const faceapi = faceapiRef.current;
      if (!faceapi || !faceapi.nets) {
        setMessage('Face detection runtime not available.');
        return false;
      }

      // Accept either tinyFaceDetector or ssdMobilenetv1 depending on build
      if (!faceapi.nets.tinyFaceDetector && !faceapi.nets.ssdMobilenetv1) {
        setMessage('Face detection network not loaded.');
        return false;
      }

      return true;
    } catch (err) {
      console.error('ensureModelsReadyForInference error', err);
      setMessage('Failed to prepare face detection models.');
      return false;
    }
  };

  // ✅ Fetch subject names (student or user) for messages (offline fallback)
  useEffect(() => {
    const ids = entityType === 'user'
      ? (Array.isArray(userId) ? userId : [userId]).filter(Boolean)
      : (Array.isArray(studentId) ? studentId : [studentId]).filter(Boolean);
    if (!ids.length) return;

    let mounted = true;
    (async () => {
      try {
        if (isOnline) {
          if (entityType === 'user') {
            // For users, we get profile names (username) or fallback to id
            const { data, error } = await api
              .from('profiles')
              .select('id, username')
              .in('id', ids);
            if (!error && data) {
              const map = {};
              data.forEach((p) => (map[p.id] = p.username || `User ${p.id}`));
              if (mounted) setStudentNames(map);
              try { await cacheTable('profiles', data); } catch {}
            }
          } else {
            const { data, error } = await api
              .from("students")
              .select("id, full_name")
              .in("id", ids);
            if (!error && data) {
              const map = {};
              data.forEach((s) => (map[s.id] = s.full_name));
              if (mounted) setStudentNames(map);
              try { await cacheTable("students", data); } catch {}
            }
          }
        } else {
          if (entityType === 'user') {
            const cached = await getTable('profiles');
            const map = {};
            (cached || []).forEach((p) => {
              if (ids.includes(p.id) || ids.includes(Number(p.id)))
                map[p.id] = p.username || `User ${p.id}`;
            });
            if (mounted) setStudentNames(map);
          } else {
            const cached = await getTable("students");
            const map = {};
            (cached || []).forEach((s) => {
              if (ids.includes(s.id) || ids.includes(Number(s.id)))
                map[s.id] = s.full_name;
            });
            if (mounted) setStudentNames(map);
          }
        }
      } catch (err) {
        console.error("Failed to fetch subject names", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [studentId, userId, isOnline, entityType]);

  // ✅ List available cameras
  useEffect(() => {
    (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        setAvailableCameras(videoDevices);
        // If no cameras are present and this is a user signin/signout flow,
        // show the token input immediately so the user can paste a code.
        if ((effectiveForceOperation === 'signin' || effectiveForceOperation === 'signout') && entityType === 'user' && (!videoDevices || videoDevices.length === 0)) {
          setWebcamError(true);
          setShowTokenInput(true);
          setMessage('No camera detected on this device. Use your backup authentication code.');
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  // ✅ Webcam setup
  const startWebcam = async (facing = "user") => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    try {
      perfRef.current.cameraStart = (performance.now ? performance.now() : Date.now());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: facing,
          width: { ideal: 320 },
          height: { ideal: 240 },
        },
      });
      streamRef.current = stream;

      if (webcamRef.current) {
        try {
          webcamRef.current.srcObject = stream;
          await new Promise((resolve) => {
            let resolved = false;
            const onMeta = () => {
              if (!webcamRef.current) return resolve();
              if ((webcamRef.current.videoWidth || webcamRef.current.videoHeight) && !resolved) {
                resolved = true;
                webcamRef.current.removeEventListener('loadedmetadata', onMeta);
                resolve();
              }
            };
            webcamRef.current.addEventListener('loadedmetadata', onMeta);
            // fallback timeout in case loadedmetadata doesn't fire
            setTimeout(() => {
              try { webcamRef.current.removeEventListener('loadedmetadata', onMeta); } catch (e) {}
              resolve();
            }, 2000);
          });
          await webcamRef.current.play();
        } catch (e) {
          if (DEBUG) console.warn('startWebcam: waiting for metadata failed', e);
        }
      }

      perfRef.current.cameraEnd = (performance.now ? performance.now() : Date.now());
      if (PERF_UI) snapPerf();
      setWebcamError(false);
    } catch (err) {
      console.error("Webcam access failed:", err);
      setWebcamError(true);
      
      // Show token input for users in both signin and signout flows to support devices without webcams.
      if (entityType === 'user' && (effectiveForceOperation === 'signin' || effectiveForceOperation === 'signout')) {
        setMessage("No webcam detected. You can use your backup authentication code to proceed.");
        setShowTokenInput(true);
      } else if (effectiveForceOperation === 'signout') {
        // For sign-out on non-user entities, enforce webcam
        setMessage("⚠️ Webcam required for sign-out. Please use a device with a webcam to end your work day.");
      } else {
        setMessage("Could not access webcam. Check permissions or use a device with a webcam.");
      }
    }
  };

  useEffect(() => {
    if (!captureDone) startWebcam(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [captureDone, facingMode]);

  // create an offscreen canvas once for downscaled captures
  useEffect(() => {
    if (!captureCanvasRef.current) captureCanvasRef.current = document.createElement("canvas");
    return () => {
      // cleanup interval if still running
      if (processIntervalRef.current) {
        clearInterval(processIntervalRef.current);
        processIntervalRef.current = null;
      }
      // release stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // initialize descriptor worker inside component so we can retry on failure
  useEffect(() => {
    // Always attempt to recreate the worker when workerReloadKey changes.
    // If an old worker exists, terminate it first so we create a fresh instance.
    try {
      if (descriptorWorkerRef.current) {
        try {
          descriptorWorkerRef.current.terminate();
        } catch (e) {}
        descriptorWorkerRef.current = null;
      }

      const w = new Worker(new URL("../../workers/descriptor.worker.js", import.meta.url), { type: "module" });
      descriptorWorkerRef.current = w;
      setWorkerAvailable(false); // mark pending until init completes
      setWorkerError(null);

      // Listen for structured messages from the worker (init handshake + errors)
      const onMessage = (ev) => {
        const m = ev.data || {};
        // init handshake
        if (m && m.id === 'init') {
          if (m.success) {
            setWorkerAvailable(true);
            setWorkerError(null);
            if (DEBUG) console.log('[BiometricsSignIn] descriptor worker initialized');
          } else {
            const errMsg = m.error || 'Worker init failed';
            console.error('[BiometricsSignIn] worker init error:', errMsg);
            setWorkerError(`Worker init failed: ${errMsg}`);
            setWorkerAvailable(false);
          }
          return;
        }

        // generic error message from worker
        if (m && m.error) {
          if (DEBUG) console.error('[BiometricsSignIn] worker error message:', m.error, m);
          setWorkerError(m.error);
          setWorkerAvailable(false);
        }
      };

      w.addEventListener('message', onMessage);

      w.onerror = (ev) => {
        // worker-level syntax/load errors often surface here (e.g. Unexpected token '<')
        const msg = ev?.message || (ev && ev.toString()) || 'Worker failure';
        const filename = ev?.filename || ev?.fileName || '';
        const lineno = ev?.lineno || ev?.lineno || '';
        const colno = ev?.colno || ev?.colno || '';
        const full = `Worker error: ${msg} ${filename ? `at ${filename}:${lineno}:${colno}` : ''}`;
        if (DEBUG) console.error('Descriptor worker error:', ev);
        setWorkerError(full);
        setWorkerAvailable(false);
      };

      // try to initialize the worker (asks it to load models); if init doesn't respond we fall back
      try {
        w.postMessage({ id: 'init', modelsUrl: MODELS_URL });
      } catch (err) {
        if (DEBUG) console.warn('Failed to post init to descriptor worker', err);
      }

      // fallback if init doesn't complete within timeout
      const initTimeout = setTimeout(() => {
        if (!descriptorWorkerRef.current) return;
        if (!workerAvailable) {
          const note = 'Descriptor worker did not initialize in time; falling back to main-thread processing.';
          if (DEBUG) console.warn(note);
          setWorkerError(note);
          setWorkerAvailable(false);
        }
      }, 8000);
    } catch (err) {
      if (DEBUG) console.warn("Failed to create descriptor worker in component", err);
      setWorkerAvailable(false);
      setWorkerError(err?.message || String(err));
    }
    // keep worker alive; recreated via retry which bumps workerReloadKey
    return () => {};
  }, [workerReloadKey]);

  const handleSwitchCamera = () => {
    if (availableCameras.length < 2) return;
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  // Load face references with retry logic
  // Load face references with retry mechanism
const loadFaceReferences = async (attempt = 0, isManualRetry = false) => {
  if (!studentId && !userId) return false;
   let ids = entityType === 'user'
    ? (Array.isArray(userId) ? userId : [userId]).filter(Boolean)
    : (Array.isArray(studentId) ? studentId : [studentId]).filter(Boolean);

   // Performance guard: Limit to 10 students max for initial load
   const MAX_INITIAL_LOAD = 10;
   if (ids.length > MAX_INITIAL_LOAD) {
     console.warn(`BiometricsSignIn: ${ids.length} IDs provided, limiting to first ${MAX_INITIAL_LOAD} for performance`);
     setMessage(`⚠️ Loading first ${MAX_INITIAL_LOAD} of ${ids.length} students for performance. Consider using continuous mode for groups.`);
     ids = ids.slice(0, MAX_INITIAL_LOAD);
   }
 
   // Track if this is a large set for progress updates
   const isLargeSet = ids.length > 5;
 
  setLoadingReferences(true);
  // Ensure face-api models are loaded before attempting any inference or creating FaceMatcher
  try {
    if (!areFaceApiModelsLoaded()) {
      setMessage('Preparing face detection models...');
      await preloadFaceApiModels();
      try {
        faceapiRef.current = await getFaceApi();
      } catch (e) {
        if (DEBUG) console.warn('Failed to import faceapi after preloading models', e);
      }
    }
  } catch (err) {
    console.error('Failed to ensure models loaded before loading references', err);
    setMessage('Face detection models are not available. Please download models in Offline Settings.');
    setLoadingReferences(false);
    return false;
  }
  if (attempt === 0) {
    // reset retry indicators on fresh load
    setRetryAttempt(0);
    setRetryInSec(null);
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }
   } else {
     setMessage("Loading face references...");
  }
  perfRef.current.refsStart = (performance.now ? performance.now() : Date.now());
  
  try {
    // Determine the correct storage path generator based on the effective bucket
    const getPath = STORAGE_PATHS[effectiveBucket] || STORAGE_PATHS['student-uploads'];
    
    // Clear existing state for retry
    setFaceMatcher(null);
    setReferencesReady(false);

    // first check persisted DB cache
    const idsToLoad = [];
    const loadedDescriptors = [];
     let processedCount = 0;
   
     // Process initial batch (or all IDs if small set)
     for (const i of ids) {
      const persisted = await descriptorDB.getDescriptor(i);
      if (persisted && persisted.length) {
        try {
          // Ensure faceapi module is available before constructing descriptors
          if (!faceapiRef.current) {
            try {
              faceapiRef.current = await getFaceApi();
            } catch (e) {
              if (DEBUG) console.warn('getFaceApi failed while hydrating descriptors', e);
            }
          }
          if (!faceapiRef.current) throw new Error('faceapi not available');
          const faceapi = faceapiRef.current;
          const labeled = new faceapi.LabeledFaceDescriptors(
            i.toString(),
            persisted.map((arr) => new Float32Array(arr))
          );
          faceDescriptorCache[i] = labeled;
          loadedDescriptors.push(labeled);
        } catch (err) {
          console.warn("Failed to hydrate persisted descriptors for", i, err);
          idsToLoad.push(i);
        }
      } else {
        idsToLoad.push(i);
      }
     
       // Update progress for large sets
       if (isLargeSet) {
         processedCount++;
         setLoadingProgress({ loaded: processedCount, total: ids.length });
         setMessage(`Loading face references (${processedCount}/${ids.length})...`);
       }
    }

    for (const id of idsToLoad) {
      try {
        let descriptors = [];
        let sourceUsed = null;
        
        // For users, try profile-avatars first, then worker-uploads as fallback
        let sourcesToTry = [];
        
        if (entityType === 'user') {
          // Priority 1: profile-avatars bucket (uses profiles.id)
          sourcesToTry.push({ 
            bucket: 'profile-avatars', 
            path: STORAGE_PATHS['profile-avatars'](id), 
            label: 'Profile Avatar',
            useIdFilter: true // Filter by exact ID match
          });
          
          // Priority 2: worker-uploads (need to fetch worker_id from profiles first)
          try {
            const { data: profile, error: profileErr } = await api
              .from('profiles')
              .select('worker_id')
              .eq('id', id)
              .single();
            
            if (!profileErr && profile?.worker_id) {
              if (DEBUG) console.log(`[BiometricsSignIn] User ${id} has worker_id: ${profile.worker_id}`);
              sourcesToTry.push({ 
                bucket: 'worker-uploads', 
                path: STORAGE_PATHS['worker-uploads'](profile.worker_id),
                label: 'Worker Profile',
                useIdFilter: false // Don't filter by ID, just take first image in folder
              });
            } else if (DEBUG) {
              console.log(`[BiometricsSignIn] User ${id} has no worker_id or profile not found`);
            }
          } catch (err) {
            if (DEBUG) console.warn(`[BiometricsSignIn] Failed to fetch worker_id for user ${id}:`, err);
          }
        } else {
          // Student mode: only check student-uploads
          sourcesToTry.push({ 
            bucket: effectiveBucket, 
            path: getPath(id), 
            label: 'Student Profile',
            useIdFilter: false
          });
        }

        if (DEBUG) console.log(`[BiometricsSignIn] Attempting to load face references for ID ${id} from:`, 
          sourcesToTry.map(s => `${s.label} (${s.bucket}/${s.path || '(root)'})`).join(', '));

        // Fetch cached images once per id (avoid repeated IndexedDB reads)
        const cachedImages = await imageCache.getCachedImagesByEntity(id);

        // Try each source until we get descriptors
        for (const source of sourcesToTry) {
          if (descriptors.length > 0) break; // Already got descriptors, skip remaining sources

          if (DEBUG) console.log(`[BiometricsSignIn] Trying ${source.label}: ${source.bucket}/${source.path || '(root)'}`);

          // Check cache first for offline support
          const cachedForSource = (cachedImages || []).filter(img => img.bucket === source.bucket);
          
          let imageFiles = [];
          let paths = [];
          let urlsData = [];

          // Prefer cached images first for instant readiness (works offline and online)
          if (cachedForSource.length > 0) {
            if (DEBUG) console.log(`[BiometricsSignIn] Using ${cachedForSource.length} cached image(s) from ${source.label} (cache-first)`);
            setMessage(m => `${m}\n📦 ${source.label}: Using cached images (cache-first)`);
            
            // Convert cached blobs to object URLs
            urlsData = cachedForSource.slice(0, 3).map(cached => {
              return URL.createObjectURL(cached.blob);
            });
          } else {
            // Online mode: fetch from storage and update cache
            const listPath = source.path || '';
            if (DEBUG) console.log(`[BiometricsSignIn] Listing files in ${source.bucket}/${listPath || '(root)'}`);
            
            let files = [];
            let listErr = null;
            
            // Optimize: For profile-avatars with ID filter, try direct file access instead of listing entire bucket
            if (source.useIdFilter && source.bucket === 'profile-avatars') {
              // Try common extensions directly and request signed URLs instead of listing
              // This avoids relying on storage.list search behavior which may vary by provider or CORS.
              const extensions = ['jpg', 'jpeg', 'png', 'webp'];
              const foundFiles = [];
              const signedCandidates = [];

              for (const ext of extensions) {
                const filename = `${id}.${ext}`;
                try {
                  const { data: signed, error: signedErr } = await api.storage.from(source.bucket).createSignedUrl(filename, 300);
                  if (!signedErr && signed?.signedUrl) {
                    // Found a signed URL for this exact id-based filename
                    signedCandidates.push({ name: filename, signedUrl: signed.signedUrl });
                    // stop after first found
                    break;
                  }
                } catch (e) {
                  if (DEBUG) console.warn('[BiometricsSignIn] createSignedUrl failed for', filename, e);
                }
              }

              if (signedCandidates.length) {
                // Construct files array to mimic storage.list output (minimal)
                files = signedCandidates.map((s) => ({ name: s.name }));
                // Populate urlsData directly with the signed URLs we found
                urlsData = signedCandidates.map((s) => s.signedUrl);
                if (DEBUG) console.log(`[BiometricsSignIn] Direct signed URL search found ${files.length} file(s) for ID ${id}`);
              } else {
                files = [];
              }
            } else {
              // Standard list for other buckets or non-filtered queries
              // CRITICAL: Ensure we're listing a specific path, not the entire bucket
              try {
                const listResult = await api.storage
                  .from(source.bucket)
                  .list(listPath, {
                    limit: 10, // Only need a few images per student for face descriptors
                    sortBy: { column: 'name', order: 'asc' },
                  });

                files = listResult.data;
                listErr = listResult.error;
                if (DEBUG) console.log(`[BiometricsSignIn] Listed ${source.bucket}/${listPath} - found ${files?.length || 0} files`);
              } catch (listException) {
                // Some storage backends or network conditions may cause list(...) to throw or fail (CORS, network).
                // Retry with a simplified call (no sort) to increase compatibility.
                if (DEBUG) console.warn('[BiometricsSignIn] storage.list threw, retrying with simpler call', listException);
                try {
                  const listResult = await api.storage.from(source.bucket).list(listPath, { limit: 10 });
                  files = listResult.data;
                  listErr = listResult.error;
                } catch (simpleListErr) {
                  if (DEBUG) console.warn('[BiometricsSignIn] simplified storage.list also failed', simpleListErr);
                  files = [];
                  listErr = simpleListErr;
                }
              }
            }
            if (DEBUG && files) console.log(`[BiometricsSignIn] Found ${files.length} total files in ${source.bucket}`, files);
            
            if (listErr) {
              // If online fetch fails, try cached images as fallback
              if (cachedForSource.length > 0) {
                if (DEBUG) console.log(`[BiometricsSignIn] Fetch failed, falling back to cached images for ${source.label}`);
                setMessage(m => `${m}\n ${source.label}: Using cached images (fallback)`);
                urlsData = cachedForSource.slice(0, 3).map(cached => URL.createObjectURL(cached.blob));
              } else {
                console.warn(`Failed to list files in ${source.label}:`, listErr);
                setMessage(m => `${m}\n⚠ ${source.label}: ${listErr.message || 'Access denied'}`);
                continue;
              }
            } else if (!files?.length) {
              if (DEBUG) console.log(`No files found in ${source.label}, trying next source...`);
              setMessage(m => `${m}\n⚠ ${source.label}: No images found`);
              continue;
            } else {
              // Filter for image files (support common formats), exclude folders
              imageFiles = files.filter((f) => 
                f.name && // has a name
                !f.id?.endsWith('/') && // not a folder (some storage APIs mark folders this way)
                /\.(jpg|jpeg|png|webp)$/i.test(f.name) // is an image
              );
              
              if (DEBUG) console.log(`[BiometricsSignIn] After image filter: ${imageFiles.length} image files`, imageFiles.map(f => f.name));
              
              // For profile-avatars only: filter files that match the user ID exactly (e.g., "29.jpg", "42.png")
              if (source.useIdFilter) {
                const beforeFilter = imageFiles.length;
                imageFiles = imageFiles.filter((f) => {
                  // Extract filename without extension, trim whitespace
                  const nameWithoutExt = f.name.replace(/\.(jpg|jpeg|png|webp)$/i, '').trim();
                  // Match if filename is exactly the ID (case-insensitive for safety)
                  const idStr = String(id).trim();
                  const matches = nameWithoutExt === idStr;
                  if (DEBUG) console.log(`[BiometricsSignIn] Checking "${f.name}": nameWithoutExt="${nameWithoutExt}" vs id="${idStr}" => ${matches}`);
                  return matches;
                });
                if (DEBUG) console.log(`[BiometricsSignIn] Filtered from ${beforeFilter} to ${imageFiles.length} image(s) matching ID ${id} in ${source.label}`);
              }
              
              if (!imageFiles.length) {
                if (DEBUG) console.log(`No valid image files in ${source.label}, trying next source...`);
                setMessage(m => `${m}\n⚠ ${source.label}: No valid images`);
                continue;
              }
              if (DEBUG) console.log(`Found ${imageFiles.length} image(s) in ${source.label}`);

              // limit descriptors per id to reduce memory/time
              const limited = imageFiles.slice(0, 3);
              paths = limited.map((f) => {
                // For profile-avatars (empty path), file is at root
                return source.path ? `${source.path}/${f.name}` : f.name;
              });

              // batch create signed URLs
              const signedResults = await Promise.all(
                paths.map((p) => api.storage.from(source.bucket).createSignedUrl(p, 300))
              );
              
              let urlErr = null;
              for (const r of signedResults) {
                if (r.error) {
                  urlErr = r.error;
                  urlsData.push(null);
                } else {
                  urlsData.push(r.data?.signedUrl || null);
                }
              }
              
              if (urlErr || !urlsData.filter(Boolean).length) {
                if (DEBUG) console.log(`Failed to get signed URLs for ${source.bucket}, trying next source...`);
                continue;
              }

              // Cache the images for offline use (skip during large batch loads to reduce requests)
              if (!isLargeSet) {
                try {
                  for (let i = 0; i < paths.length; i++) {
                    const path = paths[i];
                    const { data: blob, error: downloadErr } = await api.storage
                      .from(source.bucket)
                      .download(path);
                    
                    if (!downloadErr && blob) {
                      await imageCache.cacheImage(source.bucket, path, blob, id, {
                        source: source.label
                      });
                    }
                  }
                } catch (cacheErr) {
                  if (DEBUG) console.warn(`[BiometricsSignIn] Failed to cache images for future offline use:`, cacheErr);
                }
              }
            }
          }
          
          if (!urlsData.filter(Boolean).length) {
            if (DEBUG) console.log(`No valid URLs available for ${source.label}, trying next source...`);
            continue;
          }

          // Try worker first, fall back to main thread
          const worker = descriptorWorkerRef.current;
          if (worker && workerAvailable) {
            const signedPaths = urlsData.filter(Boolean);
            const workerResp = await new Promise((resolve) => {
              const handler = (ev) => {
                const m = ev.data || {};
                if (m && m.id && String(m.id) === String(id)) {
                  try {
                    worker.removeEventListener("message", handler);
                  } catch (e) {}
                  resolve(m);
                }
              };
              worker.addEventListener("message", handler);
              try {
                worker.postMessage({
                  id,
                  signedUrls: signedPaths,
                  modelsUrl: MODELS_URL,
                  inputSize: 96,
                  scoreThreshold: 0.45,
                  maxDescriptors: 3
                });
              } catch (err) {
                if (DEBUG) console.warn("Worker postMessage failed", err);
                resolve({ id, descriptors: [], error: err?.message || String(err) });
              }
            });

            if (workerResp?.descriptors?.length) {
              for (const arr of workerResp.descriptors) {
                descriptors.push(new Float32Array(arr));
              }
              sourceUsed = source.bucket;
            }
          }

          // Fall back to main thread if worker failed or is unavailable
          if (!descriptors.length) {
            for (const u of urlsData) {
              if (!u) continue;
              try {
                const faceapi = faceapiRef.current;
                const img = await faceapi.fetchImage(u);
                const det = await faceapi
                  .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({
                    inputSize: 96,
                    scoreThreshold: 0.45
                  }))
                  .withFaceLandmarks()
                  .withFaceDescriptor();
                
                if (det?.descriptor) {
                  descriptors.push(det.descriptor);
                  sourceUsed = source.bucket;
                }
              } catch (err) {
                if (DEBUG) console.warn(`Failed to process image for ${id} from ${source.bucket}:`, err);
              }
            }
          }
          
          // Clean up object URLs to prevent memory leaks
          urlsData.forEach(url => {
            if (url && url.startsWith('blob:')) {
              try {
                URL.revokeObjectURL(url);
              } catch (e) {}
            }
          });

          // If we got descriptors from this source, log it and break
          if (descriptors.length > 0) {
            if (DEBUG) console.log(`✓ Successfully loaded ${descriptors.length} descriptor(s) for ID ${id} from ${source.label}`);
            setMessage(m => `${m}\n✓ ${source.label}: Loaded successfully`);
            break;
          }
        }

        // After trying all sources, check if we got any descriptors
        if (!descriptors.length) {
          const triedSources = sourcesToTry.map(s => s.label).join(', ');
          if (DEBUG) console.warn(`Failed to load face descriptors for ID ${id} from any source (tried: ${triedSources})`);
          setMessage(m => `${m}\n❌ No valid face images found in ${triedSources}`);
          continue; // Skip to next ID
        }

        if (descriptors.length) {
          try {
            if (!faceapiRef.current) {
              try { faceapiRef.current = await getFaceApi(); } catch (e) { if (DEBUG) console.warn('getFaceApi failed while creating labeled descriptors', e); }
            }
            if (!faceapiRef.current) throw new Error('faceapi not available');
            const faceapi = faceapiRef.current;
            const labeled = new faceapi.LabeledFaceDescriptors(id.toString(), descriptors);
            faceDescriptorCache[id] = labeled;
            loadedDescriptors.push(labeled);
          } catch (err) {
            console.warn('Failed to create labeled descriptors for', id, err);
            // still persist raw descriptors so we can retry later
          }
          
          // Persist to IndexedDB
          const persist = descriptors.map((d) => Array.from(d));
          try {
            await descriptorDB.setDescriptor(id, persist);
          } catch (err) {
            if (DEBUG) console.warn("Failed to persist descriptors", err);
          }
        }
      } catch (err) {
        if (DEBUG) console.warn(`Failed to load references for ${id}:`, err);
        setMessage(m => `${m}\n❌ Failed to load references for ID ${id}`);
      }
    }

    // Set up face matcher with all available descriptors
    const cached = ids.map((i) => faceDescriptorCache[i]).filter(Boolean);
    const all = [...cached, ...loadedDescriptors];
    
    if (all.length) {
      const faceapi = faceapiRef.current;
      setFaceMatcher(new faceapi.FaceMatcher(all, threshold));
      setReferencesReady(true);
      setLoadingReferences(false);
      setMessage(m => `${m}\n✅ Face references loaded successfully!`);
      perfRef.current.refsEnd = (performance.now ? performance.now() : Date.now());
      if (PERF_UI) snapPerf();
      // success: clear retry indicators
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
      setRetryAttempt(0);
      setRetryInSec(null);
      return true;
    } else {
      throw new Error("No valid face descriptors generated");
    }
  } catch (err) {
    console.error("Error loading face references", err);
    setMessage(m => `${m}\n❌ Failed to load face references: ${err.message}`);
    
    // If online and no cached data found, trigger a cache refresh
    if (isOnline && err.message.includes("No valid face descriptors") && attempt === 0) {
      console.warn("[BiometricsSignIn] No face descriptors found - triggering cache refresh...");
      setMessage(m => `${m}\n🔄 Refreshing cache from server...`);
      
      try {
        // Trigger global cache refresh if available
        if (typeof window !== 'undefined' && typeof window.refreshCache === 'function') {
          await window.refreshCache();
          setMessage(m => `${m}\n✅ Cache refreshed - retrying...`);
          // Retry loading after cache refresh
          setTimeout(() => loadFaceReferences(0, true), 2000);
          return false;
        }
      } catch (refreshErr) {
        console.warn("[BiometricsSignIn] Cache refresh failed:", refreshErr);
      }
    }
    
    // Retry logic
    if (attempt < maxRetries && !isManualRetry) {
      const timeout = retryTimeouts[attempt] || 2000;
      setMessage(m => `${m}\n⏳ Retrying in ${timeout/1000} seconds...`);
      setRetryAttempt(attempt + 1);
      setRetryInSec(Math.round(timeout / 1000));
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
      retryIntervalRef.current = setInterval(() => {
        setRetryInSec((s) => {
          if (s === null) return s;
          if (s <= 1) {
            clearInterval(retryIntervalRef.current);
            retryIntervalRef.current = null;
            return 0;
          }
          return s - 1;
        });
      }, 1000);

      setTimeout(() => {
        loadFaceReferences(attempt + 1);
      }, timeout);
    }
    
    setLoadingReferences(false);
    return false;
  }
};

// Effect to trigger initial load
useEffect(() => {
  let cancelled = false;
  
  const loadReferences = async () => {
    if (!cancelled) {
      await loadFaceReferences(0);
    }
  };
  
  loadReferences();
  
  return () => {
    cancelled = true;
  };
}, [studentId, userId]); // Remove effectiveBucket and threshold - they don't need to retrigger

  // ✅ Face capture handler
  const handleCapture = async () => {
    if (isProcessing) return;
    if (!referencesReady || !faceMatcher) {
      setMessage("Face references not ready yet.");
      return;
    }
    if (!webcamRef.current) {
      setMessage("Webcam not initialized.");
      return;
    }

    // Ensure face-api models are loaded before attempting detection
    try {
      const ready = await ensureModelsReadyForInference();
      if (!ready) {
        setIsProcessing(false);
        return;
      }
    } catch (err) {
      console.error('Failed to ensure models loaded before capture', err);
      setMessage('Face detection models are unavailable. Please download models in Offline Settings.');
      setIsProcessing(false);
      return;
    }

  // Ensure video has valid dimensions on mobile before capture
  const waitForVideoReady = async (timeoutMs = 2000) => {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (!webcamRef.current) return resolve(false);
        if (webcamRef.current.videoWidth > 0 && webcamRef.current.videoHeight > 0) return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        requestAnimationFrame(check);
      };
      check();
    });
  };
  const videoReady = await waitForVideoReady(1500);
  if (!videoReady) {
    setMessage('Camera not ready — try tapping the video or retry webcam access.');
    return;
  }

  setIsProcessing(true);
  perfRef.current.captureStart = (performance.now ? performance.now() : Date.now());
  setMessage("Detecting face(s)...");

    try {
      // draw a downscaled frame to an offscreen canvas to speed up detection
      const canvas = captureCanvasRef.current || document.createElement("canvas");
      const targetW = 320;
      const targetH = Math.round((webcamRef.current.videoHeight / webcamRef.current.videoWidth) * targetW) || 240;
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(webcamRef.current, 0, 0, targetW, targetH);

      const faceapi = faceapiRef.current;
  // inputSize must be a number divisible by 32 for TinyFaceDetector/TinyYolov2
  // Use 96 for small screens (32*3) and 128 for larger screens (32*4)
  const DETECTOR_SIZE = isSmallScreen ? 96 : 128;
      const detections = await faceapi
        .detectAllFaces(
          canvas,
          new faceapi.TinyFaceDetectorOptions({ inputSize: DETECTOR_SIZE, scoreThreshold: 0.45 })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (!detections?.length) {
        setMessage("No faces detected. Try again.");
        setIsProcessing(false);
        return;
      }

      const results = detections.map((d) => faceMatcher.findBestMatch(d.descriptor));
      const date = new Date().toISOString().split("T")[0];

      let matchFound = false;

      for (const match of results) {
        if (match.label === "unknown") continue;
        matchFound = true;
        const displayName = studentNames[match.label] || `${entityType === 'user' ? 'User' : 'Student'} ${match.label}`;

            // For user authentication mode (entityType='user')
        if (entityType === 'user') {
          // Check if this is the correct user
          const expectedId = userId || (Array.isArray(userId) ? userId[0] : null);
          if (String(match.label) === String(expectedId)) {
            setCaptureDone(true);
            
            // Prompt for attendance recording instead of auto-recording
            promptAttendanceRecording(match.label, displayName, false);
            // Do NOT add session participants for user/profile entities here.
            // Session participants should represent students only.

            // Hide/unmount the biometric UI so the user can re-open later for sign-out
            if (typeof onCompleted === 'function') {
              try { onCompleted(match.label); } catch (e) { }
            }
            
            // Draw captured frame to canvas
            try {
              if (canvasRef.current) {
                const display = canvasRef.current;
                display.width = canvas.width;
                display.height = canvas.height;
                const dctx = display.getContext("2d");
                dctx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
              }
            } catch (e) {
              if (DEBUG) console.warn('Failed to draw snapshot to canvas', e);
            }
            
            setIsProcessing(false);
            perfRef.current.captureEnd = (performance.now ? performance.now() : Date.now());
            if (PERF_UI) snapPerf();
            return;
          } else {
            setMessage(`Face does not match expected user. Please try again.`);
            setIsProcessing(false);
            return;
          }
        }

        // Student mode: always record attendance automatically (no prompt)
        if (entityType === 'student') {
          setCaptureDone(true);
          const nowIso = new Date().toISOString();
          try {
            if (!pendingSignIns[match.label]) {
              // Sign in: record attendance immediately
              console.log('[BiometricsSignIn] student auto sign-in - recording attendance', { student_id: match.label, signInTime: nowIso });
              const res = await recordAttendance({ entityId: match.label, signInTime: nowIso, note: 'biometric sign in' });
              console.log('[BiometricsSignIn] recordAttendance result:', res);
              // addRow may return the inserted row (online) or an object with tempId (offline)
              const pendingId = res?.id || res?.tempId || (res?.result && (res.result.id || res.result.tempId)) || null;
              setPendingSignIns((prev) => ({ ...prev, [match.label]: { id: pendingId, signInTime: nowIso } }));
              try { addRecordedParticipant(match.label, displayName, nowIso, pendingId, false); } catch (e) { if (DEBUG) console.warn('addRecordedParticipant failed', e); }
              setMessage(`${displayName} authenticated and attendance recorded.`);

              // Add participant to session table if a session id was provided (students only)
              try {
                if (academicSessionId) {
                  const partPayload = { session_id: academicSessionId, student_id: Number(match.label), school_id: schoolId, added_at: new Date().toISOString() };
                  console.log('[BiometricsSignIn] inserting session participant', { payload: partPayload, sessionType });
                  // Use offline hook when available for queuing; fallback to direct API insert
                  try {
                    await addParticipantRow({ session_id: academicSessionId, student_id: Number(match.label), school_id: schoolId, added_at: new Date().toISOString() });
                    console.log('[BiometricsSignIn] addParticipantRow queued/returned for', match.label);
                  } catch (e) {
                    console.warn('[BiometricsSignIn] addParticipantRow failed, falling back to API insert', e);
                    try { await api.from(sessionType).insert(partPayload); console.log('[BiometricsSignIn] api.insert participant ok'); } catch (e2) { console.error('[BiometricsSignIn] api.insert participant failed', e2); }
                  }
                }
              } catch (e) {
                console.warn('Failed to insert academic_session_participant', e);
              }

              // Hide/unmount the biometric UI so teacher can re-open for sign-out
              if (typeof onCompleted === 'function') {
                try { onCompleted(match.label); } catch (e) { }
              }
            } else {
              // Sign out: update existing pending sign-in record if available
              const pending = pendingSignIns[match.label];
              if (pending && pending.id) {
                const signOutTime = nowIso;
                const durationMs = new Date(signOutTime) - new Date(pending.signInTime);
                const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);
                // Use updateRow to update an existing attendance record (online/offline aware)
                try {
                  await updateRow(pending.id, { sign_out_time: signOutTime });
                } catch (uerr) {
                  // Fallback to previous behaviour if updateRow fails
                  await addRow({ id: pending.id, sign_out_time: signOutTime, _update: true });
                }
                try { completeRecordedParticipant(match.label, signOutTime); } catch (e) { if (DEBUG) console.warn('completeRecordedParticipant failed', e); }
                setPendingSignIns((prev) => {
                  const copy = { ...prev };
                  delete copy[match.label];
                  return copy;
                });
                setMessage(`${displayName} signed out. Duration: ${durationHours} hrs`);
                try {
                  if (academicSessionId) {
                    console.log('[BiometricsSignIn] updating participant sign_out_time via API', { sessionType, sessionId: academicSessionId, student: match.label });
                    await api.from(sessionType)
                      .update({ sign_out_time: new Date().toISOString() })
                      .match({ session_id: academicSessionId, student_id: Number(match.label) });
                  }
                } catch (e) {
                  console.warn('Failed to update academic_session_participant sign_out_time', e);
                }
              } else {
                // No pending sign-in found — still record a sign-out attendance row
                await recordAttendance({ entityId: match.label, signInTime: nowIso, note: 'biometric sign out' });
                setMessage(`${displayName} sign-out recorded.`);
                try {
                    if (academicSessionId) {
                      await api.from(sessionType)
                        .update({ sign_out_time: new Date().toISOString() })
                        .match({ session_id: academicSessionId, student_id: Number(match.label) });
                    }
                } catch (e) {
                  console.warn('Failed to update academic_session_participant sign_out_time', e);
                }
              }
            }
          } catch (err) {
            console.error('Auto-record student attendance failed', err);
            setMessage(`Failed to record attendance for ${displayName}.`);
          }
        } else {
          // For non-students (users/workers) keep the interactive prompt flow
          if (!pendingSignIns[match.label]) {
            // Sign in - prompt user
            setCaptureDone(true);
            promptAttendanceRecording(match.label, displayName, false);
          } else {
            // Sign out - prompt user
            setCaptureDone(true);
            promptAttendanceRecording(match.label, displayName, true);
          }
        }
        
        // Draw captured frame to canvas
        try {
          if (canvasRef.current) {
            const display = canvasRef.current;
            display.width = canvas.width;
            display.height = canvas.height;
            const dctx = display.getContext("2d");
            dctx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
          }
        } catch (e) {
          if (DEBUG) console.warn('Failed to draw snapshot to canvas', e);
        }
        
        setIsProcessing(false);
        perfRef.current.captureEnd = (performance.now ? performance.now() : Date.now());
        if (PERF_UI) snapPerf();
        return; // Exit after first match
      }

      // If no known faces were found, show message
      if (!matchFound) {
        setMessage("No recognized faces detected. Please try again.");
        setIsProcessing(false);
        return;
      }
    } catch (err) {
      console.error("handleCapture error:", err);
      const msg = err?.message || String(err) || 'unknown error';
      setMessage(`Failed to detect or record attendance: ${msg}`);
      setIsProcessing(false);
    }
  };

  // Process a single frame (used by continuous mode)
  const processFrame = useCallback(async () => {
    if (isProcessing || !referencesReady || !faceMatcher || !webcamRef.current) return;
    // Ensure video has valid dimensions on mobile (prevents drawImage errors)
    const waitForVideoReady = async (timeoutMs = 2000) => {
      const start = Date.now();
      return new Promise((resolve) => {
        const check = () => {
          if (!webcamRef.current) return resolve(false);
          if (webcamRef.current.videoWidth > 0 && webcamRef.current.videoHeight > 0) return resolve(true);
          if (Date.now() - start > timeoutMs) return resolve(false);
          requestAnimationFrame(check);
        };
        check();
      });
    };
    const ready = await waitForVideoReady(1500);
    if (!ready) return; // skip this frame if video not ready
    try {
      // Ensure face-api models are loaded before attempting detection
      const ready = await ensureModelsReadyForInference();
      if (!ready) return;
      setIsProcessing(true);
      // draw downscaled frame
      const canvas = captureCanvasRef.current || document.createElement("canvas");
      const targetW = 320;
      const targetH = Math.round((webcamRef.current.videoHeight / webcamRef.current.videoWidth) * targetW) || 240;
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(webcamRef.current, 0, 0, targetW, targetH);

      const faceapi = faceapiRef.current;
  // inputSize must be a number divisible by 32 for TinyFaceDetector/TinyYolov2
  // Use 96 for small screens (32*3) and 128 for larger screens (32*4)
  const DETECTOR_SIZE = isSmallScreen ? 96 : 128;
      const detections = await faceapi
        .detectAllFaces(
          canvas,
          new faceapi.TinyFaceDetectorOptions({ inputSize: DETECTOR_SIZE, scoreThreshold: 0.45 })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (!detections?.length) {
        setIsProcessing(false);
        return;
      }

      const results = detections.map((d) => faceMatcher.findBestMatch(d.descriptor));
      const date = new Date().toISOString().split("T")[0];

      for (const match of results) {
        if (match.label === "unknown") continue;
        if (!pendingSignIns[match.label]) {
          const signInTime = new Date().toISOString();
          console.log('[BiometricsSignIn] continuous auto sign-in attempt', { student_id: match.label, signInTime });
          const res = await addRow({
            student_id: match.label,
            school_id: schoolId,
            status: "present",
            note: "biometric sign in",
            date,
            sign_in_time: signInTime,
          });
          console.log('[BiometricsSignIn] addRow (attendance_records) result:', res);
          const pendingId = res?.id || res?.tempId || null;
          setPendingSignIns((prev) => ({ ...prev, [match.label]: { id: pendingId, signInTime } }));
          try { addRecordedParticipant(match.label, studentNames[match.label] || `Student ${match.label}`, signInTime, pendingId, false); } catch (e) { if (DEBUG) console.warn('addRecordedParticipant failed', e); }
          const displayName = studentNames[match.label] || `Student ${match.label}`;
          setMessage(`${displayName} authenticated successfully.`);
          try { if (typeof onSignIn === 'function') onSignIn({ entityType: 'student', entityId: match.label, attendance: res, signInTime }); } catch (e) { if (DEBUG) console.warn('onSignIn callback failed', e); }
        }
      }
    } catch (err) {
      console.error("processFrame error:", err);
      setMessage(`Unable to process faces: ${err?.message || 'unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, referencesReady, faceMatcher, pendingSignIns, schoolId, addRow]);

  // start/stop continuous processing
  const startContinuous = () => {
    if (processIntervalRef.current) return;
    processIntervalRef.current = setInterval(() => {
      processFrame();
    }, 800); // ~1.25 FPS - tuneable for performance vs responsiveness
    setMode("continuous");

    // notify parent that recording started
    try {
      if (typeof onRecordingStart === 'function') onRecordingStart();
    } catch (e) {
      if (DEBUG) console.warn('onRecordingStart callback failed', e);
    }

    // Optionally close/unmount the biometric UI so the parent can continue other tasks
    if (closeOnStart && typeof onCancel === 'function') {
      // short delay to allow UI to reflect recording state
      setTimeout(() => {
        try { onCancel(); } catch (e) { if (DEBUG) console.warn('onCancel failed', e); }
      }, 200);
    }
    // record start timestamp for duration calculation
    try { recordingStartRef.current = new Date().toISOString(); } catch (e) { recordingStartRef.current = null; }
    // clear any previous recorded participants when starting a new continuous session
    setRecordedParticipants([]);
    // start tick so elapsed times update in UI
    setTick((t) => t + 1);
  };

  const stopContinuous = async () => {
    if (processIntervalRef.current) {
      clearInterval(processIntervalRef.current);
      processIntervalRef.current = null;
    }
    const stopTime = new Date().toISOString();

    // Prepare participants info captured during recording
    const participants = Object.keys(pendingSignIns || {}).map((k) => {
      const v = pendingSignIns[k] || {};
      return {
        student_id: k,
        signInTime: v.signInTime || null,
        attendanceId: v.id || null,
        isWorker: v.isWorker || false,
        worker_id: v.worker_id || null,
      };
    });

    // Attempt to sign out all pending participants by updating their attendance rows
    if (participants.length) {
      setMessage('Ending recording — finalizing sign-outs...');
      try {
        const signOutResults = await Promise.all(participants.map(async (p) => {
          try {
            const v = pendingSignIns[p.student_id] || {};
            if (!v || !v.id) return { student_id: p.student_id, updated: false, reason: 'no-id' };
            // compute hours if we have a signInTime
            let hours = 0;
            if (v.signInTime) {
              const durationMs = new Date(stopTime) - new Date(v.signInTime);
              hours = durationMs > 0 ? (durationMs / (1000 * 60 * 60)) : 0;
            }

            if (v.isWorker) {
              // worker attendance record
              try {
                await updateWorkerRow(v.id, { sign_out_time: stopTime, hours });
              } catch (err) {
                // best-effort: still return failure
                return { student_id: p.student_id, updated: false, reason: String(err) };
              }
            } else {
              try {
                await updateRow(v.id, { sign_out_time: stopTime, hours });
              } catch (err) {
                return { student_id: p.student_id, updated: false, reason: String(err) };
              }
            }

            return { student_id: p.student_id, updated: true };
          } catch (err) {
            return { student_id: p.student_id, updated: false, reason: String(err) };
          }
        }));

        const successCount = signOutResults.filter(r => r.updated).length;
        setMessage(`Ended recording. Signed out ${successCount}/${signOutResults.length} participant(s).`);
      } catch (err) {
        console.warn('Failed to perform sign-outs on stopContinuous', err);
        setMessage('Ended recording. Some sign-outs may have failed.');
      }

      // mark recorded participants as completed (UI) and clear pending sign-ins locally so UI reflects end of recording
      try {
        (participants || []).forEach(p => {
          try { completeRecordedParticipant(p.student_id, stopTime); } catch (e) { if (DEBUG) console.warn('completeRecordedParticipant failed in stopContinuous', e); }
        });
      } catch (e) {
        if (DEBUG) console.warn('Error completing recorded participants', e);
      }
      setPendingSignIns({});
    }

      // Ensure participants are recorded in academic_session_participants (students only)
      const studentParticipants = (participants || []).filter(p => !p.isWorker);
      if (academicSessionId && studentParticipants.length) {
        setMessage((m) => `${m}\nRecording session participants...`);
        try {
          const ensured = await Promise.all(studentParticipants.map(async (p) => {
            try {
                const sid = Number(p.student_id);
              // If online, check remote first to avoid duplicates
              if (isOnline) {
                try {
                  const { data: existing, error: existingErr } = await api
                    .from(sessionType)
                    .select('id')
                    .match({ session_id: academicSessionId, student_id: sid })
                    .limit(1);
                  if (!existingErr && existing && existing.length) {
                    return { student_id: sid, added: false, reason: 'exists' };
                  }
                } catch (e) {
                  // ignore and fallback to cache
                }
              }

              // Check local cache to avoid duplicate offline inserts
              try {
                const cached = await getTable(sessionType);
                const found = (cached || []).some(r => Number(r.session_id) === Number(academicSessionId) && Number(r.student_id) === Number(p.student_id));
                if (found) return { student_id: Number(p.student_id), added: false, reason: 'cached' };
              } catch (e) {
                // ignore cache errors
              }

              // Finally insert via offline-aware addRow so it queues when offline
              try {
                console.log('[BiometricsSignIn] ensuring participant via addParticipantRow', { session: academicSessionId, student_id: p.student_id });
                const addRes = await addParticipantRow({ session_id: academicSessionId, student_id: Number(p.student_id), school_id: schoolId });
                console.log('[BiometricsSignIn] addParticipantRow result:', addRes);
                return { student_id: Number(p.student_id), added: true, result: addRes };
              } catch (err) {
                return { student_id: Number(p.student_id), added: false, reason: String(err) };
              }
            } catch (err) {
              return { student_id: p.student_id, added: false, reason: String(err) };
            }
          }));

          const addedCount = ensured.filter(r => r.added).length;
          setMessage((m) => `${m}\nParticipants added to session: ${addedCount}/${ensured.length}`);
        } catch (err) {
          console.warn('Failed to ensure session participants', err);
        }
      }

    // notify parent with start/end/participants if provided
    try {
      if (typeof onRecordingStop === 'function') {
        onRecordingStop({
          start: recordingStartRef.current,
          end: stopTime,
          participants,
          academicSessionId,
        });
      }
    } catch (e) {
      if (DEBUG) console.warn('onRecordingStop callback failed', e);
    }

    // clear recording timestamp and return to snapshot mode
    recordingStartRef.current = null;
    setMode("snapshot");
  };

  // Parent-driven stop request: when `stopRecordingRequest` increments, stop continuous recording
  const lastStopReqRef = useRef(0);
  useEffect(() => {
    try {
      const v = Number(stopRecordingRequest) || 0;
      if (v && v !== lastStopReqRef.current) {
        lastStopReqRef.current = v;
        // only attempt to stop if currently recording
        if (mode === 'continuous') {
          stopContinuous().catch((e) => { if (DEBUG) console.warn('stopContinuous failed', e); });
        }
      }
    } catch (e) {
      if (DEBUG) console.warn('stopRecordingRequest effect failed', e);
    }
  }, [stopRecordingRequest]);

  // Parent-driven cancel-stop request: stop recording but do NOT commit attendance or session participants
  const lastCancelStopReqRef = useRef(0);
  const stopContinuousCancel = async () => {
    try {
      if (processIntervalRef.current) {
        clearInterval(processIntervalRef.current);
        processIntervalRef.current = null;
      }
      const stopTime = new Date().toISOString();

      // Prepare participants info captured during recording (but we won't commit them)
      const participants = Object.keys(pendingSignIns || {}).map((k) => {
        const v = pendingSignIns[k] || {};
        return {
          student_id: k,
          signInTime: v.signInTime || null,
          attendanceId: v.id || null,
          isWorker: v.isWorker || false,
          worker_id: v.worker_id || null,
        };
      });

      // Clear pending sign-ins without performing sign-outs or participant inserts
      setPendingSignIns({});

      setMessage('Recording stopped — session canceled (no attendance recorded).');

      // Notify parent that recording stopped but was canceled so it can avoid committing
      try {
        if (typeof onRecordingStop === 'function') {
          onRecordingStop({ start: recordingStartRef.current, end: stopTime, participants: [], academicSessionId, canceled: true });
        }
      } catch (e) {
        if (DEBUG) console.warn('onRecordingStop (cancel) failed', e);
      }

      // clear recording timestamp and return to snapshot mode
      recordingStartRef.current = null;
      setMode('snapshot');
    } catch (err) {
      console.warn('stopContinuousCancel failed', err);
    }
  };

  useEffect(() => {
    try {
      const v = Number(stopRecordingCancelRequest) || 0;
      if (v && v !== lastCancelStopReqRef.current) {
        lastCancelStopReqRef.current = v;
        if (mode === 'continuous') {
          stopContinuousCancel().catch((e) => { if (DEBUG) console.warn('stopContinuousCancel failed', e); });
        }
      }
    } catch (e) {
      if (DEBUG) console.warn('stopRecordingCancelRequest effect failed', e);
    }
  }, [stopRecordingCancelRequest]);

  const retryWorker = () => {
    setWorkerError(null);
    setWorkerAvailable(false);
    // increment key to trigger worker recreation
    setWorkerReloadKey((k) => k + 1);
  };

  // Lightweight retake: reset flag (webcam restarts via effect)
  const handleRetake = () => {
    setCaptureDone(false);
    // Optional: clear the last message to reduce clutter
    // setMessage("");
  };

  // Handle token-based authentication when webcam is unavailable
  const handleTokenSubmit = async (e) => {
    e.preventDefault();
    setTokenError("");
    
    if (!tokenInput || tokenInput.trim().length !== 6) {
      setTokenError("Please enter a valid 6-digit code");
      return;
    }
    
    if (!userId) {
      setTokenError("No user selected");
      return;
    }
    
    setIsProcessing(true);
    setMessage("Validating authentication code...");
    
    try {
      const isValid = await validateAuthToken(userId, tokenInput.trim());
      
      if (isValid) {
        setMessage("✅ Authentication successful!");
        setShowTokenInput(false);
        setTokenInput("");
        
        // Call onCompleted callback to proceed with sign-in
        if (onCompleted) {
          onCompleted(userId);
        }
      } else {
        setTokenError("Invalid or expired authentication code");
        setTokenInput("");
      }
    } catch (err) {
      console.error("Token validation error:", err);
      setTokenError("Failed to validate code. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Record attendance to database
  const recordAttendance = async (attendanceData) => {
    try {
      const date = new Date().toISOString().split("T")[0];
      
      // Build attendance record based on entity type
      const record = {
        school_id: schoolId,
        status: "present",
        note: attendanceData.note || "biometric sign in",
        date,
        sign_in_time: attendanceData.signInTime,
        method: "biometric"
      };
      
      // Add either student_id or user/profile mapping
      if (entityType === 'student') {
        record.student_id = attendanceData.entityId;
        const res = await addRow(record);
        // notify parent
        try {
          if (typeof onSignIn === 'function') onSignIn({ entityType: 'student', entityId: attendanceData.entityId, attendance: res, signInTime: attendanceData.signInTime });
        } catch (e) { if (DEBUG) console.warn('onSignIn callback failed', e); }
        return res;
      }

      // For users, decide whether this profile maps to a worker (profiles.worker_id)
      if (entityType === 'user') {
        try {
          const { data: profile, error: profileErr } = await api
            .from('profiles')
            .select('worker_id')
            .eq('id', attendanceData.entityId)
            .single();

          if (!profileErr && profile && profile.worker_id) {
            // Create a worker attendance record
            const workerPayload = {
              worker_id: profile.worker_id,
              school_id: schoolId,
              date,
              // record sign-in timestamp explicitly
              sign_in_time: attendanceData.signInTime,
              sign_out_time: null,
              // hours unknown at sign-in; will be set on sign-out
              hours: 0,
              status: 'present',
              description: attendanceData.note || 'biometric sign in',
              recorded_by: attendanceData.entityId,
            };

            const res = await addWorkerRow(workerPayload);
            // Notify parent of worker sign-in (server-side row created or queued via offline hook)
            try {
              if (typeof onSignIn === 'function') onSignIn({ entityType: 'worker', profileId: attendanceData.entityId, worker_id: profile.worker_id, attendance: res, signInTime: attendanceData.signInTime });
            } catch (e) { if (DEBUG) console.warn('onSignIn callback failed', e); }

            // Annotate return so callers know this was a worker attendance insert
            return { __worker: true, worker_id: profile.worker_id, result: res };
          }
        } catch (err) {
          console.warn('recordAttendance: failed to resolve profile->worker mapping', err);
        }

        // If not a worker profile, fall back to recording in attendance_records (user_id)
        record.user_id = attendanceData.entityId;
        const res = await addRow(record);
        try { if (typeof onSignIn === 'function') onSignIn({ entityType: 'user', entityId: attendanceData.entityId, attendance: res, signInTime: attendanceData.signInTime }); } catch (e) { if (DEBUG) console.warn('onSignIn callback failed', e); }
        return res;
      }
    } catch (err) {
      console.error("Failed to record attendance:", err);
      throw err;
    }
  };

  // Prompt user if they want to record attendance
  const promptAttendanceRecording = (entityId, displayName, isSignOut = false) => {
    const action = isSignOut ? "sign out" : "sign in";
    setPendingAttendanceData({
      entityId,
      displayName,
      isSignOut,
      signInTime: new Date().toISOString()
    });
    setShowAttendancePrompt(true);
    setMessage(`${displayName} authenticated. Record attendance for the day?`);
  };

  // Handle attendance prompt response
  const handleAttendanceResponse = async (recordIt) => {
    setShowAttendancePrompt(false);
    
    if (!pendingAttendanceData) return;
    
    const { entityId, displayName, isSignOut, signInTime } = pendingAttendanceData;
    
    if (recordIt) {
      // User said "Yes, record attendance"
      try {
        if (!isSignOut) {
          // Sign in
            const res = await recordAttendance({
              entityId,
              signInTime,
              note: `biometric ${entityType} sign in`
            });

            // recordAttendance may return a worker-insert wrapper when profile maps to worker
            if (res && res.__worker) {
              // res.result may be the created row (online) or temp object (offline)
              const workerResult = res.result || {};
              const pendingId = workerResult?.id || workerResult?.tempId || null;
              setPendingSignIns((prev) => ({
                ...prev,
                [entityId]: { id: pendingId, signInTime, isWorker: true, worker_id: res.worker_id },
              }));
              try { addRecordedParticipant(entityId, displayName, signInTime, pendingId, true); } catch (e) { if (DEBUG) console.warn('addRecordedParticipant failed', e); }
              try { if (typeof onSignIn === 'function') onSignIn({ entityType: 'worker', profileId: entityId, worker_id: res.worker_id, attendance: workerResult, signInTime }); } catch (e) { if (DEBUG) console.warn('onSignIn callback failed', e); }
            } else {
              const pendingId = res?.id || res?.tempId || null;
              setPendingSignIns((prev) => ({
                ...prev,
                [entityId]: { id: pendingId, signInTime, isWorker: false },
              }));
              try { addRecordedParticipant(entityId, displayName, signInTime, pendingId, false); } catch (e) { if (DEBUG) console.warn('addRecordedParticipant failed', e); }
              try { if (typeof onSignIn === 'function') onSignIn({ entityType: entityType === 'user' ? 'user' : 'student', entityId, attendance: res, signInTime }); } catch (e) { if (DEBUG) console.warn('onSignIn callback failed', e); }
            }

            setMessage(`${displayName} authenticated and attendance recorded.`);
            // Add academic session participant (for prompt-based sign-ins) if session id provided
            // Only add participants for students — do not insert profile/worker rows into student participants table
            try {
              if (academicSessionId && entityType === 'student') {
                await api.from(sessionType).insert({
                  session_id: academicSessionId,
                  student_id: Number(entityId),
                  school_id: schoolId
                });
              }
            } catch (e) {
              console.warn('Failed to insert academic_session_participant', e);
            }

            // Hide/unmount biometric UI for caller if they provided onCompleted
            if (typeof onCompleted === 'function') {
              try { onCompleted(entityId); } catch (e) { }
            }
        } else {
          // Sign out
            const pending = pendingSignIns[entityId];
            if (pending) {
              const signOutTime = new Date().toISOString();
              const durationMs = new Date(signOutTime) - new Date(pending.signInTime);
              const durationHours = (durationMs / (1000 * 60 * 60));

              // If this was recorded into worker_attendance_records, update that row with hours
              if (pending.isWorker) {
                try {
                  const workerRowId = pending.id; // tempId or real id
                  // updateRow handles online/offline update
                  await updateWorkerRow(workerRowId, { sign_out_time: signOutTime, hours: Number(durationHours.toFixed(2)), description: `biometric sign out @ ${signOutTime}` });
                  try { if (typeof onSignOut === 'function') onSignOut({ entityType: 'worker', profileId: entityId, worker_id: pending.worker_id, attendanceId: workerRowId, signOutTime }); } catch (e) { if (DEBUG) console.warn('onSignOut callback failed', e); }
                  // Notify any global listeners that a requested sign-out completed
                  try { window.dispatchEvent(new CustomEvent('app:request-signout-complete', { detail: { profileId: entityId, worker_id: pending.worker_id, attendanceId: workerRowId, signOutTime } })); } catch (e) { if (DEBUG) console.warn('dispatch app:request-signout-complete failed', e); }
                } catch (err) {
                  console.error('Failed to update worker attendance record on sign-out', err);
                }
              } else {
                // Existing behavior: update attendance_records sign_out_time
                try {
                  await updateRow(pending.id, { sign_out_time: signOutTime });
                  try { if (typeof onSignOut === 'function') onSignOut({ entityType: 'attendance', entityId, attendanceId: pending.id, signOutTime }); } catch (e) { if (DEBUG) console.warn('onSignOut callback failed', e); }
                  try { window.dispatchEvent(new CustomEvent('app:request-signout-complete', { detail: { entityId, attendanceId: pending.id, signOutTime } })); } catch (e) { if (DEBUG) console.warn('dispatch app:request-signout-complete failed', e); }
                } catch (err) {
                  console.error('updateRow failed, falling back to addRow update for attendance_records', err);
                  try {
                    await addRow({ id: pending.id, sign_out_time: signOutTime, _update: true });
                  } catch (err2) {
                    console.error('Failed to update attendance_records on sign-out', err2);
                  }
                }
              }
              try { completeRecordedParticipant(entityId, signOutTime); } catch (e) { if (DEBUG) console.warn('completeRecordedParticipant failed', e); }
              setPendingSignIns((prev) => {
                const copy = { ...prev };
                delete copy[entityId];
                return copy;
              });
              setMessage(`${displayName} signed out. Duration: ${durationHours.toFixed(2)} hrs`);
              // update academic_session_participants record sign_out_time when available
              try {
                if (academicSessionId) {
                  await api.from(sessionType)
                    .update({ sign_out_time: new Date().toISOString() })
                    .match({ session_id: academicSessionId, student_id: Number(entityId) });
                }
              } catch (e) {
                console.warn('Failed to update academic_session_participant sign_out_time', e);
              }
            }
        }
      } catch (err) {
        setMessage(`Failed to record attendance for ${displayName}: ${err.message}`);
      }
    } else {
      // User said "No, just login" or "No, just logout"
      const action = isSignOut ? "logged out" : "logged in";
      setMessage(`${displayName} ${action} (attendance not recorded).`);
      
      // For authentication-only mode, call onCompleted
      if (onCompleted && !isSignOut) {
        onCompleted(entityId);
      }
    }
    
    setPendingAttendanceData(null);
  };

  // Compute button labels (allow parent to override via props)
  const computedPrimaryLabel = (() => {
    if (isProcessing) return 'Processing...';
    if (primaryActionLabel) return primaryActionLabel;
  if (effectiveForceOperation === 'signin' && typeof onCompleted === 'function') return 'Log In';
  if (effectiveForceOperation === 'signout' && typeof onCompleted === 'function') return 'Log Out';
    return Object.keys(pendingSignIns).length === 0 ? 'Sign In' : 'Sign Out';
  })();

  const recordToggleLabel = mode === 'snapshot'
    ? (primaryRecordStartLabel || 'Record Session')
    : (primaryRecordEndLabel || 'End Session');

  return (
    <div
      className="student-signin-container"
      style={{ width: isSmallScreen ? '80vw' : '40vw', margin: '0 auto' }}
    >
      {loadingModels && <p style={{ textAlign: 'center' }}>Loading models…</p>}

      {!loadingModels && (
        <>
          {(workerError || !workerAvailable) && (
            <div style={{ textAlign: 'center', color: '#92400e', marginBottom: 8 }}>
              Using fallback processing mode
            </div>
          )}

          {/* Token Input for Sign-In/Sign-Out when webcam unavailable */}
          {showTokenInput && entityType === 'user' && (effectiveForceOperation === 'signin' || effectiveForceOperation === 'signout') && (
            <>
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1200 }} />
              <div
                role="dialog"
                aria-modal="true"
                style={{
                  position: 'fixed',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 1201,
                  background: '#fff',
                  padding: 18,
                  borderRadius: 8,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                  width: isSmallScreen ? '90vw' : '400px',
                  textAlign: 'center'
                }}
              >
                <h3 style={{ marginTop: 0 }}>{effectiveForceOperation === 'signout' ? 'Sign-out code' : 'Authentication code'}</h3>
                {message && <div style={{ fontSize: '0.9rem', color: '#374151', marginBottom: 8 }}>{message}</div>}

                <form onSubmit={handleTokenSubmit} style={{ maxWidth: '320px', margin: '0 auto' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength="6"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    disabled={isProcessing}
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '1.5rem',
                      textAlign: 'center',
                      letterSpacing: '0.3em',
                      border: tokenError ? '2px solid #dc2626' : '2px solid #0284c7',
                      borderRadius: 6,
                      marginBottom: 12,
                    }}
                    aria-label="Authentication code"
                    autoFocus
                  />

                  {tokenError && <p style={{ color: '#dc2626', fontSize: '0.9rem', marginBottom: 12 }}>{tokenError}</p>}

                  <button
                    type="submit"
                    disabled={isProcessing || tokenInput.length !== 6}
                    className="submit-btn"
                    style={{ width: '100%' }}
                  >
                    {isProcessing ? 'Validating...' : 'Sign In with Code'}
                  </button>
                </form>

                <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button onClick={() => { startWebcam(); }} className="submit-btn">Retry</button>
                  <button onClick={() => { setShowTokenInput(false); }} className="submit-btn">Cancel</button>
                </div>
              </div>
            </>
          )}

          {/* Attendance Recording Prompt */}
          {showAttendancePrompt && pendingAttendanceData && (
            <div style={{ padding: 12, marginBottom: 12, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{pendingAttendanceData.displayName}</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button onClick={() => handleAttendanceResponse(true)} className="submit-btn">Sign In</button>
                <button onClick={() => handleAttendanceResponse(false)} className="submit-btn">No, Just Login</button>
              </div>
            </div>
          )}

          {/* Webcam Warning for Sign-Out */}
          {webcamError && effectiveForceOperation === 'signout' && !showTokenInput && (
            <>
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1200 }} />
              <div
                role="alertdialog"
                style={{
                  position: 'fixed',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 1201,
                  background: '#fff',
                  padding: 18,
                  borderRadius: 8,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                  width: isSmallScreen ? '90vw' : '420px',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Webcam required for sign-out</div>
                {message && <div style={{ fontSize: '0.9rem', color: '#374151', marginBottom: 8 }}>{message}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button onClick={() => startWebcam()} className="submit-btn">Retry</button>
                  <button onClick={() => setShowTokenInput(true)} className="submit-btn">Use code</button>
                  <button onClick={() => { try { if (typeof onCancel === 'function') onCancel(); } catch (e) {} window.history.back(); }} className="submit-btn">Cancel</button>
                </div>
              </div>
            </>
          )}

          {/* Only show video and controls when not using token fallback or showing webcam warning */}
          {!showTokenInput && !(webcamError && effectiveForceOperation === 'signout') && (
            <>
              <div className="video-container">
            <video
              ref={webcamRef}
              autoPlay
              playsInline
              muted
              style={{
                display: captureDone ? "none" : "block",
                width: "100%",
                borderRadius: "8px",
              }}
            />
            <canvas
              ref={canvasRef}
              style={{
                display: captureDone ? "block" : "none",
                width: "100%",
                borderRadius: "8px",
              }}
            />

            {isSmallScreen && availableCameras.length > 1 && !captureDone && (
              <button
                className="switch-camera-btn-overlay"
                onClick={handleSwitchCamera}
                aria-label="Switch camera"
                title="Switch camera"
              >
                🔄
              </button>
            )}
            {captureDone && (
              <button
                className="retake-btn-overlay"
                onClick={handleRetake}
                title="Retake snapshot"
              >
                ↺ Retake
              </button>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
              <div style={{ marginBottom: 6 }}>
                <div style={{ textAlign: 'center' }}>{mode === 'continuous' ? 'Recording…' : ''}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: 'center' }}>
                {/* Single toggle button: start recording (Record Session) or stop recording (End Session)
                    This button handles automatic sign-ins while recording and will sign participants out when stopping. */}
                <button
                  className="submit-btn"
                  onClick={() => {
                    if (mode === 'snapshot') return startContinuous();
                    return stopContinuous();
                  }}
                  disabled={!referencesReady || isProcessing}
                  title={recordToggleLabel}
                >
                  {recordToggleLabel}
                </button>
              </div>
          </div>
            </>
          )}

          {/* Don't show the global floating message when token input or webcam fallback UI is active to avoid overlap */}
          {message && !showTokenInput && !webcamError && <pre className="message">{message}</pre>}

          {/* Small session participants panel: shows recorded participants and durations */}
          {recordedParticipants && recordedParticipants.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 border rounded">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Session participants</div>
                <div className="text-sm text-gray-500">{mode === 'continuous' ? 'Live' : 'Summary'}</div>
              </div>
              <div className="space-y-2">
                {recordedParticipants.map((p) => {
                  const name = p.displayName || `#${p.student_id}`;
                  let minutes = p.durationMinutes;
                  if ((minutes === null || minutes === undefined) && p.signInTime && !p.signOutTime) {
                    const start = new Date(p.signInTime).getTime();
                    const now = Date.now();
                    minutes = start ? ((now - start) / (1000 * 60)) : 0;
                  }
                  const minutesStr = minutes !== null && minutes !== undefined ? `${Number(minutes).toFixed(2)} min` : '—';
                  return (
                    <div key={`${p.student_id}-${p.signInTime}`} className="flex items-center justify-between">
                      <div className="text-sm">{name} <span className="text-xs text-gray-400">({p.student_id})</span></div>
                      <div className="text-sm font-mono text-indigo-600">{minutesStr}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* If models are not loaded, provide a quick link to Offline Settings so users can download models */}
          {!loadingModels && !areFaceApiModelsLoaded() && (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <button
                className="submit-btn"
                onClick={() => {
                  try { navigate('/settings/offline'); } catch (e) { window.location.href = '/settings/offline'; }
                }}
              >
                Open Offline Settings
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BiometricsSignIn;