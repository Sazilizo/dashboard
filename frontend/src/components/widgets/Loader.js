import React from "react";
import "../../styles/Loader.css";

/**
 * Modern Loader Component
 * @param {string} size - Size: 'small' (32px), 'medium' (48px), 'large' (64px), 'xlarge' (96px)
 * @param {string} variant - Variant: 'spinner', 'dots', 'pulse', 'bars'
 * @param {string} text - Optional loading text
 */
export default function Loader({ 
  size = "medium", 
  variant = "spinner",
  text = "",
  fullScreen = false 
}) {
  const containerClass = fullScreen ? "loader-fullscreen" : "loader-container";

  return (
    <div className={containerClass}>
      <div className={`loader loader-${variant} loader-${size}`}>
      {variant === "spinner" && (
        <div className="spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-letters">
            <span className="spinner-letter letter-g">G</span>
            <span className="spinner-letter letter-c">C</span>
            <span className="spinner-letter letter-u">U</span>
          </div>
        </div>
      )}        {variant === "dots" && (
          <div className="dots">
            <div className="dot dot-1"></div>
            <div className="dot dot-2"></div>
            <div className="dot dot-3"></div>
          </div>
        )}
        
        {variant === "pulse" && (
          <div className="pulse">
            <div className="pulse-ring pulse-ring-1"></div>
            <div className="pulse-ring pulse-ring-2"></div>
            <div className="pulse-ring pulse-ring-3"></div>
            <div className="pulse-core"></div>
          </div>
        )}
        
        {variant === "bars" && (
          <div className="bars">
            <div className="bar bar-1"></div>
            <div className="bar bar-2"></div>
            <div className="bar bar-3"></div>
            <div className="bar bar-4"></div>
            <div className="bar bar-5"></div>
          </div>
        )}
      </div>
      
      {text && <p className="loader-text">{text}</p>}
    </div>
  );
}
