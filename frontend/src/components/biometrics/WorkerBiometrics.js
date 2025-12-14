import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api/client";
import { loadFaceApiModels } from "../../utils/FaceApiLoader";
import { getFaceApi } from "../../utils/faceApiShim";
import {
  cacheImage,
  getCachedImagesByEntity,
} from "../../utils/imageCache";
import { getDescriptor, setDescriptor } from "../../utils/descriptorDB";

const MATCH_THRESHOLD = 0.65;
const INPUT_SIZE = 192;
const SCORE_THRESHOLD = 0.45;

// Session-level model cache (persists across component mounts)
let sessionFaceApi = null;
let sessionModelsLoaded = false;

// Track distances for debugging
let distanceHistory = [];

// Cache for parallel photo downloads with timeout
const downloadWithTimeout = (promise, timeoutMs = 3000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Download timeout")), timeoutMs)
    ),
  ]);
};

// Helper: Convert cached array descriptors back to Float32Array (required by Face-API)
const convertToFloat32Arrays = (descriptors) => {
  if (!descriptors || !Array.isArray(descriptors)) return [];
  return descriptors.map(desc => {
    if (desc instanceof Float32Array) return desc;
    if (Array.isArray(desc)) return new Float32Array(desc);
    return new Float32Array(Object.values(desc));
  });
};

// Helper: Convert Float32Array descriptors to plain arrays for storage
const convertToPlainArrays = (descriptors) => {
  if (!descriptors || !Array.isArray(descriptors)) return [];
  return descriptors.map(desc => {
    if (desc instanceof Float32Array) return Array.from(desc);
    if (Array.isArray(desc)) return desc;
    return Array.from(Object.values(desc));
  });
};

function useRafLoop(callback, enabled) {
  const rafRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const tick = () => {
      callback();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [callback, enabled]);
}

async function blobToImage(blob, faceapi) {
  const img = await faceapi.bufferToImage(blob);
  return img;
}

async function downloadImagesForProfile(profile) {
  const blobs = [];

  const workerId = profile?.worker_id;
  const downloadPromises = [];

  // Worker uploads
  if (workerId) {
    const workerPath = `workers/${workerId}/profile-picture`;
    downloadPromises.push(
      downloadWithTimeout(
        (async () => {
          try {
            const { data: workerFiles } = await api.storage
              .from("worker-uploads")
              .list(workerPath);

            const imageFiles = (workerFiles || []).filter((f) =>
              /\.(jpg|jpeg|png|webp)$/i.test(f.name)
            );

            for (const file of imageFiles) {
              const fullPath = `${workerPath}/${file.name}`;
              try {
                const { data: blob } = await api.storage
                  .from("worker-uploads")
                  .download(fullPath);
                if (blob) {
                  blobs.push({ blob, bucket: "worker-uploads", path: fullPath });
                  await cacheImage("worker-uploads", fullPath, blob, profile.id, {
                    source: "worker-uploads",
                    workerId,
                  });
                }
              } catch (e) {
                console.warn(`[WorkerBiometrics] Failed to download ${file.name}:`, e);
              }
            }
          } catch (e) {
            console.warn(`[WorkerBiometrics] Worker uploads unavailable`, e);
          }
        })(),
        2000
      )
    );
  }

  // Profile avatars (parallel download with timeout)
  downloadPromises.push(
    downloadWithTimeout(
      (async () => {
        try {
          const { data: avatarFiles } = await api.storage
            .from("profile-avatars")
            .list("");
          const imageFiles = (avatarFiles || []).filter((f) =>
            /\.(jpg|jpeg|png|webp)$/i.test(f.name)
          );
          const matches = imageFiles.filter((f) => {
            const name = f.name.replace(/\.(jpg|jpeg|png|webp)$/i, "");
            return name === String(profile.id);
          });

          for (const file of matches) {
            try {
              const { data: blob } = await api.storage
                .from("profile-avatars")
                .download(file.name);
              if (blob) {
                blobs.push({ blob, bucket: "profile-avatars", path: file.name });
                await cacheImage("profile-avatars", file.name, blob, profile.id, {
                  source: "profile-avatars",
                });
              }
            } catch (e) {
              console.warn(`[WorkerBiometrics] Failed to download avatar:`, e);
            }
          }
        } catch (e) {
          console.warn(`[WorkerBiometrics] Profile avatars unavailable`, e);
        }
      })(),
      2000
    )
  );

  // Wait for all downloads with individual timeout handling
  await Promise.allSettled(downloadPromises);

  return blobs;
}

export default function WorkerBiometrics({
  profile,
  onSuccess,
  onCancel,
  onSkip,
  requireMatch = true,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const matcherRef = useRef(null);
  const detectingRef = useRef(false);
  const [status, setStatus] = useState("Preparing camera...");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matchDistance, setMatchDistance] = useState(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const overlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    zIndex: 9998,
  };

  const modalStyle = {
    width: "92vw",
    maxWidth: 520,
    background: "#fff",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setError("");
      setLoading(true);
      setStatus("Preparing camera...");
      console.log(`[WorkerBiometrics] Init started for profile.id=${profile.id}, worker_id=${profile.worker_id}`);

      // Fast path: Try to load cached descriptors first (skip model load and image processing)
      const cachedDescriptors = await getDescriptor(profile.id);
      if (cachedDescriptors && cachedDescriptors.length > 0) {
        console.log(`[WorkerBiometrics] ⚡ Using cached descriptors for profile.id=${profile.id} (count=${cachedDescriptors.length})`);
        const faceapi = await getFaceApi();
        // Convert cached arrays back to Float32Array for Face-API
        const float32Descriptors = convertToFloat32Arrays(cachedDescriptors);
        matcherRef.current = new faceapi.FaceMatcher(
          [new faceapi.LabeledFaceDescriptors(String(profile.id), float32Descriptors)],
          MATCH_THRESHOLD
        );

        if (cancelled) return;

        setStatus("Starting camera...");
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          console.log(`[WorkerBiometrics] ⚡ Camera started (cached descriptors) for profile.id=${profile.id}`);
          setStatus("Look straight at the camera");
          setLoading(false);
        } catch (camErr) {
          console.error(`[WorkerBiometrics] Camera access failed for profile.id=${profile.id}:`, camErr);
          setError("Camera not available. Plug in a webcam or allow access.");
          setLoading(false);
        }
        return;
      }

      // Slow path: Load models (reuse session cache if available)
      setStatus("Loading models...");
      if (!sessionModelsLoaded) {
        const models = await loadFaceApiModels({ variant: "tiny", requireWifi: false, modelsUrl: "/models" });
        if (!models?.success) {
          const reason = models?.reason === "consent_required"
            ? "Enable biometric consent to proceed."
            : "Face models unavailable. Please connect and retry.";
          console.warn(`[WorkerBiometrics] Model loading failed: ${models?.reason}`, models);
          setError(reason);
          setLoading(false);
          return;
        }
        sessionModelsLoaded = true;
        sessionFaceApi = await getFaceApi();
        console.log(`[WorkerBiometrics] Models loaded and cached for session`);
      } else {
        console.log(`[WorkerBiometrics] Reusing session-cached models`);
      }

      if (cancelled) return;

      const faceapi = sessionFaceApi;

      // Collect images (cached first, then download if available)
      setStatus("Loading reference photos...");
      let cached = [];
      try {
        cached = await getCachedImagesByEntity(profile.id);
        console.log(`[WorkerBiometrics] Cached images found: ${cached?.length || 0} for profile.id=${profile.id}`);
      } catch (e) {
        console.warn(`[WorkerBiometrics] Failed to fetch cached images for profile.id=${profile.id}:`, e);
        cached = [];
      }

      let blobs = [];
      if (cached?.length) {
        blobs = cached.map((c) => ({ blob: c.blob, bucket: c.bucket, path: c.path }));
      } else {
        blobs = await downloadImagesForProfile(profile);
        console.log(`[WorkerBiometrics] Downloaded ${blobs?.length || 0} images for profile.id=${profile.id}`);
      }

      if (!blobs.length) {
        console.error(`[WorkerBiometrics] No reference photos found for profile.id=${profile.id}`);
        setError("No reference photo found for this account.");
        setLoading(false);
        return;
      }

      if (cancelled) return;

      setStatus("Building face signatures...");
      const descriptors = [];

      for (const entry of blobs) {
        try {
          const img = await blobToImage(entry.blob, faceapi);
          const det = await faceapi
            .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({
              inputSize: INPUT_SIZE,
              scoreThreshold: SCORE_THRESHOLD,
            }))
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (det?.descriptor) {
            descriptors.push(det.descriptor);
            console.log(`[WorkerBiometrics] Descriptor extracted from reference photo (profile.id=${profile.id})`);
          }
        } catch (e) {
          console.warn(`[WorkerBiometrics] Failed to extract descriptor from reference photo:`, e);
        }
      }

      if (!descriptors.length) {
        console.error(`[WorkerBiometrics] No valid descriptors extracted for profile.id=${profile.id}`);
        setError("Reference photo is unreadable. Try another device/photo.");
        setLoading(false);
        return;
      }

      // Cache descriptors for future use (async, fire and forget)
      // Convert Float32Array to plain arrays for storage
      const plainArrays = convertToPlainArrays(descriptors);
      setDescriptor(profile.id, plainArrays).catch((e) => {
        console.warn(`[WorkerBiometrics] Failed to cache descriptors for profile.id=${profile.id}:`, e);
      });

      console.log(`[WorkerBiometrics] Built ${descriptors.length} face descriptors for profile.id=${profile.id}, match_threshold=${MATCH_THRESHOLD}`);
      matcherRef.current = new faceapi.FaceMatcher(
        [new faceapi.LabeledFaceDescriptors(String(profile.id), descriptors)],
        MATCH_THRESHOLD
      );

      if (cancelled) return;

      setStatus("Starting camera...");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        console.log(`[WorkerBiometrics] Camera started successfully for profile.id=${profile.id}`);
        setStatus("Look straight at the camera");
        setLoading(false);
      } catch (camErr) {
        console.error(`[WorkerBiometrics] Camera access failed for profile.id=${profile.id}:`, camErr);
        setError("Camera not available. Plug in a webcam or allow access.");
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [profile]);

  const detectFace = useCallback(async () => {
    // Early exit conditions: skip all checks if not ready
    if (!matcherRef.current || !videoRef.current || loading || error) return;
    if (detectingRef.current) return; // Prevent parallel detections

    const faceapi = await getFaceApi();
    detectingRef.current = true;

    try {
      const det = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({
          inputSize: INPUT_SIZE,
          scoreThreshold: SCORE_THRESHOLD,
        }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det?.descriptor) return; // No face detected, skip processing

      const best = matcherRef.current.findBestMatch(det.descriptor);
      distanceHistory.push(best.distance);
      // Keep last 50 distances for analysis
      if (distanceHistory.length > 50) distanceHistory.shift();
      
      const avgDistance = distanceHistory.reduce((a, b) => a + b, 0) / distanceHistory.length;
      const minDistance = Math.min(...distanceHistory);
      const maxDistance = Math.max(...distanceHistory);
      
      console.log(`[WorkerBiometrics] Face detected: label=${best.label}, distance=${best.distance.toFixed(4)}, threshold=${MATCH_THRESHOLD}, profile.id=${profile.id} | Stats: avg=${avgDistance.toFixed(4)}, min=${minDistance.toFixed(4)}, max=${maxDistance.toFixed(4)}, attempts=${distanceHistory.length}`);
      
      if (best.label !== "unknown" && best.distance <= MATCH_THRESHOLD) {
        console.log(`[WorkerBiometrics] ✓ MATCH CONFIRMED: profile.id=${profile.id}, worker_id=${profile.worker_id}, distance=${best.distance.toFixed(4)}`);
        distanceHistory = []; // Reset on success
        setMatchDistance(best.distance);
        setStatus("Match confirmed");
        matcherRef.current = null;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
        onSuccess?.({
          profileId: profile.id,
          workerId: profile.worker_id || null,
          matchDistance: best.distance,
        });
      } else {
        const newAttempts = failedAttempts + 1;
        console.log(`[WorkerBiometrics] Face detected but not recognized: distance=${best.distance.toFixed(4)}, threshold=${MATCH_THRESHOLD}, attempt=${newAttempts}, profile.id=${profile.id}`);
        setFailedAttempts(newAttempts);
        setStatus(`Face detected but not recognized (attempt ${newAttempts}). Try again.`);
      }
    } catch (e) {
      console.error(`[WorkerBiometrics] Detection error for profile.id=${profile.id}:`, e);
      setError("Detection failed. Please retry.");
    } finally {
      detectingRef.current = false;
    }
  }, [error, loading, onSuccess, profile.id, profile.worker_id, failedAttempts]);

  useRafLoop(detectFace, !loading && !error && !!matcherRef.current);

  // Capture a photo from the video stream
  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      const ctx = canvasRef.current.getContext("2d");
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);
      
      // Convert canvas to blob and create data URL for preview
      canvasRef.current.toBlob((blob) => {
        const dataUrl = URL.createObjectURL(blob);
        setCapturedPhoto(dataUrl);
        console.log(`[WorkerBiometrics] Photo captured: ${canvasRef.current.width}x${canvasRef.current.height}`);
      });
    } catch (e) {
      console.error(`[WorkerBiometrics] Failed to capture photo:`, e);
    }
  }, []);

  // Process the captured photo for recognition in the background
  const processPhotoAsync = useCallback(async () => {
    if (!capturedPhoto || !canvasRef.current || !matcherRef.current) return;

    setIsProcessing(true);
    setStatus("Analyzing photo...");

    try {
      const faceapi = await getFaceApi();
      
      // Create image from canvas
      const img = new Image();
      img.onload = async () => {
        try {
          const det = await faceapi
            .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({
              inputSize: INPUT_SIZE,
              scoreThreshold: SCORE_THRESHOLD,
            }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (!det?.descriptor) {
            setStatus("No face detected in photo. Please try again.");
            setError("No face found");
            setIsProcessing(false);
            return;
          }

          const best = matcherRef.current.findBestMatch(det.descriptor);
          distanceHistory.push(best.distance);
          if (distanceHistory.length > 50) distanceHistory.shift();

          console.log(`[WorkerBiometrics] Photo processed: distance=${best.distance.toFixed(4)}, profile.id=${profile.id}`);

          if (best.label !== "unknown" && best.distance <= MATCH_THRESHOLD) {
            console.log(`[WorkerBiometrics] ✓ MATCH CONFIRMED from captured photo: profile.id=${profile.id}, distance=${best.distance.toFixed(4)}`);
            distanceHistory = [];
            setMatchDistance(best.distance);
            setStatus("✓ Match confirmed!");
            matcherRef.current = null;
            
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((t) => t.stop());
            }

            setTimeout(() => {
              onSuccess?.({
                profileId: profile.id,
                workerId: profile.worker_id || null,
                matchDistance: best.distance,
              });
            }, 1000);
          } else {
            const newAttempts = failedAttempts + 1;
            console.log(`[WorkerBiometrics] Photo not recognized: distance=${best.distance.toFixed(4)}, attempt=${newAttempts}`);
            setFailedAttempts(newAttempts);
            setStatus(`Not recognized (attempt ${newAttempts}). Retry?`);
            setError("");
            setIsProcessing(false);
          }
        } catch (e) {
          console.error(`[WorkerBiometrics] Error processing photo:`, e);
          setStatus("Analysis failed. Please try again.");
          setError("Processing error");
          setIsProcessing(false);
        }
      };
      img.src = capturedPhoto;
    } catch (e) {
      console.error(`[WorkerBiometrics] Failed to process photo:`, e);
      setError("Processing failed");
      setIsProcessing(false);
    }
  }, [capturedPhoto, failedAttempts, onSuccess, profile.id, profile.worker_id]);

  // Auto-process photo when captured
  useEffect(() => {
    if (capturedPhoto && !isProcessing) {
      processPhotoAsync();
    }
  }, [capturedPhoto, isProcessing, processPhotoAsync]);

  // Retake/retry button handler
  const handleRetake = useCallback(() => {
    console.log(`[WorkerBiometrics] Retake requested by user (profile.id=${profile.id})`);
    setCapturedPhoto(null);
    setError("");
    setStatus("Look straight at the camera");
  }, [profile.id]);

  return (
    <div className="biometric-modal-overlay" style={overlayStyle}>
      <div className="biometric-modal" style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>Verify your face</h3>
            <p style={{ margin: "4px 0", color: "#4b5563" }}>{status}</p>
            {isProcessing && (
              <p style={{ margin: "4px 0", color: "#3b82f6", fontSize: "0.9rem" }}>⏳ Analyzing...</p>
            )}
            {matchDistance && (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#16a34a" }}>
                Match score: {matchDistance.toFixed(3)}
              </p>
            )}
            {error && !capturedPhoto && (
              <p style={{ margin: "4px 0", color: "#dc2626", fontSize: "0.9rem" }}>{error}</p>
            )}
            {failedAttempts > 5 && !error && (
              <p style={{ margin: "8px 0", padding: "8px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 4, fontSize: "0.85rem", color: "#92400e" }}>
                💡 If you continue to see "not recognized", the threshold may be too strict. Check browser console for distance stats. Current threshold: {MATCH_THRESHOLD}. Try lower lighting, closer range, or a different angle.
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            {!requireMatch && (
              <button className="btn btn-tertiary" onClick={() => onSkip?.()}>Skip</button>
            )}
            {capturedPhoto && !isProcessing && (error || failedAttempts > 0) && (
              <button className="btn btn-primary" onClick={handleRetake} style={{ background: "#f59e0b" }}>
                🔄 Retake
              </button>
            )}
          </div>
        </div>

        {/* Camera/Photo Display Area */}
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0f172a", minHeight: 260 }}>
          {!capturedPhoto ? (
            <>
              <video
                ref={videoRef}
                style={{ width: "100%", height: "100%", objectFit: "cover", background: "#0f172a" }}
                playsInline
                muted
              />
              {loading && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: "rgba(0,0,0,0.35)" }}>
                  Loading...
                </div>
              )}
              {error && !loading && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#fff", background: "rgba(15,23,42,0.82)" }}>
                  <span>{error}</span>
                  {onSkip && !requireMatch && (
                    <button className="btn btn-primary" onClick={() => onSkip?.()}>Continue without camera</button>
                  )}
                </div>
              )}
              {/* Capture Button */}
              {!loading && !error && matcherRef.current && (
                <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)" }}>
                  <button
                    onClick={capturePhoto}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      border: "3px solid #fff",
                      background: "rgba(255, 255, 255, 0.2)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "24px",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = "rgba(255, 255, 255, 0.4)";
                      e.target.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = "rgba(255, 255, 255, 0.2)";
                      e.target.style.transform = "scale(1)";
                    }}
                    title="Capture photo"
                  >
                    📷
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Show Captured Photo */}
              <img
                src={capturedPhoto}
                alt="Captured"
                style={{ width: "100%", height: "100%", objectFit: "cover", background: "#0f172a" }}
              />
              {isProcessing && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.6)" }}>
                  <div style={{ textAlign: "center", color: "#fff" }}>
                    <div style={{ fontSize: "32px", marginBottom: 8 }}>⏳</div>
                    <div>Analyzing...</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <canvas ref={canvasRef} style={{ display: "none" }} />

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", color: "#475569", fontSize: "0.9rem" }}>
          <span>Offline ready — uses cached models and photos when available.</span>
          <span>Keep your face centered and well-lit.</span>
        </div>
      </div>
    </div>
  );
}
