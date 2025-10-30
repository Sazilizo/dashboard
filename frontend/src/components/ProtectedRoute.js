import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";

/**
 * ProtectedRoute - Wrapper component for routes that require authentication
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children - Child components to render if authenticated
 * @param {boolean} props.redirectIfAuthenticated - If true, redirect to dashboard when already logged in (for login/register pages)
 * @returns {React.ReactNode}
 */
export default function ProtectedRoute({ children, redirectIfAuthenticated = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div style={{ 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center", 
        height: "100vh",
        fontSize: "1.2rem",
        color: "#666"
      }}>
        Loading...
      </div>
    );
  }

  // If route should redirect when authenticated (e.g., login page)
  if (redirectIfAuthenticated && user) {
    // User is already logged in, redirect to dashboard
    return <Navigate to="/dashboard" replace />;
  }

  // If route requires authentication but user is not logged in
  if (!redirectIfAuthenticated && !user) {
    // Save the location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // User is authenticated (or not required), render children
  return children;
}
