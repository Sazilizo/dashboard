// components/filters/FiltersPanelSkeleton.js
import React from "react";
import Skeleton from "../Skeleton";

export default function FiltersPanelSkeleton() {
  return (
    <div style={{ border: "1px solid #eee", padding: 16, marginBottom: 16 }}>
      <Skeleton height={25} width="40%" />
      <Skeleton height={25} width="70%" />
      <Skeleton height={25} width="60%" />
    </div>
  );
}
