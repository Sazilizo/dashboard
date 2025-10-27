import React from "react";
import { Link } from "react-router-dom";
import Photos from "../profiles/Photos";

export default function WorkerListItems({ workers, bucketName = "worker-uploads", folderName = "workers" }) {
  if (!workers || workers.length === 0) return <p>No workers found.</p>;

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
              <p>
                <strong>{`${w.name} ${w.last_name}`}</strong>
              </p>
              <p>role: {w?.roles?.name}</p>
              {w.__queued && (
                <span style={{ color: "orange", marginLeft: 8 }}>
                  (Queued)
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
