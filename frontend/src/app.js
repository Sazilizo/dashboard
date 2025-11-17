// src/App.js
import React, { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import router from "./router"; 
import { AuthProvider } from "./context/AuthProvider";
import { SchoolsProvider } from "./context/SchoolsContext";
import { FilterProvider } from "./context/FiltersContext";
import { DataProvider } from "./context/DataContext";
import OfflineIndicator from "./components/OfflineIndicator";
import SeoHelmet from './components/SeoHelmet';
import "./styles/main.css";
import "./styles/graphs.css";
import "./styles/DashboardHome.css"
import { preloadFaceApiModels, areFaceApiModelsLoaded } from "./utils/FaceApiLoader";
import "./styles/Buttons.css";
function App() {
  // Show debug panel in development or if debug flag is set
  const showDebug = process.env.NODE_ENV === 'development' || localStorage.getItem('showSchoolsDebug') === 'true';
  
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
      <SchoolsProvider>
        <FilterProvider>
          <DataProvider>
            <SeoHelmet />
            <OfflineIndicator />
            {/* Schools debug panel removed from UI to avoid intrusive popup on small screens */}
            <RouterProvider router={router} />
          </DataProvider>
        </FilterProvider>
      </SchoolsProvider>
    </AuthProvider>
 )
}

export default App;
