import React, { useState, useEffect, useMemo } from "react";

const InfoCount = ({ label, count, icon, duration = 1000 }) => {
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = count;
    const increment = end / (duration / 16); // approx 60fps
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        start = end;
        clearInterval(timer);
      }
      setDisplayCount(Math.floor(start));
    }, 16);

    return () => clearInterval(timer);
  }, [count, duration]);

  return (
    <div className="info-count-card">
      {icon && <div className="info-count-icon">{icon}</div>}
      <div className="info-count-details">
        <p className="info-count-label">{label}</p>
        <p className="info-count-number">{displayCount}</p>
      </div>
    </div>
  );
};

export default InfoCount;
