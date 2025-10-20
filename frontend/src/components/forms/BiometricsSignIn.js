// src/components/biometrics/BiometricsSignIn.jsx
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as faceapi from "face-api.js";
import {
  preloadFaceApiModels,
  areFaceApiModelsLoaded,
} from "../../utils/FaceApiLoader";
import { getTable } from "../../utils/tableCache";
import useOfflineTable from "../../hooks/useOfflineTable";
import "../../styles/BiometricsSignIn.css";

// NEW: use your faceDescriptors cache helpers
import { cacheFaceDescriptors, getFaceDescriptors } from "../../utils/faceDescriptorCache";
import api from "../../api/client";

// Global face descriptor cache (memory) across mounts
const faceDescriptorCache = {};

const BiometricsSignIn = ({
  entityType = "student", // "student", "worker" or "profile"
  entityIds,
  schoolId,
  bucketName , // default if you use worker-uploads
  folderName ,       // default folder
}) => {
  const [loadingModels, setLoadingModels] = useState(!areFaceApiModelsLoaded());
  const [message, setMessage] = useState("");
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [pendingSignIns, setPendingSignIns] = useState({});
  const [referencesReady, setReferencesReady] = useState(false);
  const [entityNames, setEntityNames] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [availableCameras, setAvailableCameras] = useState([]);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [captureDone, setCaptureDone] = useState(false);

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const threshold = 0.6;
  const navigate = useNavigate();

  const { addRow } = useOfflineTable("attendance_records");

  // Normalize entity IDs to array
  const ids = Array.isArray(entityIds)
    ? entityIds.filter(Boolean)
    : entityIds
    ? [entityIds]
    : [];

  // responsive
  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerWidth <= 900);
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // pendingSignIns persisted
  useEffect(() => {
    const stored = localStorage.getItem("pendingSignIns");
    if (stored) {
      try {
        setPendingSignIns(JSON.parse(stored));
      } catch (e) {
        console.warn("pendingSignIns parse failed", e);
      }
    }
  }, []);
  useEffect(() => {
    localStorage.setItem("pendingSignIns", JSON.stringify(pendingSignIns || {}));
  }, [pendingSignIns]);

  // models
  useEffect(() => {
    let cancelled = false;
    const loadModels = async () => {
      if (areFaceApiModelsLoaded()) {
        setLoadingModels(false);
        return;
      }
      try {
        await preloadFaceApiModels();
        if (!cancelled) setLoadingModels(false);
      } catch (err) {
        console.error("Failed to load face-api models", err);
        if (!cancelled) setMessage("Failed to load face detection models.");
      }
    };
    loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  // names from cached tables
  useEffect(() => {
    if (!ids.length) return;
    let mounted = true;
    (async () => {
      try {
        const students = await getTable("students");
        const workers = await getTable("workers");
        const profiles = await getTable("profiles");

        const map = {};
        for (const id of ids) {
          if (entityType === "student") {
            const s = students.find((r) => r.id === id || String(r.id) === String(id));
            if (s) map[id] = s.full_name;
          } else if (entityType === "worker") {
            const w = workers.find((r) => r.id === id || String(r.id) === String(id));
            if (w) map[id] = `${w.first_name || ""} ${w.last_name || ""}`.trim();
          } else if (entityType === "profile") {
            const p = profiles.find((r) => r.id === id || String(r.id) === String(id));
            if (p) {
              if (p.worker_id) {
                const w = workers.find((r) => r.id === p.worker_id);
                map[id] = w ? `${w.first_name || ""} ${w.last_name || ""}`.trim() : `${p.first_name || ""} ${p.last_name || ""}`.trim();
              } else {
                map[id] = p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim();
              }
            }
          }
        }
        if (mounted) setEntityNames(map);
      } catch (err) {
        console.error("Failed to load entity names from cache", err);
      }
    })();
    return () => { mounted = false; };
  }, [entityType, ids]);

  // cameras
  useEffect(() => {
    (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAvailableCameras(devices.filter((d) => d.kind === "videoinput"));
      } catch (err) {
        console.error("enumerateDevices failed", err);
      }
    })();
  }, []);

  const startWebcam = async (facing = "user") => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: facing, width: { ideal: 320 }, height: { ideal: 240 } },
      });
      streamRef.current = stream;
      if (webcamRef.current) webcamRef.current.srcObject = stream;
      await webcamRef.current.play();
    } catch (err) {
      console.error("Could not access webcam", err);
      setMessage("Could not access webcam. Ensure camera permission is allowed.");
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

  const handleSwitchCamera = () => {
    if (availableCameras.length < 2) return;
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  // ------------------------------
  // Descriptor loader: PRIMARY FIX
  // - Try memory cache
  // - Then try IDB via getFaceDescriptors()
  // - If not found and online, download from Supabase storage (bucketName/folderName/{id}/...), compute descriptors and cache
  // - Provide clear console messages and user-facing message when nothing is available
  // ------------------------------
  useEffect(() => {
    if (!ids.length) return;

    let cancelled = false;
    (async () => {
      setReferencesReady(false);
      setMessage("Loading face references...");
      try {
        const labeledDescriptors = [];

        for (const rawId of ids) {
          // Resolve actual worker id if entityType === 'profile' and profile maps to a worker_id
          let idToUse = rawId;
          if (entityType === "profile") {
            // attempt to resolve worker id from profiles table cached in IDB
            try {
              const profiles = await getTable("profiles");
              const p = profiles.find((r) => String(r.id) === String(rawId));
              if (p?.worker_id) idToUse = p.worker_id;
            } catch (e) {
              console.warn("profiles lookup failed", e);
            }
          }

          // skip falsy
          if (!idToUse) {
            console.warn("No id to use for", rawId);
            continue;
          }

          // memory cache hit?
          if (faceDescriptorCache[idToUse]) {
            labeledDescriptors.push(faceDescriptorCache[idToUse]);
            continue;
          }

          // Try IndexedDB descriptors (your faceDescriptorsCache)
          try {
            const stored = await getFaceDescriptors(idToUse);
            // stored expected to be array of descriptor arrays (e.g. Float32 arrays serialized as plain number arrays)
            if (stored && Array.isArray(stored) && stored.length) {
              const float32s = stored.map((arr) => new Float32Array(arr));
              const labeled = new faceapi.LabeledFaceDescriptors(String(idToUse), float32s);
              faceDescriptorCache[idToUse] = labeled;
              labeledDescriptors.push(labeled);
              console.info(`[Biometrics] Loaded descriptors from IDB for id=${idToUse}`);
              continue;
            }
          } catch (e) {
            console.warn(`[Biometrics] getFaceDescriptors failed for ${idToUse}`, e);
          }

          // If not stored and offline -> skip with warning
          if (!navigator.onLine) {
            console.warn(`[Biometrics] No cached descriptors for ${idToUse} and offline — skipping`);
            continue;
          }

          // Online: attempt to fetch image(s) from Supabase storage and compute descriptors, then cache
          try {
            // Attempt listing files under folderName/idToUse (the code you had previously used)
            const { data: files, error: listErr } = await api.storage.from(bucketName).list(`${folderName}/${idToUse}`);
            if (listErr || !files?.length) {
              console.warn(`[Biometrics] No files listed for ${folderName}/${idToUse}`, listErr);
            } else {
              // find image files
              const imageFiles = files.filter((f) => /\.(jpg|jpeg|png)$/i.test(f.name));
              const descriptorsForId = [];
              for (const file of imageFiles) {
                try {
                  const path = `${folderName}/${idToUse}/${file.name}`;
                  const { data: urlData, error: urlErr } = await api.storage.from(bucketName).createSignedUrl(path, 60);
                  if (urlErr || !urlData?.signedUrl) {
                    console.warn("createSignedUrl failed for", path, urlErr);
                    continue;
                  }
                  // fetch image via faceapi (accepts URL)
                  const img = await faceapi.fetchImage(urlData.signedUrl);
                  const det = await faceapi
                    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 192, scoreThreshold: 0.5 }))
                    .withFaceLandmarks()
                    .withFaceDescriptor();
                  if (det?.descriptor) descriptorsForId.push(det.descriptor);
                } catch (e) {
                  console.warn("Failed to process storage file for id", idToUse, e);
                }
              }

              if (descriptorsForId.length) {
                // Cache descriptors into IDB for future offline use (serialize Float32Array -> number[])
                try {
                  const toStore = descriptorsForId.map((d) => Array.from(d));
                  await cacheFaceDescriptors(idToUse, toStore);
                  console.info(`[Biometrics] Cached ${toStore.length} descriptors for ${idToUse} into IDB`);
                } catch (e) {
                  console.warn("cacheFaceDescriptors failed", e);
                }
                const labeled = new faceapi.LabeledFaceDescriptors(String(idToUse), descriptorsForId);
                faceDescriptorCache[idToUse] = labeled;
                labeledDescriptors.push(labeled);
                continue;
              } else {
                console.warn(`[Biometrics] No valid descriptors produced from files for ${idToUse}`);
              }
            }
          } catch (err) {
            console.error(`[Biometrics] network descriptor fetch failed for ${idToUse}`, err);
          }
        } // end for ids

        // Build matcher if we have at least one labeled descriptor
        const filtered = labeledDescriptors.filter(Boolean);
        if (filtered.length) {
          if (!cancelled) {
            setFaceMatcher(new faceapi.FaceMatcher(filtered, threshold));
            setReferencesReady(true);
            setMessage((m) => `${m}\nLoaded ${filtered.length} reference(s).`);
            console.info("[Biometrics] FaceMatcher ready with", filtered.length, "labels");
          }
        } else {
          if (!cancelled) {
            setReferencesReady(false);
            setMessage("No valid face references found for the selected IDs. If online, try pre-caching references or ensure descriptors have been cached.");
            console.warn("No valid face references found for any id:", ids);
          }
        }
      } catch (err) {
        console.error("Error while loading face references:", err);
        setMessage("Failed to load face reference images.");
      }
    })();

    return () => { /* cancel */ };
  }, [ids, bucketName, folderName]);

  // ------------------------------
  // Capture & Match (unchanged mostly)
  // ------------------------------
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
      const detections = await faceapi
        .detectAllFaces(webcamRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 192, scoreThreshold: 0.5 }))
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

        // If entityType === 'profile', we may have matched worker id; unify sign-in id
        let matchedId = match.label;
        if (entityType === "profile") {
          // try to find profile that maps to this worker id (if needed)
          try {
            const profiles = await getTable("profiles");
            const profile = profiles.find((p) => p.worker_id && String(p.worker_id) === String(matchedId));
            if (profile) {
              matchedId = profile.worker_id; // we will store worker_id column below
            }
          } catch (e) {
            // ignore
          }
        }

        const displayName = entityNames[matchedId] || `ID ${matchedId}`;

        if (!pendingSignIns[matchedId]) {
          const signInTime = new Date().toISOString();
          const res = await addRow({
            [`${entityType === "student" ? "student" : "worker"}_id`]: matchedId,
            school_id: schoolId,
            status: "present",
            note: `biometric sign in (${entityType})`,
            date,
            sign_in_time: signInTime,
          });

          const pendingId = res?.tempId || null;
          setPendingSignIns((prev) => ({ ...prev, [matchedId]: { id: pendingId, signInTime } }));
          setMessage((m) => `${m}\n${displayName} signed in.`);
        } else {
          const pending = pendingSignIns[matchedId];
          const signOutTime = new Date().toISOString();
          const durationMs = new Date(signOutTime) - new Date(pending.signInTime);
          const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);

          await addRow({ id: pending.id, sign_out_time: signOutTime, _update: true });
          setPendingSignIns((prev) => {
            const copy = { ...prev };
            delete copy[matchedId];
            return copy;
          });

          setMessage((m) => `${m}\n${displayName} signed out. Duration: ${durationHours} hrs`);
        }
      }

      // Draw snapshot to canvas
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const width = webcamRef.current.videoWidth || 320;
      const height = webcamRef.current.videoHeight || 240;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(webcamRef.current, 0, 0, width, height);

      setCaptureDone(true);
    } catch (err) {
      console.error("handleCapture error:", err);
      setMessage("Failed to detect or record attendance.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="student-signin-container">
      <h2>Biometric Sign In / Out ({entityType === "worker" ? "Workers" : entityType === "profile" ? "Profiles" : "Students"})</h2>

      {loadingModels && <p>Loading face detection models...</p>}

      {!loadingModels && (
        <>
          <div className="video-container">
            <video ref={webcamRef} autoPlay playsInline muted style={{ display: captureDone ? "none" : "block", width: "100%", borderRadius: "8px" }} />
            <canvas ref={canvasRef} style={{ display: captureDone ? "block" : "none", width: "100%", borderRadius: "8px" }} />

            {isSmallScreen && availableCameras.length > 1 && !captureDone && (
              <button className="switch-camera-btn-overlay" onClick={handleSwitchCamera}>🔄 Switch Camera</button>
            )}
          </div>

          <button className="submit-btn" onClick={handleCapture} disabled={!referencesReady || isProcessing}>
            {isProcessing ? "Processing..." : Object.keys(pendingSignIns).length === 0 ? "Sign In Snapshot" : "Sign Out Snapshot"}
          </button>

          {message && <pre className="message">{message}</pre>}
        </>
      )}
    </div>
  );
};

export default BiometricsSignIn;
