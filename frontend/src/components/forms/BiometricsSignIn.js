import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { getFaceApi } from "../../utils/faceApiShim";
import descriptorDB from "../../utils/descriptorDB";
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
  'profile-avatars': (id) => `${id}`  // For users, the bucket itself is profile-avatars
};
import {
  preloadFaceApiModels,
  areFaceApiModelsLoaded,
} from "../../utils/FaceApiLoader";
import { getTable, cacheTable } from "../../utils/tableCache";
import useOfflineTable from "../../hooks/useOfflineTable";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import "../../styles/BiometricsSignIn.css";

// Global cache to persist face descriptors across mounts
const faceDescriptorCache = {};

const BiometricsSignIn = ({
  studentId,
  schoolId,
  bucketName,
  folderName,
  sessionType,
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

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const threshold = 0.6;
  const navigate = useNavigate();

  const { addRow } = useOfflineTable("attendance_records");
  const { isOnline } = useOnlineStatus();
  const processIntervalRef = useRef(null);
  const captureCanvasRef = useRef(null); // offscreen canvas to downscale frames
  const descriptorWorkerRef = useRef(DescriptorWorker);
  const [workerError, setWorkerError] = useState(null);
  const [workerAvailable, setWorkerAvailable] = useState(!!DescriptorWorker);
  const [workerReloadKey, setWorkerReloadKey] = useState(0);
  const faceapiRef = useRef(null);

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
      if (areFaceApiModelsLoaded()) {
        // ensure faceapi module is available
        try {
          faceapiRef.current = await getFaceApi();
        } catch (e) {
          console.warn('Failed to get faceapi module after models loaded', e);
        }
        setLoadingModels(false);
        return;
      }
      try {
        await preloadFaceApiModels();
        try {
          faceapiRef.current = await getFaceApi();
        } catch (e) {
          console.warn('Failed to import faceapi after preloading models', e);
        }
        if (!cancelled) setLoadingModels(false);
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

  // ✅ Fetch student names (offline fallback)
  useEffect(() => {
    const ids = Array.isArray(studentId) ? studentId : [studentId];
    if (!ids.length) return;

    let mounted = true;
    (async () => {
      try {
        if (isOnline) {
          const { data, error } = await api
            .from("students")
            .select("id, full_name")
            .in("id", ids);
          if (!error && data) {
            const map = {};
            data.forEach((s) => (map[s.id] = s.full_name));
            if (mounted) setStudentNames(map);
            try {
              await cacheTable("students", data);
            } catch {}
          }
        } else {
          const cached = await getTable("students");
          const map = {};
          (cached || []).forEach((s) => {
            if (ids.includes(s.id) || ids.includes(Number(s.id)))
              map[s.id] = s.full_name;
          });
          if (mounted) setStudentNames(map);
        }
      } catch (err) {
        console.error("Failed to fetch student names", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [studentId, isOnline]);

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
            console.log('[BiometricsSignIn] descriptor worker initialized');
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
          console.error('[BiometricsSignIn] worker error message:', m.error, m);
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
        console.error('Descriptor worker error:', ev);
        setWorkerError(full);
        setWorkerAvailable(false);
      };

      // try to initialize the worker (asks it to load models); if init doesn't respond we fall back
      try {
        w.postMessage({ id: 'init', modelsUrl: MODELS_URL });
      } catch (err) {
        console.warn('Failed to post init to descriptor worker', err);
      }

      // fallback if init doesn't complete within timeout
      const initTimeout = setTimeout(() => {
        if (!descriptorWorkerRef.current) return;
        if (!workerAvailable) {
          const note = 'Descriptor worker did not initialize in time; falling back to main-thread processing.';
          console.warn(note);
          setWorkerError(note);
          setWorkerAvailable(false);
        }
      }, 8000);
    } catch (err) {
      console.warn("Failed to create descriptor worker in component", err);
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
  if (!studentId || !bucketName) return false;
  const ids = Array.isArray(studentId) ? studentId : [studentId];
  
  setLoadingReferences(true);
  setMessage("Loading face references...");
  
  try {
    // Determine the correct storage path generator based on the bucket name
    const getPath = STORAGE_PATHS[bucketName] || STORAGE_PATHS['student-uploads'];
    
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
        const listPath = getPath(id);
        const { data: files, error: listErr } = await api.storage
          .from(bucketName)
          .list(listPath);
        
        if (listErr) {
          console.warn(`Failed to list files for ID ${id}:`, listErr);
          continue;
        }
        
        if (!files?.length) {
          setMessage(m => `${m}\nNo profile images found for ID ${id}`);
          continue;
        }

        const imageFiles = files.filter((f) => /\.(jpg|jpeg|png)$/i.test(f.name));
        if (!imageFiles.length) {
          setMessage(m => `${m}\nNo valid image files found for ID ${id}`);
          continue;
        }

        // limit descriptors per id to reduce memory/time
        const limited = imageFiles.slice(0, 3);
        const paths = limited.map((f) => `${listPath}/${f.name}`);

        // batch create signed URLs
        const signedResults = await Promise.all(
          paths.map((p) => api.storage.from(bucketName).createSignedUrl(p, 300))
        );
        
        const urlsData = [];
        let urlErr = null;
        for (const r of signedResults) {
          if (r.error) {
            urlErr = r.error;
            urlsData.push(null);
          } else {
            urlsData.push(r.data?.signedUrl || null);
          }
        }
        
        if (urlErr || !urlsData.filter(Boolean).length) continue;

        const descriptors = [];
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
                maxDescriptors: limited.length
              });
            } catch (err) {
              console.warn("Worker postMessage failed", err);
              resolve({ id, descriptors: [], error: err?.message || String(err) });
            }
          });

          if (workerResp?.descriptors?.length) {
            for (const arr of workerResp.descriptors) {
              descriptors.push(new Float32Array(arr));
            }
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
                setMessage(m => `${m}\n✓ Generated descriptor for ID ${id}`);
              }
            } catch (err) {
              console.warn(`Failed to process image for ${id}:`, err);
              setMessage(m => `${m}\n⚠️ Failed to process an image for ID ${id}`);
            }
          }
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
            console.warn("Failed to persist descriptors", err);
          }
        }
      } catch (err) {
        console.warn(`Failed to load references for ${id}:`, err);
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
}, [studentId, bucketName, threshold]);

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
      const detections = await faceapi
        .detectAllFaces(
          canvas,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.45 })
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

      for (const match of results) {
        if (match.label === "unknown") continue;
        const displayName = studentNames[match.label] || `ID ${match.label}`;

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

      // show a captured frame
      setCaptureDone(true);
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
      const detections = await faceapi
        .detectAllFaces(
          canvas,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.45 })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (!detections?.length) return;

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
              <div>
                <strong style={{ color: "#92400e" }}>Processing Notice:</strong>
                <div style={{ color: "#92400e" }}>Face recognition temporarily using fallback mode. This may be slower but will not affect functionality.</div>
              </div>
            </div>
          )}
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
              >
                🔄 Switch Camera
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