
import React from "react";
import { useRouteError } from "react-router-dom";
// import "../../styles/errorPage.css"
import "../styles/main.css"

export default function ErrorBoundary({ error: propError }) {
  // error from react-router (e.g. bad route) or prop from fetch calls
  const routeError = useRouteError();
  const error = propError || routeError;

  // Normalize error shape
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";
  let details = null;

  if (error) {
    if (typeof error === "string") {
      message = error;
    } else if (error.message) {
      message = error.message;
    }

    if (error.status) {
      title = `Error ${error.status}`;
    }

    if (error.stack) {
      details = error.stack;
    }

    if (error.code === "ERR_NETWORK") {
      title = "Network Error";
      message = "We could not connect to the server. Please check your internet connection.";
    }
  }

  return (
    <div className="error-container">
      <div className="error-card">
        <h1 className="error-title">{title}</h1>
        <p className="error-message">{message}</p>

        {details && (
          <pre className="error-details">
            {details}
          </pre>
        )}

        <div className="error-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              // Prefer a soft refresh to avoid losing in-memory state
              if (typeof window.refreshCache === 'function') {
                console.log('[ErrorBoundary] Triggering soft refresh via window.refreshCache()');
                try { window.refreshCache(); } catch (e) { console.warn('soft refresh failed', e); }
              } else {
                // Fallback to full reload only when no soft-refresh available
                window.location.reload();
              }
            }}
          >
            Reload Page
          </button>
          <button className="btn btn-secondary" onClick={() => window.history.back()}>
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
