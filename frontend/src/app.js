// src/App.js
import React from "react";
import { RouterProvider } from "react-router-dom";
import router from "./router"; 
import { AuthProvider } from "./context/AuthProvider";
import { SchoolsProvider } from "./context/SchoolsContext";
import { FilterProvider } from "./context/FiltersContext";
import { DataProvider } from "./context/DataContext";
import OfflineIndicator from "./components/OfflineIndicator";
import SchoolsDebugPanel from "./components/widgets/SchoolsDebugPanel";
import "./styles/main.css";
import "./styles/graphs.css";
import "./styles/DashboardHome.css"

function App() {
  // Show debug panel in development or if debug flag is set
  const showDebug = process.env.NODE_ENV === 'development' || localStorage.getItem('showSchoolsDebug') === 'true';
  
  return (
    <AuthProvider>
      <FilterProvider>
        <SchoolsProvider>
          <DataProvider>
            <OfflineIndicator />
            {showDebug && <SchoolsDebugPanel />}
            <RouterProvider router={router} />
          </DataProvider>
        </SchoolsProvider>
      </FilterProvider>
    </AuthProvider>
 )
}

export default App;
