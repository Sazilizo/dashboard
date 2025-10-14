import React, { useState } from "react";
import { Link } from "react-router-dom";
import Photos from "../profiles/Photos";

function FallbackImage({ bucketName, folderName, id, photoCount }) {
  const [hasError, setHasError] = useState(false);
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
      isValidUrl={isValid}
    />
  );
}

export default function ListItems({ students, onDelete, onUpdate }) {
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

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
          {/* Delete button */}
          {onDelete && (
            <button
              className="btn btn-danger"
              onClick={() => onDelete(s.id)}
              style={{ marginLeft: 8 }}
            >
              Delete
            </button>
          )}
          {/* Simple inline edit for name */}
          {onUpdate && (
            <span style={{ marginLeft: 8 }}>
              {editId === s.id ? (
                <>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    style={{ width: 120 }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      onUpdate(s.id, { full_name: editName });
                      setEditId(null);
                    }}
                  >
                    Save
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setEditId(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditId(s.id);
                    setEditName(s.full_name);
                  }}
                >
                  Edit
                </button>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}