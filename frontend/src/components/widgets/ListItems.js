import React, { useState } from "react";
import { Link } from "react-router-dom";
import Photos from "../profiles/Photos";
import { isBirthday } from "../../utils/birthdayUtils";

export default function ListItems({
  students,
  items,
  onDelete,
  onUpdate,
  resource = "students",
  bucketName = "student-uploads",
  folderName = "students",
  // selection props
  checkbox = false,
  value = [],
  onChange,
}) {
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

  // Support both 'students' and 'items' props for flexibility
  const data = students || items || [];

  if (!data || data.length === 0) return <p className="no-data-message">No {resource} found.</p>;

  const safeValue = Array.isArray(value) ? value.map(String) : [];

  const toggleSelect = (id, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!onChange) return;
    const sid = String(id);
    if (safeValue.includes(sid)) {
      onChange(safeValue.filter((v) => v !== sid));
    } else {
      onChange([...(safeValue || []), sid]);
    }
  };

  return (
    <>
      {resource === 'students' && (
        <div className="list-toolbar" style={{ marginBottom: 8 }}>
          {/* <Link to="/dashboard/students/group-sign" className="btn btn-secondary">
            Group Sign
          </Link> */}
        </div>
      )}

      <ul className="app-list wave-list">
      {data.map((s) => {
        const id = s.id ?? s.value ?? s;
        const strId = String(id);
        return (
          <li key={strId} className="flex items-center justify-between gap-3">
            <Link to={`/dashboard/${resource}/${id}`} className="flex items-center gap-3 flex-1">
              <div className="app-profile-photo">
                <Photos
                  bucketName={bucketName}
                  folderName={folderName}
                  id={id}
                  photoCount={1}
                  restrictToProfileFolder={true}
                />
              </div>
              <div className="app-list-item-details">
                <div className="item-info">
                  <p className="item-name">
                    <strong>{s.full_name || s.name || s.label || s.value}</strong>
                    {isBirthday(s.date_of_birth) && (
                      <span className="birthday-badge">🎂 Birthday Today!</span>
                    )}
                  </p>
                  <p className="item-details">
                    {s.grade && `Grade: ${s.grade}`}
                    {s.category && ` (${s.category})`}
                    {s.group_by && `Group: ${s.group_by}`}
                    {s.__queued && (
                      <span className="queued-badge">(Queued)</span>
                    )}
                  </p>
                  {s.school && (
                    <p className="item-school">School: {s.school.name || s.school_name || '—'}</p>
                  )}
                </div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {checkbox && (
                <label className="flex items-center gap-2 p-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={safeValue.includes(strId)}
                    onChange={(e) => toggleSelect(id, e)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: 'relative', zIndex: 50 }}
                  />
                </label>
              )}

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
            </div>
          </li>
        );
      })}
      </ul>
    </>
  );
}
