import React from "react";
import { Link } from "react-router-dom";
import Photos from "../profiles/Photos";
import { isBirthdayFromId } from "../../utils/birthdayUtils";

export default function WorkerListItems({ workers, bucketName = "worker-uploads", folderName = "workers" }) {
  if (!workers || workers.length === 0) return <p className="no-data-message">No workers found.</p>;

  return (
    <ul className="app-list wave-list">
      {workers.map((w) => (
        <li key={w.id}>
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
                  Role: {w?.roles?.name || '—'}
                  {w.__queued && (
                    <span className="queued-badge">
                      (Queued)
                    </span>
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
        </li>
      ))}
    </ul>
  );
}
