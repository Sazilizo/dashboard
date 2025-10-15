import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import cacheFormSchemasIfOnline from "./utils/proactiveCache";
import { preloadFaceApiModels } from "./utils/FaceApiLoader";


const container = document.getElementById("root");
const root = createRoot(container);

// Fire-and-forget proactive cache; only runs when online and helps first-time
// offline usage of dynamic forms by ensuring `form_schemas` is present in IDB.
cacheFormSchemasIfOnline().catch((err) => console.warn("[index] cache error", err));

// Preload face-api models in background (useful for biometric flows)
preloadFaceApiModels().catch((err) => console.warn("[index] faceapi preload failed", err));

root.render(<App />);
