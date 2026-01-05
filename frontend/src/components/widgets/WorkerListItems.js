import React from "react";
import { Link } from "react-router-dom";
import Photos from "../profiles/Photos";
import { isBirthdayFromId } from "../../utils/birthdayUtils";

export default function WorkerListItems({ workers, bucketName = "worker-uploads", folderName = "workers", onSelect }) {
  if (!workers || workers.length === 0) return <p className="no-data-message">No workers found.</p>;

  return (
    <>
      <div className="list-toolbar" style={{ marginBottom: 8 }}>
        {/* <Link to="/dashboard/workers/group-sign" className="btn btn-secondary">
          Group Sign
        </Link> */}
      </div>

      <ul className="app-list wave-list">
        {workers.map((w) => (
          <li key={w.id}>
            {onSelect ? (
              <button
                type="button"
                className="app-list-item-btn"
                onClick={() => onSelect(w)}
                style={{
                  display: 'flex',
                  width: '100%',
                  textAlign: 'left',
                  alignItems: 'center',
                  gap: 12,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer'
                }}
              >
                <div className="app-profile-photo">
                  <Photos
                    bucketName={bucketName}
                    folderName={folderName}
                    id={w.id}
                    photoCount={1}
                    restrictToProfileFolder={true}
                  />
                </div>
                <div className="app-list-item-details">
                  <div className="item-info">
                    <p className="item-name">
                      <strong>{`${w.name} ${w.last_name}`}</strong>
                      {isBirthdayFromId(w.id_number) && (
                        <span className="birthday-badge">🎂 Birthday Today!</span>
                      )}
                    </p>
                    <p className="item-details">
                      Role: {(w?.roles?.name || w.role_name || '—')}
                      {w.__queued && (
                        <span className="queued-badge">(Queued)</span>
                      )}
                    </p>
                    {w.school && (
                      <p className="item-school">
                        School: {w.school.name || w.school_name || '—'}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ) : (
              <Link to={`/dashboard/workers/${w.id}`}>
                <div className="app-profile-photo">
                  <Photos
                    bucketName={bucketName}
                    folderName={folderName}
                    id={w.id}
                    photoCount={1}
                    restrictToProfileFolder={true}
                  />
                </div>
                <div className="app-list-item-details">
                  <div className="item-info">
                    <p className="item-name">
                      <strong>{`${w.name} ${w.last_name}`}</strong>
                      {isBirthdayFromId(w.id_number) && (
                        <span className="birthday-badge">🎂 Birthday Today!</span>
                      )}
                    </p>
                    <p className="item-details">
                      Role: {(w?.roles?.name || w.role_name || '—')}
                      {w.__queued && (
                        <span className="queued-badge">(Queued)</span>
                      )}
                    </p>
                    {w.school && (
                      <p className="item-school">
                        School: {w.school.name || w.school_name || '—'}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
