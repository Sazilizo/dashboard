import React, { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "../../api/client"
import * as faceapi from "face-api.js"
import "../../styles/BiometricsSignIn.css"

const BiometricsSignIn = ({ studentId, schoolId, bucketName, folderName, sessionType }) => {
  const [loadingModels, setLoadingModels] = useState(true)
  const [message, setMessage] = useState("")
  const [faceMatcher, setFaceMatcher] = useState(null)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [pendingSignIns, setPendingSignIns] = useState({})
  const [captureDone, setCaptureDone] = useState(false)
  const [referencesReady, setReferencesReady] = useState(false)
  const [studentNames, setStudentNames] = useState({})

  const webcamRef = useRef()
  const canvasRef = useRef()
  const threshold = 0.6
  const navigate = useNavigate()

  // Load persisted pending sign-ins
  useEffect(() => {
    const stored = localStorage.getItem("pendingSignIns")
    if (stored) setPendingSignIns(JSON.parse(stored))
  }, [])

  // Persist sign-ins whenever they change
  useEffect(() => {
    localStorage.setItem("pendingSignIns", JSON.stringify(pendingSignIns))
  }, [pendingSignIns])

  useEffect(() => {
    const loadModelsFromStorage = async () => {
      try {
        const MODEL_FILES = [
          "tiny_face_detector_model-weights_manifest.json",
          "face_landmark_68_model-weights_manifest.json",
          "face_recognition_model-weights_manifest.json"
        ]

        const MODEL_URLS = await Promise.all(
          MODEL_FILES.map(async (file) => {
            const { data, error } = await api.storage
              .from("faceapi-models")
              .createSignedUrl(file, 60 * 60) // 1 hour
            if (error) throw error
            return data.signedUrl
          })
        )

        // Load models
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URLS[0]),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URLS[1]),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URLS[2]),
        ])

        setLoadingModels(false)
      } catch (err) {
        console.error("Failed to load models from storage", err)
        setMessage("Failed to load face detection models.")
      }
    }

    loadModelsFromStorage()
  }, [])

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

  useEffect(() => {
    if (!studentId || !bucketName || !folderName) return
    const ids = Array.isArray(studentId) ? studentId : [studentId]

    const loadReferences = async () => {
      const labeledDescriptors = []

      for (const id of ids) {
        try {
          const { data: files, error } = await api.storage.from(bucketName).list(`${folderName}/${id}`)
          if (error || !files || files.length === 0) continue

          const imageFiles = files.filter(f =>
            !f.name.startsWith(".") && /\.(jpg|jpeg|png)$/i.test(f.name)
          )
          if (imageFiles.length === 0) continue

          const descriptors = []
          for (const file of imageFiles) {
            const { data: signedUrl } = await api.storage.from(bucketName).createSignedUrl(
              `${folderName}/${id}/${file.name}`,
              60 * 60
            )
            if (!signedUrl?.signedUrl) continue

            try {
              const img = await faceapi.fetchImage(signedUrl.signedUrl)
              const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor()

              if (detection) descriptors.push(detection.descriptor)
            } catch (err) {
              console.error(`Skipping invalid file for ${id}: ${file.name}`, err)
            }
          }

          if (descriptors.length > 0) {
            labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(id.toString(), descriptors))
          }
        } catch (err) {
          console.error("Error loading reference for", id, err)
        }
      }

      if (labeledDescriptors.length > 0) {
        setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, threshold))
        setReferencesReady(true)
      }
    }

    loadReferences()
  }, [studentId, bucketName, folderName])

  const handleCapture = async (action) => {
    if (!referencesReady || !faceMatcher) {
      setMessage("Reference faces not ready yet.")
      return
    }

    setMessage("Detecting face(s)...")
    let img

    if (uploadedFile) {
      img = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const image = new Image()
          image.src = reader.result
          image.onload = () => resolve(image)
          image.onerror = reject
        }
        reader.onerror = reject
        reader.readAsDataURL(uploadedFile)
      })
    } else {
      const video = webcamRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      img = await faceapi.fetchImage(canvas.toDataURL("image/jpeg"))
    }

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

        if (action === "sign-in") {
          setPendingSignIns(prev => ({ ...prev, [match.label]: new Date().toISOString() }))
          setMessage(m => `${m}\n${displayName} signed in.`)
        }

        if (action === "sign-out") {
          const signInTime = pendingSignIns[match.label]
          if (!signInTime) {
            setMessage(m => `${m}\n⚠ No sign-in record for ${displayName}.`)
            continue
          }

          const signOutTime = new Date().toISOString()
          const durationMs = new Date(signOutTime) - new Date(signInTime)
          const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2)

          await api.from("attendance_records").upsert([{
            student_id: match.label,
            school_id: schoolId,
            status: "present",
            note: "biometric sign in",
            date,
            sign_in_time: signInTime,
            sign_out_time: signOutTime
          }])

          if (sessionType === "academic") {
            await api.from("academic_sessions").upsert([{ student_id: match.label, duration_hours: durationHours, date }])
          } else if (sessionType === "pe") {
            await api.from("pe_sessions").upsert([{ student_id: match.label, duration_hours: durationHours, date }])
          }

          setPendingSignIns(prev => {
            const copy = { ...prev }
            delete copy[match.label]
            return copy
          })
          setMessage(m => `${m}\n${displayName} signed out. Duration: ${durationHours} hrs`)
        }
      }

      setUploadedFile(null)
      setCaptureDone(true)

      setTimeout(() => navigate(-1), 2000)
    } catch (err) {
      console.error(err)
      setMessage("Failed to record attendance.")
    }

    const canvas = canvasRef.current
    canvas.style.display = "block"
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext("2d")
    ctx.drawImage(img, 0, 0, img.width, img.height)
  }

  return (
    <div className="student-signin-container">
      <h2>Biometric Sign In / Out</h2>

      {loadingModels && <p>Loading face detection models...</p>}

      {!loadingModels && (
        <>
          <div className="capture-options">
            <div className="video-container">
              {!captureDone && <video ref={webcamRef} autoPlay width="320" height="240" />}
              <canvas ref={canvasRef} width="320" height="240" />
            </div>
            <div className="upload-container">
              {!captureDone && <input type="file" accept="image/*" onChange={e => setUploadedFile(e.target.files[0])} />}
            </div>
          </div>

          {!captureDone && (
            <>
              {Object.keys(pendingSignIns).length === 0 ? (
                <button className="submit-btn" onClick={() => handleCapture("sign-in")} disabled={!referencesReady}>
                  Sign In Snapshot
                </button>
              ) : (
                <button className="submit-btn" onClick={() => handleCapture("sign-out")} disabled={!referencesReady}>
                  Sign Out Snapshot
                </button>
              )}
            </>
          )}

          {message && <pre className="message">{message}</pre>}
        </>
      )}
    </div>
  )
}

export default BiometricsSignIn
