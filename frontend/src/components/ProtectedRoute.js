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

  // New: show a nicer refreshing UX while auth provider refreshes user data
  const { isRefreshing } = useAuth();

  // Show loading state while checking authentication
  if (loading) {
    if (isRefreshing) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div style={{ textAlign: 'center', color: '#444' }}>
            <svg width="56" height="56" viewBox="0 0 50 50" aria-hidden>
              <circle cx="25" cy="25" r="20" stroke="#e6e6e6" strokeWidth="5" fill="none" />
              <path d="M45 25a20 20 0 0 1-20 20" stroke="#6366f1" strokeWidth="5" strokeLinecap="round" fill="none">
                <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
              </path>
            </svg>
            <div style={{ marginTop: 12, fontSize: 16 }}>Refreshing account…</div>
          </div>
        </div>
      );
    }

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
