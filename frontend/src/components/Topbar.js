import React from "react";

export default function Topbar() {
  return (
    <header style={{ height: 56, background: "#fff", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", padding: "0 24px" }}>
      <div style={{ fontWeight: 600 }}>School Dashboard</div>
      {/* Add user info, school switcher, notifications here */}
    </header>
  );
}
