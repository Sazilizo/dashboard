import React, { useState } from "react";
import Photos from "../profiles/Photos";
import { isBirthday } from "../../utils/birthdayUtils";

// Non-linking selectable list — mirrors styling of ListItems/WorkerListItems
// but does not use <Link>. Clicking an item or its checkbox selects it
// without navigating to the profile page. Use for selection flows (attendance, training).
export default function SelectableList({
  students,
  items,
  onDelete,
  onUpdate,
  onSelect, // optional single-select callback (id)
  resource = "students",
  bucketName = "student-uploads",
  folderName = "students",
  checkbox = false,
  value = [],
  onChange,
}) {
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

  const data = students || items || [];
  if (!data || data.length === 0) return <p className="no-data-message">No {resource} found.</p>;

  const safeValue = Array.isArray(value) ? value.map(String) : [];

  const toggleSelect = (id, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!onChange) return;
    const sid = String(id);
    if (safeValue.includes(sid)) onChange(safeValue.filter((v) => v !== sid));
    else onChange([...(safeValue || []), sid]);
  };

  const handleItemClick = (s, e) => {
    // If checkbox mode, toggle selection
    if (checkbox) {
      toggleSelect(s.id ?? s.value ?? s, e);
    }
    // Fire optional single-select callback
    if (typeof onSelect === "function") onSelect(s.id ?? s.value ?? s);
  };

  return (
    <ul className="app-list wave-list">
      {data.map((s) => {
        const id = s.id ?? s.value ?? s;
        const strId = String(id);
        return (
          <li key={strId} className="flex items-center justify-between gap-3">
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => handleItemClick(s, e)}
              onKeyPress={(e) => { if (e.key === 'Enter') handleItemClick(s, e); }}
              className="flex items-center gap-3 flex-1 cursor-pointer"
            >
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
            </div>

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
  );
}
