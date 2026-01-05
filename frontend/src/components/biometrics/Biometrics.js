import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api/client";
import { loadFaceApiModels } from "../../utils/FaceApiLoader";
import { getFaceApi } from "../../utils/faceApiShim";
import { cacheImage } from "../../utils/imageCache";
import { getDescriptor, setDescriptor } from "../../utils/descriptorDB";
import { queueMutation } from "../../utils/tableCache";

/* =========================
   CONFIG
========================= */

const MATCH_THRESHOLD = 0.65;
const INPUT_SIZE = 192;
const SCORE_THRESHOLD = 0.45;
const DETECT_INTERVAL_MS = 500;
const CAMERA_CONSTRAINTS = {
  video: { 
    facingMode: "user", 
    width: { ideal: 320, max: 480 },
    height: { ideal: 240, max: 360 },
    frameRate: { ideal: 15, max: 24 }
  },
  audio: false
};

let sessionModelsLoaded = false;

/* =========================
   HELPERS
========================= */

const toFloat32 = (arr) =>
  arr.map((d) => (d instanceof Float32Array ? d : new Float32Array(d)));

const toPlain = (arr) => arr.map((d) => Array.from(d));

async function blobToImage(blob, faceapi) {
  return await faceapi.bufferToImage(blob);
}

/**
 * Download reference images with route-aware bucket prioritization
 * For kiosk/workers routes: worker-uploads first, then profile-avatars
 * For other routes: profile-avatars first, then worker-uploads
 */
async function downloadReferenceImages(profile, entityType) {
  const faceId = profile.id;
  const results = [];
  const currentPath = window.location.pathname;
  const isWorkerContext = currentPath.includes('/workers') || currentPath.includes('/kiosk');

  const tryBucket = async (bucket, path) => {
    try {
      const { data: files } = await api.storage.from(bucket).list(path);
      for (const f of files || []) {
        if (!/\.(jpg|jpeg|png|webp)$/i.test(f.name)) continue;
        const fullPath = path ? `${path}/${f.name}` : f.name;
        try {
          const { data: blob } = await api.storage.from(bucket).download(fullPath);
          if (blob) {
            results.push(blob);
            await cacheImage(bucket, fullPath, blob, faceId).catch(() => {});
          }
        } catch {}
      }
    } catch {}
  };

  const tryDirectAvatar = async () => {
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      try {
        const fileName = `${faceId}.${ext}`;
        const { data: blob } = await api.storage.from("profile-avatars").download(fileName);
        if (blob) {
          results.push(blob);
          await cacheImage("profile-avatars", fileName, blob, faceId).catch(() => {});
          return true;
        }
      } catch {}
    }
    return false;
  };

  // Route-aware prioritization
  if (entityType === "worker" && profile.worker_id) {
    if (isWorkerContext) {
      // Kiosk/Workers route: prioritize worker-uploads
      await tryBucket("worker-uploads", `workers/${profile.worker_id}/profile-picture`);
      if (!results.length) await tryDirectAvatar();
    } else {
      // Other routes: prioritize profile-avatars
      const found = await tryDirectAvatar();
      if (!found) await tryBucket("worker-uploads", `workers/${profile.worker_id}/profile-picture`);
    }
  } else if (entityType === "student") {
    await tryBucket("student-uploads", `students/${faceId}/profile-picture`);
    if (!results.length) await tryDirectAvatar();
  } else {
    await tryDirectAvatar();
  }

  return results;
}

/**
 * Write attendance record to database with offline queueing
 * Returns the created/updated record or null on failure
 */
async function writeAttendanceRecord({ entityType, entityId, action, schoolId, recordedBy, existingRecordId = null }) {
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  if (entityType === "worker") {
    if (action === "sign_in") {
      // Create new worker attendance record
      const record = {
        worker_id: entityId,
        school_id: schoolId,
        date: today,
        sign_in_time: now,
        recorded_by: recordedBy,
      };
      
      const result = await queueMutation("worker_attendance_records", "insert", record);
      return result?.success ? result.data : null;
    } else if (action === "sign_out" && existingRecordId) {
      // Update existing record with sign_out_time (backend calculates hours)
      const update = {
        sign_out_time: now,
      };
      
      const result = await queueMutation("worker_attendance_records", "update", update, existingRecordId);
      return result?.success ? result.data : null;
    }
  } else if (entityType === "student") {
    if (action === "sign_in") {
      // Create new student attendance record
      const record = {
        student_id: entityId,
        school_id: schoolId,
        date: today,
        sign_in_time: now,
        status: "present",
        method: "biometric",
        recorded_by: recordedBy,
      };
      
      const result = await queueMutation("attendance_records", "insert", record);
      return result?.success ? result.data : null;
    } else if (action === "sign_out" && existingRecordId) {
      // Update existing record with sign_out_time and completed status
      const update = {
        sign_out_time: now,
        status: "completed",
      };
      
      const result = await queueMutation("attendance_records", "update", update, existingRecordId);
      return result?.success ? result.data : null;
    }
  }

  return null;
}

/* =========================
   COMPONENT
========================= */

export default function Biometrics({
  profile,
  entityType = "worker",
  action = "sign_in", // "sign_in" or "sign_out"
  existingRecordId = null, // Required for sign_out
  schoolId = null,
  recordedBy = null,
  onSuccess,
  onCancel,
  requireMatch = true,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const matcherRef = useRef(null);
  const detectingRef = useRef(false);
  const consumedRef = useRef(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const [status, setStatus] = useState("Preparing camera…");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matchDistance, setMatchDistance] = useState(null);
  const [writingRecord, setWritingRecord] = useState(false);

  const log = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [Biometrics] ${msg}`);
  };

  /* =========================
     INIT
  ========================= */

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        log(`Init started for ${entityType} ${profile.id}, action=${action}`);

        /* CAMERA - Request immediately */
        setStatus("Requesting camera permission…");
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        
        log("✓ Camera stream active");
        setLoading(false);
        
        // Start timer
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
          setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 100) / 10);
        }, 250);

        /* MODELS */
        setStatus("Loading face engine…");
        if (!sessionModelsLoaded) {
          const ok = await loadFaceApiModels({
            variant: "tiny",
            modelsUrl: "/models",
            requireWifi: false,
          });
          if (!ok?.success) throw new Error("Face models unavailable");
          sessionModelsLoaded = true;
          log("✓ Models loaded");
        } else {
          log("✓ Using cached models");
        }

        const faceapi = await getFaceApi();

        /* DESCRIPTORS */
        setStatus("Preparing face data…");
        const cached = await getDescriptor(profile.id);
        let descriptors = cached ? toFloat32(cached) : [];

        if (!descriptors.length) {
          log("Downloading reference images...");
          const images = await downloadReferenceImages(profile, entityType);
          if (!images.length) throw new Error("No reference images available");
          
          log(`Extracting descriptors from ${images.length} images...`);
          for (const blob of images) {
            const img = await blobToImage(blob, faceapi);
            const det = await faceapi
              .detectSingleFace(
                img,
                new faceapi.TinyFaceDetectorOptions({
                  inputSize: INPUT_SIZE,
                  scoreThreshold: SCORE_THRESHOLD,
                })
              )
              .withFaceLandmarks()
              .withFaceDescriptor();
            if (det?.descriptor) descriptors.push(det.descriptor);
          }

          if (!descriptors.length) throw new Error("Reference photos unreadable");
          
          // Cache for future use
          setDescriptor(profile.id, toPlain(descriptors)).catch(() => {});
          log(`✓ Extracted ${descriptors.length} descriptors`);
        } else {
          log(`✓ Using ${descriptors.length} cached descriptors`);
        }

        matcherRef.current = new faceapi.FaceMatcher(
          [new faceapi.LabeledFaceDescriptors(String(profile.id), descriptors)],
          MATCH_THRESHOLD
        );

        setStatus("Look straight at the camera");
        log("✓ Ready for facial recognition");
      } catch (e) {
        log(`❌ Init error: ${e.message}`);
        setError(e.message || "Initialization failed");
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [profile.id, entityType, action]);

  /* =========================
     DETECTION LOOP
  ========================= */

  const detect = useCallback(async () => {
    if (loading || error || consumedRef.current || detectingRef.current || !matcherRef.current) return;

    detectingRef.current = true;
    const faceapi = await getFaceApi();

    try {
      const det = await faceapi
        .detectSingleFace(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: INPUT_SIZE,
            scoreThreshold: SCORE_THRESHOLD,
          })
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det?.descriptor) return;

      const match = matcherRef.current.findBestMatch(det.descriptor);

      if (match.label !== "unknown" && match.distance <= MATCH_THRESHOLD) {
        consumedRef.current = true;
        setMatchDistance(match.distance);
        setStatus("Match confirmed - Writing record...");
        log(`✓ Face matched: distance=${match.distance.toFixed(4)}`);
        
        // Stop timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // Stop camera
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        // Write attendance record
        setWritingRecord(true);
        const record = await writeAttendanceRecord({
          entityType,
          entityId: profile.id,
          action,
          schoolId,
          recordedBy,
          existingRecordId,
        });

        setWritingRecord(false);

        if (record) {
          log(`✓ Attendance record written: ${action}`);
          setStatus("Record saved!");
          
          onSuccess?.({
            profileId: profile.id,
            workerId: profile.worker_id || null,
            studentId: entityType === "student" ? profile.id : null,
            matchDistance: match.distance,
            record,
            action,
          });
        } else {
          log(`⚠️ Failed to write attendance record`);
          setError("Failed to save attendance record");
        }
      }
    } catch (e) {
      log(`❌ Detection error: ${e.message}`);
      setError("Face detection failed");
    } finally {
      detectingRef.current = false;
    }
  }, [loading, error, onSuccess, profile, entityType, action, schoolId, recordedBy, existingRecordId]);

  useEffect(() => {
    if (loading || error || writingRecord) return;
    const id = setInterval(detect, DETECT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [detect, loading, error, writingRecord]);

  /* =========================
     UI
  ========================= */

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, zIndex: 9999 }}>
      <div style={{ width: "92vw", maxWidth: 520, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}>
        <header style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            {action === "sign_in" ? "Sign In" : "Sign Out"} - {entityType === "worker" ? "Worker" : "Student"}
          </h3>
          <p style={{ margin: "8px 0 4px", color: "#6b7280" }}>{status}</p>
          {!loading && elapsedTime >= 0.1 && !writingRecord && (
            <p style={{ margin: "4px 0", color: "#6b7280", fontSize: "0.85rem", fontFamily: "monospace" }}>
              ⏱️ {elapsedTime.toFixed(1)}s
            </p>
          )}
          {matchDistance && (
            <small style={{ color: "#10b981", fontSize: "0.85rem" }}>
              ✓ Match score: {matchDistance.toFixed(3)}
            </small>
          )}
          {error && <p style={{ margin: "4px 0", color: "#dc2626", fontSize: "0.9rem" }}>{error}</p>}
          {writingRecord && <p style={{ margin: "4px 0", color: "#3b82f6" }}>💾 Saving...</p>}
        </header>

        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0f172a", minHeight: 260 }}>
          <video
            ref={videoRef}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              background: "#0f172a",
              transform: "translateZ(0)",
              backfaceVisibility: "hidden",
            }}
            playsInline
            muted
          />
          {loading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: "rgba(0,0,0,0.5)" }}>
              Loading...
            </div>
          )}
        </div>

        <canvas ref={canvasRef} style={{ display: "none" }} />

        <footer style={{ marginTop: 16, display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 500,
            }}
            disabled={writingRecord}
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}
