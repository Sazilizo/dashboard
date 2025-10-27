import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

function FallbackImage({ url }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded overflow-hidden">
      {url ? (
        <img
          src={url}
          alt="Student"
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-gray-500 text-sm">No image</span>
      )}
    </div>
  );
}

export default function ListItems({ students, onDelete, onUpdate, photoMap }) {
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

  if (!students || students.length === 0) return <p>No students found.</p>;

  console.log("Rendering ListItems with students:", students);
  return (
    <ul className="app-list">
      {students.map((s) => (
        <li key={s.id}>
          <Link to={`/dashboard/students/${s.id}`}>
            <div className="app-profile-photo">
              <FallbackImage url={photoMap?.[s.id]} />
            </div>
            <div className="app-list-item-details">
              <p>
                <strong>{s.full_name}</strong>
              </p>
              <p>
                Grade: {s.grade}{" "}
                {s.__queued && (
                  <span style={{ color: "orange", marginLeft: 8 }}>
                    (Queued)
                  </span>
                )}
              </p>
            </div>
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
