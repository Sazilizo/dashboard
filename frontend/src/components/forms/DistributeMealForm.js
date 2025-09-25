import React, { useState, useRef, useEffect } from "react"
import api from "../../api/client"
import * as faceapi from "face-api.js"
import "../../styles/BiometricsSignIn.css"

const faceDescriptorCache = {}
let modelsLoadedGlobal = false

const BiometricsSignIn = ({ studentId, schoolId, bucketName, folderName, sessionType }) => {
  const [loadingModels, setLoadingModels] = useState(true)
  const [message, setMessage] = useState("")
  const [faceMatcher, setFaceMatcher] = useState(null)
  const [referencesReady, setReferencesReady] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [studentName, setStudentName] = useState(null)
  const [captureDone, setCaptureDone] = useState(false)

  const webcamRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const threshold = 0.6

  // Load models (only once globally)
  useEffect(() => {
    let cancelled = false
    const loadModels = async () => {
      if (modelsLoadedGlobal) {
        setLoadingModels(false)
        return
      }
      try {
        const MODEL_URL = "https://pmvecwjomvyxpgzfweov.supabase.co/storage/v1/object/public/faceapi-models"
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(`${MODEL_URL}/tiny_face_detector_model-weights_manifest.json`),
          faceapi.nets.faceLandmark68Net.loadFromUri(`${MODEL_URL}/face_landmark_68_model-weights_manifest.json`),
          faceapi.nets.faceRecognitionNet.loadFromUri(`${MODEL_URL}/face_recognition_model-weights_manifest.json`)
        ])
        modelsLoadedGlobal = true
        if (!cancelled) setLoadingModels(false)
      } catch (err) {
        console.error("Error loading models", err)
        if (!cancelled) setMessage("Failed to load models.")
      }
    }
    loadModels()
    return () => { cancelled = true }
  }, [])

  // Fetch single student name
  useEffect(() => {
    if (!studentId) return
    const fetchName = async () => {
      const { data, error } = await api.from("students").select("id, full_name").eq("id", studentId).single()
      if (!error && data) setStudentName(data.full_name)
    }
    fetchName()
  }, [studentId])

  // Start webcam
  useEffect(() => {
    let mounted = true
    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
          audio: false
        })
        streamRef.current = stream
        if (webcamRef.current && mounted) {
          webcamRef.current.srcObject = stream
          await webcamRef.current.play()
        }
      } catch (err) {
        console.error("Webcam error", err)
        setMessage("Could not access webcam.")
      }
    }
    if (!captureDone) startWebcam()
    return () => {
      mounted = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [captureDone])

  // Load reference for ONLY this student
  useEffect(() => {
    if (!studentId || !bucketName || !folderName) return
    const loadRef = async () => {
      try {
        if (faceDescriptorCache[studentId]) {
          setFaceMatcher(new faceapi.FaceMatcher([faceDescriptorCache[studentId]], threshold))
          setReferencesReady(true)
          return
        }

        const { data: files, error } = await api.storage.from(bucketName).list(`${folderName}/${studentId}`)
        if (error || !files || files.length === 0) {
          setMessage("No valid reference images found for this student.")
          return
        }

        const images = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f.name))
        if (images.length === 0) {
          setMessage("No valid image formats found.")
          return
        }

        const descriptors = await Promise.all(
          images.map(async (file) => {
            try {
              const { data: urlData } = await api
                .storage
                .from(bucketName)
                .createSignedUrl(`${folderName}/${studentId}/${file.name}`, 3000)
              if (!urlData?.signedUrl) return null
              const img = await faceapi.fetchImage(urlData.signedUrl)
              const detection = await faceapi
                .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 192 }))
                .withFaceLandmarks()
                .withFaceDescriptor()
              return detection?.descriptor ?? null
            } catch (err) {
              console.error("Invalid image skipped", file.name, err)
              return null
            }
          })
        )

        const valid = descriptors.filter(d => d !== null)
        if (valid.length === 0) {
          setMessage("No valid reference faces detected for this student.")
          return
        }

        const labeled = new faceapi.LabeledFaceDescriptors(studentId.toString(), valid)
        faceDescriptorCache[studentId] = labeled
        setFaceMatcher(new faceapi.FaceMatcher([labeled], threshold))
        setReferencesReady(true)
      } catch (err) {
        console.error("Error loading student reference", err)
        setMessage("Error loading reference image(s).")
      }
    }
    loadRef()
  }, [studentId, bucketName, folderName, threshold])

  const handleCapture = async () => {
    if (!faceMatcher) {
      setMessage("Reference not ready.")
      return
    }
    try {
      const detections = await faceapi
        .detectAllFaces(webcamRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 192 }))
        .withFaceLandmarks()
        .withFaceDescriptors()
      if (!detections.length) {
        setMessage("No faces detected.")
        return
      }

      const results = detections.map(d => faceMatcher.findBestMatch(d.descriptor))
      const match = results.find(r => r.label !== "unknown")
      if (match) {
        setMessage(`${studentName || "Student"} recognized ✔️`)
      } else {
        setMessage("Face not recognized.")
      }

      // snapshot
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      canvas.width = webcamRef.current.videoWidth
      canvas.height = webcamRef.current.videoHeight
      ctx.drawImage(webcamRef.current, 0, 0, canvas.width, canvas.height)
      setCaptureDone(true)
    } catch (err) {
      console.error("Capture error", err)
      setMessage("Failed to capture.")
    }
  }

  return (
    <div className="student-signin-container">
      <h2>Biometric Sign In</h2>
      {loadingModels ? <p>Loading models...</p> : (
        <>
          <div className="video-container">
            <video ref={webcamRef} autoPlay playsInline muted style={{ display: captureDone ? "none" : "block", width: "100%" }} />
            <canvas ref={canvasRef} style={{ display: captureDone ? "block" : "none", width: "100%" }} />
          </div>
          <button className="submit-btn" onClick={handleCapture} disabled={!referencesReady || isProcessing}>
            {isProcessing ? "Processing..." : "Take Snapshot"}
          </button>
          {message && <pre className="message">{message}</pre>}
        </>
      )}
    </div>
  )
}

export default BiometricsSignIn
