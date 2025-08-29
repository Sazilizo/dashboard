import React, { useState, useRef, useEffect } from "react"
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

  const webcamRef = useRef()
  const canvasRef = useRef()
  const threshold = 0.6

  // Load persisted pending sign-ins
  useEffect(() => {
    const stored = localStorage.getItem("pendingSignIns")
    if (stored) setPendingSignIns(JSON.parse(stored))
  }, [])

  // Persist sign-ins whenever they change
  useEffect(() => {
    localStorage.setItem("pendingSignIns", JSON.stringify(pendingSignIns))
  }, [pendingSignIns])

  // Load models
  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = "/models"
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ])
      setLoadingModels(false)
    }
    loadModels()
  }, [])

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

  // Load reference images
  useEffect(() => {
    if (!studentId || !bucketName || !folderName) return
    const ids = Array.isArray(studentId) ? studentId : [studentId]

    const loadReferences = async () => {
      const labeledDescriptors = []
      for (const id of ids) {
        try {
          const { data: files } = await api.storage.from(bucketName).list(`${folderName}/${id}`)
          if (!files || files.length === 0) continue

          const file = files[0]
          const { data: signedUrl } = await api.storage.from(bucketName).createSignedUrl(
            `${folderName}/${id}/${file.name}`,
            60 * 60
          )

          if (signedUrl?.signedUrl) {
            const img = await faceapi.fetchImage(signedUrl.signedUrl)
            const detection = await faceapi
              .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
              .withFaceLandmarks()
              .withFaceDescriptor()

            if (detection) {
              labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(id.toString(), [detection.descriptor]))
            }
          }
        } catch (err) {
          console.error("Error loading reference for", id, err)
        }
      }

      if (labeledDescriptors.length > 0) {
        setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, threshold))
        setReferencesReady(true)
        console.log("✅ FaceMatcher ready with", labeledDescriptors.length, "labels")
      } else {
        console.warn("⚠ No reference descriptors found for", ids)
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

        if (action === "sign-in") {
          setPendingSignIns(prev => ({ ...prev, [match.label]: new Date().toISOString() }))
          setMessage(m => `${m}\n${match.label} signed in.`)
        }

        if (action === "sign-out") {
          const signInTime = pendingSignIns[match.label]
          if (!signInTime) {
            setMessage(m => `${m}\n⚠ No sign-in record for ${match.label}.`)
            continue
          }

          const signOutTime = new Date().toISOString()
          const durationMs = new Date(signOutTime) - new Date(signInTime)
          const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2)

          // Save attendance record
          const { error } = await api.from("attendance_records").upsert([
            {
              student_id: match.label,
              school_id: schoolId,
              status: "present",
              note: "biometric sign in",
              date,
              sign_in_time: signInTime,
              sign_out_time: signOutTime
            }
          ])
          if (error) throw error

          // Update session duration
          if (sessionType === "academic") {
            await api.from("academic_sessions").upsert([
              { student_id: match.label, duration_hours: durationHours, date }
            ])
          } else if (sessionType === "pe") {
            await api.from("pe_sessions").upsert([
              { student_id: match.label, duration_hours: durationHours, date }
            ])
          }

          setPendingSignIns(prev => {
            const copy = { ...prev }
            delete copy[match.label]
            return copy
          })
          setMessage(m => `${m}\n${match.label} signed out. Duration: ${durationHours} hrs`)
        }
      }

      setUploadedFile(null)
      setCaptureDone(true)
    } catch (err) {
      console.error(err)
      setMessage("Failed to record attendance.")
    }

    // Draw detections
    const canvas = canvasRef.current
    canvas.style.display = "block"
    canvas.width = img.width
    canvas.height = img.height
    faceapi.matchDimensions(canvas, { width: img.width, height: img.height })
    const resized = faceapi.resizeResults(detections, { width: img.width, height: img.height })
    faceapi.draw.drawDetections(canvas, resized)
    faceapi.draw.drawFaceLandmarks(canvas, resized)
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
