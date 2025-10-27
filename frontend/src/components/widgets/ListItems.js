import React, { useState } from "react";
import { Link } from "react-router-dom";
import Photos from "../profiles/Photos";

export default function ListItems({ students, onDelete, onUpdate, bucketName = "student-uploads", folderName = "students" }) {
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

  if (!students || students.length === 0) return <p>No students found.</p>;

  return (
    <ul className="app-list wave-list">
      {students.map((s) => (
        <li key={s.id}>
          <Link to={`/dashboard/students/${s.id}`}>
            <div className="app-profile-photo">
              <Photos
                bucketName={bucketName}
                folderName={folderName}
                id={s.id}
                photoCount={1}
                restrictToProfileFolder={true}
              />
            </div>
            <div className="app-list-item-details">
              <p>
                <strong>{s.full_name}</strong>
              </p>
              <p>
                Grade:{ `${s.grade} (${s.category})`}{" "}
                {s.__queued && (
                  <span style={{ color: "orange", marginLeft: 8 }}>
                    (Queued)
                  </span>
                )}
              </p>
            </div>
            <p>School: {s.school.name}</p>
          </Link>

          {onDelete && (
            <button
              className="btn btn-danger"
              onClick={() => onDelete(s.id)}
              style={{ marginLeft: 8 }}
            >
              Delete
            </button>
          )}

          {onUpdate && (
            <span style={{ marginLeft: 8 }}>
              {editId === s.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
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
