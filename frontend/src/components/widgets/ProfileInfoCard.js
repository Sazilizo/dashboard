import React, { useState } from "react";
import Photos from "../profiles/Photos";
import FilesPopup from "../profiles/FilesPopup"; // <-- our popup component
import "../../styles/Profile.css";

const ProfileInfoCard = ({ data, bucketName, folderName }) => {
  const [showFilesPopup, setShowFilesPopup] = useState(false);

  return (
    <div className="profile-details-card">
      <div className="profile-image">
        <Photos
          bucketName={bucketName}
          folderName={folderName}
          id={data.id}
          photoCount={1}
          restrictToProfileFolder={true}
        />
      </div>

      <div className="profile-details">
        <div className="school-info">
          <h4>{data.full_name || `${data.name} ${data.last_name}`}</h4>
          <h5>{data?.school?.name}</h5>
        </div>

        <div className="profile-card-body">
          {data.grade && <p>Grade: {data.grade} ({data.category})</p>}
          <p>Age: {data?.age}</p>
          <p>Contact: {data?.contact || data.contact_number}</p>
          {data.date_of_birth ? <p>DOB: {data.date_of_birth}</p> : <p>ID: {data?.id_number}</p>}
          {data.physical_education && <p>PE: {data.physical_education ? "Yes" : "No"}</p>}
        </div>

        <div className="documents">
          <button className="btn btn-secondary" onClick={() => setShowFilesPopup(true)}>
            View / Download Files
          </button>
        </div>
      </div>

      {showFilesPopup && (
        <FilesPopup
          bucketName={bucketName}
          folderName={folderName}
          id={data.id}
          onClose={() => setShowFilesPopup(false)}
        />
      )}
    </div>
  );
};

export default ProfileInfoCard;
