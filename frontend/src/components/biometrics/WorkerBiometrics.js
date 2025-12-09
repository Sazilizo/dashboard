import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api/client";
import { loadFaceApiModels } from "../../utils/FaceApiLoader";
import { getFaceApi } from "../../utils/faceApiShim";
import {
  cacheImage,
  getCachedImagesByEntity,
} from "../../utils/imageCache";

const MATCH_THRESHOLD = 0.52;
const INPUT_SIZE = 192;
const SCORE_THRESHOLD = 0.45;

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
  if (workerId) {
    const workerPath = `workers/${workerId}/profile-picture`;
    try {
      const { data: workerFiles } = await api.storage
        .from("worker-uploads")
        .list(workerPath);

      const imageFiles = (workerFiles || []).filter((f) =>
        /\.(jpg|jpeg|png|webp)$/i.test(f.name)
      );

      for (const file of imageFiles) {
        const fullPath = `${workerPath}/${file.name}`;
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
      }
    } catch (e) {
      /* offline or unavailable */
    }
  }

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
      const { data: blob } = await api.storage
        .from("profile-avatars")
        .download(file.name);
      if (blob) {
        blobs.push({ blob, bucket: "profile-avatars", path: file.name });
        await cacheImage("profile-avatars", file.name, blob, profile.id, {
          source: "profile-avatars",
        });
      }
    }
  } catch (e) {
    /* offline */
  }

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
  const streamRef = useRef(null);
  const matcherRef = useRef(null);
  const detectingRef = useRef(false);
  const [status, setStatus] = useState("Preparing camera...");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matchDistance, setMatchDistance] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setError("");
      setLoading(true);
      setStatus("Loading models...");

      const models = await loadFaceApiModels({ variant: "tiny", requireWifi: false });
      if (!models?.success) {
        const reason = models?.reason === "consent_required"
          ? "Enable biometric consent to proceed."
          : "Face models unavailable. Please connect and retry.";
        setError(reason);
        setLoading(false);
        return;
      }

      const faceapi = await getFaceApi();

      // collect images (cached first, then download if available)
      setStatus("Loading reference photos...");
      let cached = [];
      try {
        cached = await getCachedImagesByEntity(profile.id);
      } catch (e) {
        cached = [];
      }

      let blobs = [];
      if (cached?.length) {
        blobs = cached.map((c) => ({ blob: c.blob, bucket: c.bucket, path: c.path }));
      } else {
        blobs = await downloadImagesForProfile(profile);
      }

      if (!blobs.length) {
        setError("No reference photo found for this account.");
        setLoading(false);
        return;
      }

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
          }
        } catch (e) {
          /* ignore individual failures */
        }
      }

      if (!descriptors.length) {
        setError("Reference photo is unreadable. Try another device/photo.");
        setLoading(false);
        return;
      }

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
        setStatus("Look straight at the camera");
        setLoading(false);
      } catch (camErr) {
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
    if (!matcherRef.current || !videoRef.current || loading || error) return;
    if (detectingRef.current) return;
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

      if (!det?.descriptor) return;

      const best = matcherRef.current.findBestMatch(det.descriptor);
      if (best.label !== "unknown" && best.distance <= MATCH_THRESHOLD) {
        setMatchDistance(best.distance);
        setStatus("Match confirmed");
        matcherRef.current = null;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
        onSuccess?.({
          profileId: profile.id,
          workerId: profile.worker_id,
          matchDistance: best.distance,
        });
      } else {
        setStatus("Face detected but not recognized");
      }
    } catch (e) {
      setError("Detection failed. Please retry.");
    } finally {
      detectingRef.current = false;
    }
  }, [error, loading, onSuccess, profile.id, profile.worker_id]);

  useRafLoop(detectFace, !loading && !error && !!matcherRef.current);

  return (
    <div className="biometric-modal-overlay">
      <div className="biometric-modal" style={{ width: "92vw", maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>Verify your face</h3>
            <p style={{ margin: "4px 0", color: "#4b5563" }}>{status}</p>
            {matchDistance && (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#16a34a" }}>
                Match score: {matchDistance.toFixed(3)}
              </p>
            )}
            {error && (
              <p style={{ margin: "4px 0", color: "#dc2626", fontSize: "0.9rem" }}>{error}</p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            {!requireMatch && (
              <button className="btn btn-tertiary" onClick={() => onSkip?.()}>Skip</button>
            )}
          </div>
        </div>

        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0f172a", minHeight: 260 }}>
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
          {error && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#fff", background: "rgba(15,23,42,0.82)" }}>
              <span>{error}</span>
              {onSkip && !requireMatch && (
                <button className="btn btn-primary" onClick={() => onSkip?.()}>Continue without camera</button>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", color: "#475569", fontSize: "0.9rem" }}>
          <span>Offline ready — uses cached models and photos when available.</span>
          <span>Keep your face centered and well-lit.</span>
        </div>
      </div>
    </div>
  );
}
