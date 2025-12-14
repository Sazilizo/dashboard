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
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

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

  // Debug logging helper
  const log = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [WorkerBiometrics] ${msg}`);
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
    let cleanupDone = false;

    async function init() {
      log(`Init started for profile.id=${profile.id}`);
      
      try {
        // CRITICAL OPTIMIZATION: Request camera FIRST, do other stuff in background
        // This gets the permission prompt shown immediately
        log(`Requesting camera stream...`);
        setStatus("Requesting camera...");
        
        const cameraPromise = navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        }).catch(err => {
          log(`❌ Camera request failed: ${err.message}`);
          throw err;
        });

        // Start parallel descriptor loading (don't block on it)
        const descriptorLoadPromise = getDescriptor(profile.id).catch(() => null);

        // Now get the camera stream - this is what shows up first
        let stream;
        try {
          stream = await cameraPromise;
        } catch (camErr) {
          log(`❌ Camera unavailable`);
          setError("Camera not available. Plug in a webcam or allow access.");
          setLoading(false);
          return;
        }

        if (cancelled) {
          stream?.getTracks().forEach(t => t.stop());
          return;
        }

        // Got camera stream! Show it immediately
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        
        log(`✓ Camera stream active`);
        setStatus("Loading face data...");
        setLoading(false); // <-- Hide loading screen NOW that camera is streaming
        
        // Start timer
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
          setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 100) / 10);
        }, 100);

        // NOW load descriptors/models in background while user sees live video
        const cachedDescriptors = await descriptorLoadPromise;
        if (cancelled) return;

        if (cachedDescriptors && cachedDescriptors.length > 0) {
          log(`✓ Loaded cached descriptors (count=${cachedDescriptors.length})`);
          const faceapi = await getFaceApi();
          const float32Descriptors = convertToFloat32Arrays(cachedDescriptors);
          matcherRef.current = new faceapi.FaceMatcher(
            [new faceapi.LabeledFaceDescriptors(String(profile.id), float32Descriptors)],
            MATCH_THRESHOLD
          );
          setStatus("Look straight at the camera");
          log(`✓ Ready for facial recognition`);
          return;
        }

        // No cached descriptors - load models and build them
        log(`No cached descriptors, loading models...`);
        setStatus("Loading face models...");
        
        if (!sessionModelsLoaded) {
          const models = await loadFaceApiModels({ variant: "tiny", requireWifi: false, modelsUrl: "/models" });
          if (!models?.success) {
            const reason = models?.reason === "consent_required"
              ? "Enable biometric consent to proceed."
              : "Face models unavailable. Please connect and retry.";
            log(`❌ Model loading failed: ${models?.reason}`);
            setError(reason);
            return;
          }
          sessionModelsLoaded = true;
          sessionFaceApi = await getFaceApi();
          log(`✓ Models loaded`);
        } else {
          log(`✓ Using session-cached models`);
        }

        if (cancelled) return;

        // Now download reference images and extract descriptors
        log(`Downloading reference images...`);
        setStatus("Processing reference photos...");
        const { imageBlobs } = await downloadImagesForProfile(profile);

        if (cancelled) return;

        if (!imageBlobs || imageBlobs.length === 0) {
          log(`⚠️ No reference images found`);
          setError("No reference photos available. Upload a profile photo first.");
          return;
        }

        log(`Extracting descriptors from ${imageBlobs.length} photos...`);
        setStatus("Extracting face data...");
        const faceapi = await getFaceApi();
        const descriptors = [];

        for (const entry of imageBlobs) {
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
              log(`✓ Extracted descriptor`);
            }
          } catch (e) {
            log(`⚠️ Failed to extract descriptor: ${e.message}`);
          }
        }

        if (cancelled) return;

        if (!descriptors.length) {
          log(`❌ No valid descriptors extracted`);
          setError("Reference photo is unreadable. Try another device/photo.");
          return;
        }

        // Cache descriptors
        const plainArrays = convertToPlainArrays(descriptors);
        setDescriptor(profile.id, plainArrays).catch((e) => {
          log(`⚠️ Failed to cache descriptors: ${e.message}`);
        });

        log(`✓ Built ${descriptors.length} descriptors`);
        matcherRef.current = new faceapi.FaceMatcher(
          [new faceapi.LabeledFaceDescriptors(String(profile.id), descriptors)],
          MATCH_THRESHOLD
        );
        
        setStatus("Look straight at the camera");
        log(`✓ Ready for facial recognition`);

      } catch (err) {
        log(`❌ Init error: ${err.message}`);
        console.error(err);
        if (!cancelled) {
          setError(err.message || "Initialization failed");
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
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
        // Stop timer on success
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
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
  const capturePhoto = useCallback(() => {
    log(`📸 Capture button clicked`);
    
    if (!videoRef.current || !canvasRef.current) {
      log(`❌ Missing video or canvas ref`);
      setError('Camera not initialized. Please wait and try again.');
      return;
    }

    // Check if video has valid dimensions
    const { videoWidth, videoHeight } = videoRef.current;
    if (!videoWidth || !videoHeight) {
      log(`❌ Video dimensions invalid: ${videoWidth}x${videoHeight}`);
      setError('Video not ready. Please try again.');
      return;
    }

    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      log(`Drawing video to canvas: ${videoWidth}x${videoHeight}`);
      
      // Set canvas dimensions to match video
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        log(`❌ Failed to get canvas context`);
        setError('Canvas error. Please try again.');
        return;
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to data URL immediately (more reliable than toBlob)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      if (!dataUrl) {
        log(`❌ Failed to generate data URL`);
        setError('Failed to capture. Please try again.');
        return;
      }
      
      log(`✓ Photo captured and converted to data URL`);
      setCapturedPhoto(dataUrl);
      
      // Stop timer when photo is captured
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Stop camera stream to save resources
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          log(`Stopped track: ${track.kind}`);
        });
      }
      
      log(`✓ Capture complete`);
    } catch (e) {
      log(`❌ Capture failed: ${e.message}`);
      console.error(`[WorkerBiometrics] Capture error:`, e);
      setError(`Failed to capture photo: ${e.message}`);
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
  const handleRetake = useCallback(async () => {
    console.log(`[WorkerBiometrics] Retake requested by user (profile.id=${profile.id})`);
    setCapturedPhoto(null);
    setError("");
    setStatus("Starting camera...");
    setElapsedTime(0);
    
    // Restart camera
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
      setStatus("Look straight at the camera");
      
      // Restart timer
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime((Date.now() - startTimeRef.current) / 1000);
      }, 100);
    } catch (err) {
      console.error(`[WorkerBiometrics] Failed to restart camera:`, err);
      setError("Camera not available");
    }
  }, [profile.id]);

  return (
    <div className="biometric-modal-overlay" style={overlayStyle}>
      <div className="biometric-modal" style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>Verify your face</h3>
            <p style={{ margin: "4px 0", color: "#4b5563" }}>{status}</p>
            {!capturedPhoto && elapsedTime >= 0.1 && (
              <p style={{ margin: "4px 0", color: "#6b7280", fontSize: "0.85rem", fontFamily: "monospace" }}>
                ⏱️ {elapsedTime.toFixed(1)}s
              </p>
            )}
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
