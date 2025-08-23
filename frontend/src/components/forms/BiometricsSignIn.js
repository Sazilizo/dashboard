import React, { useState, useRef, useEffect } from "react";
import api from "../../api/client";
import * as faceapi from "face-api.js";

const BiometricsSignIn = ({ studentId, schoolId, bucketName, folderName }) => {
  const [loadingModels, setLoadingModels] = useState(true);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState("sign-in");
  const [retryCount, setRetryCount] = useState(0);
  const [referenceImageUrl, setReferenceImageUrl] = useState(null);

  const webcamRef = useRef();
  const canvasRef = useRef();
  const [uploadedFile, setUploadedFile] = useState(null);
  const [faceMatcher, setFaceMatcher] = useState(null);

  const threshold = 0.6;

  // Load face-api models
  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = "/models";
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ]);
      setLoadingModels(false);
    };
    loadModels();
  }, []);

  // Fetch student reference photo from Supabase
  useEffect(() => {
    if (!studentId) return;

    const fetchReferencePhoto = async () => {
      try {
        const { data: files } = await api.storage
          .from(bucketName)
          .list(`${folderName}/${studentId}`);

        if (!files || files.length === 0) {
          setMessage("No reference photo found for this student.");
          return;
        }

        const file = files[0]; // pick first file
        const { data: signedUrl } = await api.storage
          .from(bucketName)
          .createSignedUrl(`${folderName}/${studentId}/${file.name}`, 60);

        setReferenceImageUrl(signedUrl.signedUrl);
      } catch (err) {
        console.error(err);
        setMessage("Failed to load student reference photo.");
      }
    };

    fetchReferencePhoto();
  }, [studentId, bucketName, folderName]);

  // Create face matcher once reference photo is loaded
  useEffect(() => {
    if (!referenceImageUrl) return;

    const loadReferenceFace = async () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = referenceImageUrl;
      img.onload = async () => {
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!detection) {
          setMessage("Reference photo invalid or no face detected.");
          return;
        }

        setFaceMatcher(new faceapi.FaceMatcher(detection.descriptor, threshold));
        console.log("Reference face loaded:", detection);
      };
    };

    loadReferenceFace();
  }, [referenceImageUrl]);

  const handleCapture = async () => {
    if (!faceMatcher) {
      setMessage("Reference face not ready yet. Please wait.");
      return;
    }

    setMessage("Detecting face...");
    let img;

    // Handle uploaded file
    if (uploadedFile) {
      img = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const image = new Image();
          image.src = reader.result;
          image.onload = () => resolve(image);
          image.onerror = reject;
        };
        reader.onerror = reject;
        reader.readAsDataURL(uploadedFile);
      });
    } else {
      // Capture from webcam
      const video = webcamRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      img = await faceapi.fetchImage(canvas.toDataURL("image/jpeg"));
    }

    // Detect face
    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    console.log("Captured detection:", detection);

    if (!detection) {
      setMessage("No face detected. Please try again.");
      setRetryCount((c) => c + 1);
      return;
    }

    // Draw detection on canvas
    const canvas = canvasRef.current;
    canvas.style.display = "block";
    canvas.width = img.width;
    canvas.height = img.height;
    faceapi.matchDimensions(canvas, { width: canvas.width, height: canvas.height });
    const resized = faceapi.resizeResults(detection, { width: canvas.width, height: canvas.height });
    faceapi.draw.drawDetections(canvas, resized);
    faceapi.draw.drawFaceLandmarks(canvas, resized);

    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

    if (bestMatch.label === "unknown") {
      setMessage("Face does not match. Please try again.");
      setUploadedFile(null);
      setRetryCount((c) => c + 1);
      return;
    }

    // Record attendance
    try {
      const date = new Date().toISOString().split("T")[0];
      const { data, error } = await api
        .from("attendance_records")
        .insert([
          {
            student_id: studentId,
            school_id: schoolId,
            date,
            status: action === "sign-in" ? "present" : "signed-out",
            note: action,
          },
        ]);

      if (error) throw error;
      setMessage(`Successfully ${action === "sign-in" ? "signed in" : "signed out"}!`);
      setUploadedFile(null);
    } catch (err) {
      console.error(err);
      setMessage("Failed to record attendance.");
    }
  };

  return (
    <div className="student-signin-container">
      <h2>Biometric {action === "sign-in" ? "Sign In" : "Sign Out"}</h2>

      <div className="action-switch">
        <button onClick={() => setAction("sign-in")}>Sign In</button>
        <button onClick={() => setAction("sign-out")}>Sign Out</button>
      </div>

      {loadingModels && <p>Loading face detection models...</p>}

      {!loadingModels && (
        <>
          <div className="capture-options">
            <div>
              <video ref={webcamRef} autoPlay width="320" height="240" />
              <canvas ref={canvasRef} width="320" height="240" style={{ display: "none" }} />
            </div>
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setUploadedFile(e.target.files[0])}
              />
            </div>
          </div>

          <button onClick={handleCapture}>Submit</button>

          {message && <p className="message">{message}</p>}
          {retryCount > 0 && <p>Retries: {retryCount}</p>}

          {referenceImageUrl && (
            <div>
              <p>Reference Image:</p>
              <img src={referenceImageUrl} alt="reference" style={{ maxWidth: "150px" }} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BiometricsSignIn;
