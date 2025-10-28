import React, { useState } from "react";
import { Link } from "react-router-dom";
import Photos from "../profiles/Photos";
import { isBirthday } from "../../utils/birthdayUtils";

export default function ListItems({ students, items, onDelete, onUpdate, resource = "students", bucketName = "student-uploads", folderName = "students" }) {
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

  // Support both 'students' and 'items' props for flexibility
  const data = students || items || [];

  if (!data || data.length === 0) return <p className="no-data-message">No {resource} found.</p>;

  return (
    <ul className="app-list wave-list">
      {data.map((s) => (
        <li key={s.id}>
          <Link to={`/dashboard/${resource}/${s.id}`}>
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
              <div className="item-info">
                <p className="item-name">
                  <strong>{s.full_name || s.name}</strong>
                  {isBirthday(s.date_of_birth) && (
                    <span className="birthday-badge">🎂 Birthday Today!</span>
                  )}
                </p>
                <p className="item-details">
                  {s.grade && `Grade: ${s.grade}`}
                  {s.category && ` (${s.category})`}
                  {s.group_by && `Group: ${s.group_by}`}
                  {s.__queued && (
                    <span className="queued-badge">
                      (Queued)
                    </span>
                  )}
                </p>
                {s.school && (
                  <p className="item-school">
                    School: {s.school.name || s.school_name || '—'}
                  </p>
                )}
              </div>
            </div>
          </Link>

          {onDelete && (
            <button
              className="btn btn-danger btn-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(s.id);
              }}
            >
              Delete
            </button>
          )}

          {onUpdate && (
            <span className="edit-controls">
              {editId === s.id ? (
                <>
                  <input
                    className="edit-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onUpdate(s.id, { full_name: editName });
                      setEditId(null);
                    }}
                  >
                    Save
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditId(null);
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
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
