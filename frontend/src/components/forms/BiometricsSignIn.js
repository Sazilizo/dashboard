import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { getFaceApi } from "../../utils/faceApiShim";
import descriptorDB from "../../utils/descriptorDB";
import imageCache from "../../utils/imageCache";
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
import "../../styles/BiometricsSignIn.css";

// Toggle verbose logs for debugging
const DEBUG = true;
// Lightweight in-app performance overlay for timing key steps
const PERF_UI = true;

// Global cache to persist face descriptors across mounts
const faceDescriptorCache = {};

// Retry configuration for loading face references
const maxRetries = 3;
const retryTimeouts = [2000, 5000, 10000]; // ms between retries

const BiometricsSignIn = ({
  studentId,
  userId,
  entityType = 'student', // 'student' | 'user'
  schoolId,
  bucketName,
  folderName,
  sessionType,
  forceOperation = null, // null | 'signout' (force sign-out on face match)
  onCompleted,
}) => {
  // Essential states with defaults
  const [loadingModels, setLoadingModels] = useState(!areFaceApiModelsLoaded());
  const [message, setMessage] = useState("");
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [pendingSignIns, setPendingSignIns] = useState({});
  const [captureDone, setCaptureDone] = useState(false);
  const [referencesReady, setReferencesReady] = useState(false);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [studentNames, setStudentNames] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [availableCameras, setAvailableCameras] = useState([]);
  const [mode, setMode] = useState("snapshot");
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth <= 900);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryInSec, setRetryInSec] = useState(null);
  const retryIntervalRef = useRef(null);
  const effectiveBucket = bucketName || (entityType === 'user' ? 'profile-avatars' : bucketName);

  // Minimal performance timers
  const perfRef = useRef({
    start: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
    modelsStart: null,
    modelsEnd: null,
    refsStart: null,
    refsEnd: null,
    cameraStart: null,
    cameraEnd: null,
    captureStart: null,
    captureEnd: null,
  });
  const [perfSnapshot, setPerfSnapshot] = useState(null);
  const snapPerf = useCallback(() => setPerfSnapshot({ ...perfRef.current }), []);

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const threshold = 0.6;
  const navigate = useNavigate();

  const { addRow } = useOfflineTable("attendance_records");
  const [workerReloadKey, setWorkerReloadKey] = useState(0);
  const faceapiRef = useRef(null);
  // Online status
  const { isOnline } = useOnlineStatus();
  // Refs for capture/processing and worker
  const captureCanvasRef = useRef(null);
  const processIntervalRef = useRef(null);
  const descriptorWorkerRef = useRef(null);
  const [workerAvailable, setWorkerAvailable] = useState(false);
  const [workerError, setWorkerError] = useState(null);

  // ✅ Detect screen size for camera switch visibility
  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerWidth <= 900);
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ✅ Load pending sign-ins
  useEffect(() => {
    const stored = localStorage.getItem("pendingSignIns");
    if (stored) setPendingSignIns(JSON.parse(stored));
  }, []);

  // ✅ Persist pending sign-ins
  useEffect(() => {
    localStorage.setItem("pendingSignIns", JSON.stringify(pendingSignIns));
  }, [pendingSignIns]);

  // ✅ Ensure models are ready (fast if preloaded)
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
      if (webcamRef.current) webcamRef.current.srcObject = stream;
      await webcamRef.current.play();
      perfRef.current.cameraEnd = (performance.now ? performance.now() : Date.now());
      if (PERF_UI) snapPerf();
    } catch (err) {
      console.error("Webcam access failed:", err);
      setMessage("Could not access webcam. Check permissions.");
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
  const ids = entityType === 'user'
    ? (Array.isArray(userId) ? userId : [userId]).filter(Boolean)
    : (Array.isArray(studentId) ? studentId : [studentId]).filter(Boolean);
  
  setLoadingReferences(true);
  if (attempt === 0) {
    // reset retry indicators on fresh load
    setRetryAttempt(0);
    setRetryInSec(null);
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }
  }
  setMessage("Loading face references...");
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
    for (const i of ids) {
      const persisted = await descriptorDB.getDescriptor(i);
      if (persisted && persisted.length) {
        try {
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

        // Try each source until we get descriptors
        for (const source of sourcesToTry) {
          if (descriptors.length > 0) break; // Already got descriptors, skip remaining sources

          if (DEBUG) console.log(`[BiometricsSignIn] Trying ${source.label}: ${source.bucket}/${source.path || '(root)'}`);

          // Check cache first for offline support
          const cachedImages = await imageCache.getCachedImagesByEntity(id);
          const cachedForSource = cachedImages.filter(img => img.bucket === source.bucket);
          
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
            
            const { data: files, error: listErr } = await api.storage
              .from(source.bucket)
              .list(listPath);
            
            if (DEBUG && files) console.log(`[BiometricsSignIn] Found ${files.length} total files in ${source.bucket}`, files);
            
            if (listErr) {
              // If online fetch fails, try cached images as fallback
              if (cachedForSource.length > 0) {
                if (DEBUG) console.log(`[BiometricsSignIn] Fetch failed, falling back to cached images for ${source.label}`);
                setMessage(m => `${m}\n📦 ${source.label}: Using cached images (fallback)`);
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

              // Cache the images for offline use
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
                  inputSize: 128,
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
                    inputSize: 128,
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
          const faceapi = faceapiRef.current;
          const labeled = new faceapi.LabeledFaceDescriptors(id.toString(), descriptors);
          faceDescriptorCache[id] = labeled;
          loadedDescriptors.push(labeled);
          
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
  loadFaceReferences(0);
}, [studentId, userId, effectiveBucket, threshold]);

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
      const DETECTOR_SIZE = isSmallScreen ? 112 : 128;
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
        const displayName = studentNames[match.label] || `ID ${match.label}`;

        // For user authentication mode (entityType='user')
        if (entityType === 'user') {
          // Check if this is the correct user
          const expectedId = userId || (Array.isArray(userId) ? userId[0] : null);
          if (String(match.label) === String(expectedId)) {
            setMessage(`${displayName} verified successfully!`);
            setCaptureDone(true);
            
            // Call onCompleted callback if provided
            if (onCompleted) {
              setTimeout(() => onCompleted(match.label), 500);
            }
            setIsProcessing(false);
            return;
          } else {
            setMessage(`Face does not match expected user. Please try again.`);
            setIsProcessing(false);
            return;
          }
        }

        // Student mode - existing sign in/out logic
        if (!pendingSignIns[match.label]) {
          const signInTime = new Date().toISOString();
          const res = await addRow({
            student_id: match.label,
            school_id: schoolId,
            status: "present",
            note: "biometric sign in",
            date,
            sign_in_time: signInTime,
          });

          const pendingId = res?.tempId || null;
          setPendingSignIns((prev) => ({
            ...prev,
            [match.label]: { id: pendingId, signInTime },
          }));
          setMessage((m) => `${m}\n${displayName} signed in.`);
        } else {
          const pending = pendingSignIns[match.label];
          const signOutTime = new Date().toISOString();
          const durationMs = new Date(signOutTime) - new Date(pending.signInTime);
          const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);

          await addRow({ id: pending.id, sign_out_time: signOutTime, _update: true });
          setPendingSignIns((prev) => {
            const copy = { ...prev };
            delete copy[match.label];
            return copy;
          });
          setMessage((m) => `${m}\n${displayName} signed out. Duration: ${durationHours} hrs`);
        }
      }

      // If no known faces were found, show message
      if (!matchFound) {
        setMessage("No recognized faces detected. Please try again.");
        setIsProcessing(false);
        return;
      }

      // draw the captured frame to the visible canvas and mark as done
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
  setCaptureDone(true);
  perfRef.current.captureEnd = (performance.now ? performance.now() : Date.now());
  if (PERF_UI) snapPerf();
    } catch (err) {
      console.error("handleCapture error:", err);
      setMessage("Failed to detect or record attendance.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Process a single frame (used by continuous mode)
  const processFrame = useCallback(async () => {
    if (isProcessing || !referencesReady || !faceMatcher || !webcamRef.current) return;
    try {
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
      const DETECTOR_SIZE = isSmallScreen ? 112 : 128;
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
          const res = await addRow({
            student_id: match.label,
            school_id: schoolId,
            status: "present",
            note: "biometric sign in",
            date,
            sign_in_time: signInTime,
          });
          const pendingId = res?.tempId || null;
          setPendingSignIns((prev) => ({ ...prev, [match.label]: { id: pendingId, signInTime } }));
          const displayName = studentNames[match.label] || `Student ${match.label}`;
          setMessage(`${displayName} signed in successfully.`);
        }
      }
    } catch (err) {
      console.error("processFrame error:", err);
      setMessage("Unable to process faces. Please try again.");
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
  };

  const stopContinuous = () => {
    if (processIntervalRef.current) {
      clearInterval(processIntervalRef.current);
      processIntervalRef.current = null;
    }
    setMode("snapshot");
  };

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

  return (
    <div className="student-signin-container">
      <h2>Biometric Sign In / Out</h2>

      {loadingModels && <p>Loading face detection models...</p>}

      {!loadingModels && (
        <>
          {(workerError || !workerAvailable) && (
            <div
              style={{
                background: "#fff4e5",
                borderLeft: "4px solid #f59e0b",
                padding: 12,
                marginBottom: 12,
              }}
              role="alert"
            >
              <div className="controls-row">
                <strong style={{ color: "#92400e" }}>Processing Notice:</strong>
                <div style={{ color: "#92400e" }}>Face recognition temporarily using fallback mode. This may be slower but will not affect functionality.</div>
              </div>
            </div>
          )}
          <div className="video-container">
            {PERF_UI && perfSnapshot && (
              <div className="perf-overlay" aria-label="Performance timings">
                <div>Models: {perfSnapshot.modelsStart != null && perfSnapshot.modelsEnd != null ? Math.round(perfSnapshot.modelsEnd - perfSnapshot.modelsStart) + 'ms' : '-'}</div>
                <div>Refs: {perfSnapshot.refsStart != null && perfSnapshot.refsEnd != null ? Math.round(perfSnapshot.refsEnd - perfSnapshot.refsStart) + 'ms' : '-'}</div>
                <div>Camera: {perfSnapshot.cameraStart != null && perfSnapshot.cameraEnd != null ? Math.round(perfSnapshot.cameraEnd - perfSnapshot.cameraStart) + 'ms' : '-'}</div>
                <div>Capture: {perfSnapshot.captureStart != null && perfSnapshot.captureEnd != null ? Math.round(perfSnapshot.captureEnd - perfSnapshot.captureStart) + 'ms' : '-'}</div>
              </div>
            )}
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
              <strong>Mode:</strong> {mode === "continuous" ? "Continuous (recommended for groups)" : "Snapshot (single capture)"}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="submit-btn"
                onClick={handleCapture}
                disabled={!referencesReady || isProcessing || mode === "continuous"}
              >
                {isProcessing
                  ? "Processing..."
                  : Object.keys(pendingSignIns).length === 0
                  ? "Sign In Snapshot"
                  : "Sign Out Snapshot"}
              </button>

              {mode === "snapshot" ? (
                <button
                  className="submit-btn"
                  onClick={startContinuous}
                  disabled={!referencesReady || isProcessing}
                  title="Start continuous mode: processes frames repeatedly (better for groups)"
                >
                  Start group(Video)
                </button>
              ) : (
                <button
                  className="submit-btn"
                  onClick={stopContinuous}
                  disabled={isProcessing}
                  title="Stop continuous processing"
                >
                  Stop group
                </button>
              )}
            </div>
          </div>

          {message && <pre className="message">{message}</pre>}
        </>
      )}
    </div>
  );
};

export default BiometricsSignIn;