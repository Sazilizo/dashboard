// src/components/biometrics/BiometricsSignIn.jsx
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import * as faceapi from "face-api.js";
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
  const [loadingModels, setLoadingModels] = useState(!areFaceApiModelsLoaded());
  const [message, setMessage] = useState("");
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [pendingSignIns, setPendingSignIns] = useState({});
  const [captureDone, setCaptureDone] = useState(false);
  const [referencesReady, setReferencesReady] = useState(false);
  const [studentNames, setStudentNames] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [availableCameras, setAvailableCameras] = useState([]);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const threshold = 0.6;
  const navigate = useNavigate();

  const { addRow } = useOfflineTable("attendance_records");
  const { isOnline } = useOnlineStatus();

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
        setLoadingModels(false);
        return;
      }
      try {
        await preloadFaceApiModels();
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

  const handleSwitchCamera = () => {
    if (availableCameras.length < 2) return;
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  // ✅ Load reference face descriptors
  useEffect(() => {
    if (!studentId || !bucketName || !folderName) return;
    const ids = Array.isArray(studentId) ? studentId : [studentId];

    (async () => {
      try {
        const labeledDescriptors = await Promise.all(
          ids.map(async (id) => {
            if (faceDescriptorCache[id]) return faceDescriptorCache[id];

            const { data: files, error } = await api.storage
              .from(bucketName)
              .list(`${folderName}/${id}`);
            if (error || !files?.length) return null;

            const imageFiles = files.filter((f) =>
              /\.(jpg|jpeg|png)$/i.test(f.name)
            );
            if (!imageFiles.length) return null;

            const descriptors = await Promise.all(
              imageFiles.map(async (file) => {
                try {
                  const path = `${folderName}/${id}/${file.name}`;
                  const { data: urlData } = await api.storage
                    .from(bucketName)
                    .createSignedUrl(path, 300);
                  if (!urlData?.signedUrl) return null;

                  const img = await faceapi.fetchImage(urlData.signedUrl);
                  const det = await faceapi
                    .detectSingleFace(
                      img,
                      new faceapi.TinyFaceDetectorOptions({
                        inputSize: 192,
                        scoreThreshold: 0.5,
                      })
                    )
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                  return det?.descriptor || null;
                } catch (err) {
                  console.warn(`Skipping file ${file.name} for ${id}`, err);
                  return null;
                }
              })
            );

            const validDescriptors = descriptors.filter(Boolean);
            if (!validDescriptors.length) return null;

            const labeled = new faceapi.LabeledFaceDescriptors(
              id.toString(),
              validDescriptors
            );
            faceDescriptorCache[id] = labeled;
            return labeled;
          })
        );

        const filtered = labeledDescriptors.filter(Boolean);
        if (filtered.length) {
          setFaceMatcher(new faceapi.FaceMatcher(filtered, threshold));
          setReferencesReady(true);
        } else {
          setMessage("No valid face references found.");
        }
      } catch (err) {
        console.error("Error loading face references", err);
        setMessage("Failed to load face reference images.");
      }
    })();
  }, [studentId, bucketName, folderName, threshold]);

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
      const detections = await faceapi
        .detectAllFaces(
          webcamRef.current,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 192, scoreThreshold: 0.5 })
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
          const durationMs =
            new Date(signOutTime) - new Date(pending.signInTime);
          const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);

          await addRow({ id: pending.id, sign_out_time: signOutTime, _update: true });
          setPendingSignIns((prev) => {
            const copy = { ...prev };
            delete copy[match.label];
            return copy;
          });
          setMessage(
            (m) => `${m}\n${displayName} signed out. Duration: ${durationHours} hrs`
          );
        }
      }

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
      <h2>Biometric Sign In / Out</h2>

      {loadingModels && <p>Loading face detection models...</p>}

      {!loadingModels && (
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
              >
                🔄 Switch Camera
              </button>
            )}
          </div>

          <button
            className="submit-btn"
            onClick={handleCapture}
            disabled={!referencesReady || isProcessing}
          >
            {isProcessing
              ? "Processing..."
              : Object.keys(pendingSignIns).length === 0
              ? "Sign In Snapshot"
              : "Sign Out Snapshot"}
          </button>

          {message && <pre className="message">{message}</pre>}
        </>
      )}
    </div>
  );
};

export default BiometricsSignIn;
