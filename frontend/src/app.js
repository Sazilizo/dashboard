// src/App.js
import React, { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import router from "./router"; 
import { AuthProvider } from "./context/AuthProvider";
import { SchoolsProvider } from "./context/SchoolsContext";
import { FilterProvider } from "./context/FiltersContext";
import { DataProvider } from "./context/DataContext";
import OfflineIndicator from "./components/OfflineIndicator";
import useSeo from './hooks/useSeo';
import "./styles/main.css";
import "./styles/graphs.css";
import "./styles/DashboardHome.css"
import "./styles/Buttons.css"
import { preloadFaceApiModels, areFaceApiModelsLoaded } from "./utils/FaceApiLoader";

function App() {
  // Show debug panel in development or if debug flag is set
  const showDebug = process.env.NODE_ENV === 'development' || localStorage.getItem('showSchoolsDebug') === 'true';
  
  // Set basic SEO defaults for the app shell
  useSeo();
  // Defer face-api model preloading to idle time - don't block initial render
  useEffect(() => {
    const runWhenIdle = (callback) => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(callback, { timeout: 3000 });
      } else {
        setTimeout(callback, 500);
      }
    };
    
    if (!areFaceApiModelsLoaded()) {
      runWhenIdle(() => {
        preloadFaceApiModels().catch(() => {});
      });
    }
  }, []);
  
  return (
    <AuthProvider>
      <FilterProvider>
        <SchoolsProvider>
          <DataProvider>
            {/* SEO handled by useSeo hook */}
            <OfflineIndicator />
            {/* Schools debug panel removed from UI to avoid intrusive popup on small screens */}
            <RouterProvider router={router} />
          </DataProvider>
        </SchoolsProvider>
      </FilterProvider>
    </AuthProvider>
 )
}

export default App;
