// src/App.js
import React from "react";
import { RouterProvider } from "react-router-dom";
import router from "./router"; 
import { AuthProvider } from "./context/AuthProvider";
import { SchoolsProvider } from "./context/SchoolsContext";
import { FilterProvider } from "./context/FiltersContext";
import OfflineIndicator from "./components/OfflineIndicator";
import "./styles/main.css";
import "./styles/graphs.css";
import "./styles/DashboardHome.css"

function App() {
  return (
    <AuthProvider>
      <FilterProvider>
        <SchoolsProvider>
          <OfflineIndicator />
          <RouterProvider router={router} />
        </SchoolsProvider>
      </FilterProvider>
    </AuthProvider>
 )
}

export default App;
