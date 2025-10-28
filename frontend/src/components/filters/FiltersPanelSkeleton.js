// components/filters/FiltersPanelSkeleton.js
import React from "react";
import Skeleton from "../widgets/Skeleton";

export default function FiltersPanelSkeleton() {
  return (
    <div style={{ 
      border: "1px solid #eee", 
      padding: 16, 
      marginBottom: 16,
      borderRadius: 8,
      backgroundColor: "#fafafa"
    }}>
      {/* School filter skeleton */}
      <div style={{ marginBottom: 16 }}>
        <Skeleton height={18} width="120px" style={{ marginBottom: 8 }} />
        <Skeleton height={38} width="100%" />
      </div>

      {/* Additional filters skeleton */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ flex: "1 1 200px", minWidth: 150 }}>
          <Skeleton height={18} width="80px" style={{ marginBottom: 8 }} />
          <Skeleton height={38} width="100%" />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 150 }}>
          <Skeleton height={18} width="100px" style={{ marginBottom: 8 }} />
          <Skeleton height={38} width="100%" />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 150 }}>
          <Skeleton height={18} width="90px" style={{ marginBottom: 8 }} />
          <Skeleton height={38} width="100%" />
        </div>
      </div>
    </div>
  );
}
