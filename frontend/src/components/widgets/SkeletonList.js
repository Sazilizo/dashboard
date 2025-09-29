import React from "react";

export default function SkeletonList({ count = 5, showPhoto = true, shortText = true }) {
  return (
    <ul className="app-list">
      {Array.from({ length: count }).map((_, idx) => (
        <li key={idx} className="loading-skeleton">
          {showPhoto && <div className="app-profile-photo photo-skeleton" />}
          <div className="app-list-item-details">
            <p className="skeleton-text" />
            {shortText && <p className="skeleton-text short" />}
          </div>
        </li>
      ))}
    </ul>
  );
}
