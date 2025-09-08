import React from "react";

export default function Card({ children, className = "" }) {
  return (
    <div className={`app-card ${className}`}>
      {children}
    </div>
  );
}