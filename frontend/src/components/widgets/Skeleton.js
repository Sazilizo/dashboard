// components/Skeleton.js
import React from "react";

export default function Skeleton({ height = 20, width = "100%", style = {}, className = "" }) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: "#e0e0e0",
        backgroundImage: "linear-gradient(90deg, #e0e0e0 0%, #f0f0f0 50%, #e0e0e0 100%)",
        backgroundSize: "200% 100%",
        borderRadius: 6,
        marginBottom: 10,
        height,
        width,
        ...style,
        animation: "pulse 1.5s ease-in-out infinite, shimmer 2s linear infinite",
      }}
    />
  );
}
