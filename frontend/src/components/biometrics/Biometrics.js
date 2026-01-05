import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api/client";
import { loadFaceApiModels } from "../../utils/FaceApiLoader";
import { getFaceApi } from "../../utils/faceApiShim";
import { cacheImage } from "../../utils/imageCache";
import { getDescriptor, setDescriptor } from "../../utils/descriptorDB";

/* =========================
   CONFIG
========================= */

const MATCH_THRESHOLD = 0.65;
const INPUT_SIZE = 192;
const SCORE_THRESHOLD = 0.45;
const DETECT_INTERVAL_MS = 500;

let sessionModelsLoaded = false;

/* =========================
   HELPERS
========================= */

const toFloat32 = (arr) =>
  arr.map((d) => (d instanceof Float32Array ? d : new Float32Array(d)));

const toPlain = (arr) => arr.map((d) => Array.from(d));

function createBiometricProof({ profile, entityType, matchDistance }) {
  return {
    entity_id: profile.id,
    entity_type: entityType,
    verified_at: new Date().toISOString(),
    session_id: crypto.randomUUID(),
    nonce: crypto.randomUUID(),
    match_distance: matchDistance,
    device_id: localStorage.getItem("kiosk_id") || "unknown-device",
  };
}

async function blobToImage(blob, faceapi) {
  return await faceapi.bufferToImage(blob);
}

async function downloadReferenceImages(profile, entityType) {
  const faceId = profile.id;
  const results = [];

  const tryBucket = async (bucket, path) => {
    const { data: files } = await api.storage.from(bucket).list(path);
    for (const f of files || []) {
      if (!/\.(jpg|jpeg|png|webp)$/i.test(f.name)) continue;
      const fullPath = `${path}/${f.name}`;
      try {
        const { data: blob } = await api.storage.from(bucket).download(fullPath);
        if (blob) {
          results.push(blob);
          await cacheImage(bucket, fullPath, blob, faceId);
        }
      } catch {}
    }
  };

  if (entityType === "worker" && profile.worker_id) {
    await tryBucket("worker-uploads", `workers/${profile.worker_id}/profile-picture`);
  }

  if (entityType === "student") {
    await tryBucket("student-uploads", `students/${faceId}/profile-picture`);
  }

  if (!results.length) {
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      try {
        const { data: blob } = await api.storage
          .from("profile-avatars")
          .download(`${faceId}.${ext}`);
        if (blob) {
          results.push(blob);
          break;
        }
      } catch {}
    }
  }

  return results;
}

/* =========================
   COMPONENT
========================= */

export default function Biometrics({
  profile,
  entityType = "worker",
  onSuccess,
  onCancel,
  onSkip,
  requireMatch = true,
  actions = null,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const matcherRef = useRef(null);
  const detectingRef = useRef(false);
  const consumedRef = useRef(false);

  const [status, setStatus] = useState("Preparing camera…");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matchDistance, setMatchDistance] = useState(null);

  /* =========================
     INIT
  ========================= */

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        /* CAMERA */
        setStatus("Requesting camera permission…");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", frameRate: { ideal: 15 } },
          audio: false,
        });

        if (cancelled) return;
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        /* MODELS */
        setStatus("Loading face engine…");
        if (!sessionModelsLoaded) {
          const ok = await loadFaceApiModels({
            variant: "tiny",
            modelsUrl: "/models",
          });
          if (!ok?.success) throw new Error("Face models unavailable");
          sessionModelsLoaded = true;
        }

        const faceapi = await getFaceApi();

        /* DESCRIPTORS */
        setStatus("Preparing face data…");
        const cached = await getDescriptor(profile.id);
        let descriptors = cached ? toFloat32(cached) : [];

        if (!descriptors.length) {
          const images = await downloadReferenceImages(profile, entityType);
          if (!images.length) throw new Error("No reference images available");

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
          setDescriptor(profile.id, toPlain(descriptors)).catch(() => {});
        }

        matcherRef.current = new faceapi.FaceMatcher(
          [
            new faceapi.LabeledFaceDescriptors(
              String(profile.id),
              descriptors
            ),
          ],
          MATCH_THRESHOLD
        );

        setLoading(false);
        setStatus("Look straight at the camera");
      } catch (e) {
        setError(e.message || "Initialization failed");
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [profile, entityType]);

  /* =========================
     DETECTION LOOP
  ========================= */

  const detect = useCallback(async () => {
    if (
      loading ||
      error ||
      consumedRef.current ||
      detectingRef.current ||
      !matcherRef.current
    )
      return;

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
        setStatus("Match confirmed");

        streamRef.current?.getTracks().forEach((t) => t.stop());

        const proof = createBiometricProof({
          profile,
          entityType,
          matchDistance: match.distance,
        });

        onSuccess?.({
          profileId: profile.id,
          workerId: profile.worker_id || null,
          biometricProof: proof,
        });
      }
    } catch {
      setError("Face detection failed");
    } finally {
      detectingRef.current = false;
    }
  }, [loading, error, onSuccess, profile, entityType]);

  useEffect(() => {
    if (loading || error) return;
    const id = setInterval(detect, DETECT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [detect, loading, error]);

  /* =========================
     UI
  ========================= */

  return (
    <div className="biometric-overlay">
      <div className="biometric-modal">
        <header>
          <h3>Verify your face</h3>
          <p>{status}</p>
          {matchDistance && (
            <small>Match score: {matchDistance.toFixed(3)}</small>
          )}
          {error && <p className="error">{error}</p>}
        </header>

        <video ref={videoRef} muted playsInline />

        <footer>
          {actions}
          <button onClick={onCancel}>Cancel</button>
          {!requireMatch && <button onClick={onSkip}>Skip</button>}
        </footer>
      </div>
    </div>
  );
}
