import React, { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "../../api/client"
import * as faceapi from "face-api.js"
import "../../styles/BiometricsSignIn.css"

// Global cache for face descriptors
const faceDescriptorCache = {}

const BiometricsSignIn = ({ studentId, schoolId, bucketName, folderName, sessionType }) => {
  const [loadingModels, setLoadingModels] = useState(true)
  const [message, setMessage] = useState("")
  const [faceMatcher, setFaceMatcher] = useState(null)
  const [pendingSignIns, setPendingSignIns] = useState({})
  const [captureDone, setCaptureDone] = useState(false)
  const [referencesReady, setReferencesReady] = useState(false)
  const [studentNames, setStudentNames] = useState({})

  const webcamRef = useRef()
  const canvasRef = useRef()
  const threshold = 0.6
  const navigate = useNavigate()

  // Load persisted pending sign-ins metadata
  useEffect(() => {
    const stored = localStorage.getItem("pendingSignIns")
    if (stored) setPendingSignIns(JSON.parse(stored))
  }, [])

  // Persist sign-ins metadata whenever they change
  useEffect(() => {
    localStorage.setItem("pendingSignIns", JSON.stringify(pendingSignIns))
  }, [pendingSignIns])

  // Load face-api models from Supabase
  useEffect(() => {
    const loadModelsFromSupabase = async () => {
      try {
        const MODEL_FILES = [
          "tiny_face_detector_model-weights_manifest.json",
          "face_landmark_68_model-weights_manifest.json",
          "face_recognition_model-weights_manifest.json"
        ]
        const MODEL_URLS = MODEL_FILES.map(f =>
          `https://pmvecwjomvyxpgzfweov.supabase.co/storage/v1/object/public/faceapi-models/${f}`
        )
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URLS[0]),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URLS[1]),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URLS[2]),
        ])
        setLoadingModels(false)
      } catch (err) {
        console.error("Failed to load models from Supabase", err)
        setMessage("Failed to load face detection models.")
      }
    }
    loadModelsFromSupabase()
  }, [])

  // Fetch student names for display
  useEffect(() => {
    const ids = Array.isArray(studentId) ? studentId : [studentId]
    if (ids.length === 0) return
    const fetchNames = async () => {
      const { data, error } = await api
        .from("students")
        .select("id, first_name, last_name")
        .in("id", ids)
      if (!error && data) {
        const map = {}
        data.forEach(s => { map[s.id] = `${s.first_name} ${s.last_name}` })
        setStudentNames(map)
      }
    }
    fetchNames()
  }, [studentId])

  // Setup webcam
  useEffect(() => {
    if (captureDone) return
    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        if (webcamRef.current) webcamRef.current.srcObject = stream
      } catch (err) {
        console.error(err)
        setMessage("Could not access webcam.")
      }
    }
    startWebcam()
    return () => {
      if (webcamRef.current?.srcObject) {
        webcamRef.current.srcObject.getTracks().forEach(track => track.stop())
      }
    }
  }, [captureDone])

  // Load reference images and cache descriptors globally
  useEffect(() => {
    if (!studentId || !bucketName || !folderName) return
    const ids = Array.isArray(studentId) ? studentId : [studentId]

    const loadReferences = async () => {
      try {
        const labeledDescriptors = await Promise.all(
          ids.map(async (id) => {
            if (faceDescriptorCache[id]) return faceDescriptorCache[id]

            const { data: files, error } = await api.storage.from(bucketName).list(`${folderName}/${id}`)
            if (error || !files || files.length === 0) return null

            const imageFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f.name))
            if (imageFiles.length === 0) return null

            const descriptors = await Promise.all(
              imageFiles.map(async (file) => {
                try {
                  const path = `${folderName}/${id}/${file.name}`
                  const { data: urlData, error: urlError } = await api.storage
                    .from(bucketName)
                    .createSignedUrl(path, 300)
                  if (urlError || !urlData?.signedUrl) return null
                  const img = await faceapi.fetchImage(urlData.signedUrl)
                  const detection = await faceapi
                    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks()
                    .withFaceDescriptor()
                  return detection?.descriptor ?? null
                } catch (err) {
                  console.error(`Skipping invalid file for ${id}: ${file.name}`, err)
                  return null
                }
              })
            )

            const validDescriptors = descriptors.filter(d => d !== null)
            if (validDescriptors.length === 0) return null

            const labeled = new faceapi.LabeledFaceDescriptors(id.toString(), validDescriptors)
            faceDescriptorCache[id] = labeled
            return labeled
          })
        )

        const filteredDescriptors = labeledDescriptors.filter(ld => ld !== null)
        if (filteredDescriptors.length > 0) {
          setFaceMatcher(new faceapi.FaceMatcher(filteredDescriptors, threshold))
          setReferencesReady(true)
        } else {
          setMessage("No valid reference images found for these students.")
        }
      } catch (err) {
        console.error("Error loading reference images", err)
        setMessage("Failed to load reference images.")
      }
    }

    loadReferences()
  }, [studentId, bucketName, folderName])

  // Capture and handle multi-student sign-in/sign-out
  const handleCapture = async () => {
    if (!referencesReady || !faceMatcher) {
      setMessage("Reference faces not ready yet.")
      return
    }

    setMessage("Detecting face(s)...")
    const video = webcamRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const img = await faceapi.fetchImage(canvas.toDataURL("image/jpeg"))

    const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors()
    if (detections.length === 0) {
      setMessage("No faces detected. Try again.")
      return
    }

    const results = detections.map(d => faceMatcher.findBestMatch(d.descriptor))
    const date = new Date().toISOString().split("T")[0]

    try {
      for (const match of results) {
        if (match.label === "unknown") continue
        const displayName = studentNames[match.label] || `ID ${match.label}`

        if (!pendingSignIns[match.label]) {
          // SIGN-IN
          const signInTime = new Date().toISOString()
          const { data, error } = await api.from("attendance_records").insert([{
            student_id: match.label,
            school_id: schoolId,
            status: "present",
            note: "biometric sign in",
            date,
            sign_in_time: signInTime
          }]).select("id").single()

          if (error) {
            console.error(error)
            setMessage(`Failed to record sign-in for ${displayName}.`)
            continue
          }

          setPendingSignIns(prev => ({
            ...prev,
            [match.label]: { id: data.id, signInTime }
          }))
          setMessage(m => `${m}\n${displayName} signed in.`)
        } else {
          // SIGN-OUT
          const pending = pendingSignIns[match.label]
          const signOutTime = new Date().toISOString()
          const durationMs = new Date(signOutTime) - new Date(pending.signInTime)
          const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2)

          await api.from("attendance_records").update({
            sign_out_time: signOutTime
          }).eq("id", pending.id)

          if (sessionType === "academic") {
            await api.from("academic_sessions").insert([{ student_id: match.label, duration_hours: durationHours, date }])
          } else if (sessionType === "pe") {
            await api.from("pe_sessions").insert([{ student_id: match.label, duration_hours: durationHours, date }])
          }

          setPendingSignIns(prev => {
            const copy = { ...prev }
            delete copy[match.label]
            return copy
          })
          setMessage(m => `${m}\n${displayName} signed out. Duration: ${durationHours} hrs`)
        }
      }

      setCaptureDone(false) // Keep webcam open for next student
    } catch (err) {
      console.error(err)
      setMessage("Failed to record attendance.")
    }

    // Draw captured image on canvas
    canvas.style.display = "block"
    canvas.width = img.width
    canvas.height = img.height
    ctx.drawImage(img, 0, 0, img.width, img.height)

    setCaptureDone(true)
  }

  return (
    <div className="student-signin-container">
      <h2>Biometric Sign In / Out</h2>

      {loadingModels && <p>Loading face detection models...</p>}

      {!loadingModels && (
        <>
          <div className="video-container">
            <video ref={webcamRef} autoPlay width="320" height="240" style={{ display: captureDone ? 'none' : 'block' }} />
            <canvas
              ref={canvasRef}
              width="320"
              height="240"
              style={{ display: captureDone ? 'block' : 'none' }}
            />
          </div>
          <button className="submit-btn" onClick={handleCapture} disabled={!referencesReady}>
            Sign In / Out Snapshot
          </button>

          {message && <pre className="message">{message}</pre>}
        </>
      )}
    </div>
  )
}

export default BiometricsSignIn
