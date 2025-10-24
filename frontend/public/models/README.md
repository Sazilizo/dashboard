Place your face-api model files here (tiny_face_detector, face_landmark_68, face_recognition manifests and binary weight files).

Expected structure (example):

public/models/
  tiny_face_detector_model-weights_manifest.json
  tiny_face_detector_model-shard1
  face_landmark_68_model-weights_manifest.json
  face_landmark_68_model-shard1
  face_recognition_model-weights_manifest.json
  face_recognition_model-shard1

Notes:
- These files are served at runtime from /models/* (e.g. /models/tiny_face_detector_model-weights_manifest.json).
- If you want to host models elsewhere (e.g. Supabase), update the component/worker to use that URL instead of /models.
- After adding models, run `npm run build` or `npm start` (dev) — CopyWebpackPlugin will copy these files into the build output.

Security:
- Model files are not user data and are typically public.
- If you must restrict access, host them behind an authenticated endpoint and pass signed URLs to the worker.
