// components/Skeleton.js
import React from "react";

export default function Skeleton({ height = 20, width = "100%", style = {} }) {
  return (
    <div
      style={{
        backgroundColor: "#eee",
        borderRadius: 4,
        marginBottom: 10,
        height,
        width,
        ...style,
        animation: "pulse 1.5s infinite",
      }}
    />
  );
}
