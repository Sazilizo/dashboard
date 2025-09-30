import React, { useState } from "react";
import { Link } from "react-router-dom";
import Photos from "../profiles/Photos";

function FallbackImage({ bucketName, folderName, id, photoCount }) {
  const [hasError, setHasError] = useState(false);

  // Simple validator: check if file extension looks like an image
  const validImageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const isValid = (url) =>
    validImageExtensions.some((ext) => url?.toLowerCase().endsWith(ext));

  if (hasError) {
    return (
      <div className="w-full h-full bg-gray-300 rounded flex items-center justify-center">
        <span className="text-gray-500 text-sm">No image</span>
      </div>
    );
  }

  return (
    <Photos
      bucketName={bucketName}
      folderName={folderName}
      id={id}
      photoCount={photoCount}
      onError={() => setHasError(true)}
      isValidUrl={isValid} // pass validator down if your Photos supports it
    />
  );
}

export default function ListItems({ students }) {
  if (!students || students.length === 0) return <p>No students found.</p>;

  return (
    <ul className="app-list">
      {students.map((s) => (
        <li key={s.id}>
          <Link to={`/dashboard/students/${s.id}`}>
            <div className="app-profile-photo">
              <FallbackImage
                bucketName="student-uploads"
                folderName="students"
                id={s.id}
                photoCount={1}
              />
            </div>
            <div className="app-list-item-details">
              <p>
                <strong>{s.full_name}</strong>
              </p>
              <p>Grade: {s.grade}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
