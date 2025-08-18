import React from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardRoutes from "./DashboardRoutes";
import Login from "./pages/Login";
import { AuthProvider } from "./context/AuthProvider";
import LandingPage from "./pages/LandingPage";
import { SchoolsProvider } from "./context/SchoolsContext";
import "./styles/main.css"; // Import your main CSS file
import { FilterProvider } from "./context/FiltersContext";

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
      <FilterProvider>
        <SchoolsProvider>
            <Routes>
              <Route
                path="/dashboard/*"
                element={
                  <AuthProvider>
                      <DashboardRoutes />
                  </AuthProvider>
                }
              />
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              {/* Removed duplicate /login route */}
            </Routes>
        </SchoolsProvider>
      </FilterProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;