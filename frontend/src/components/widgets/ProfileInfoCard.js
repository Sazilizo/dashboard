import React from "react";
import Photos from "../profiles/Photos";
import FilesDownloader from "../profiles/FilesDownloader";
import "../../styles/Profile.css";
const ProfileInfoCard = ({ data, bucketName, folderName}) => {
  return (
    <div className="profile-details-card">
        <div className="profile-image">
            <Photos bucketName="student-uploads" folderName="students" id={data.id} photoCount={1} />
        </div>
        <div className="profile-details">
            <div className="school-info">
                <h4>{data.full_name || `${data.name} ${data.last_name} `}</h4>
                <h5>{data?.school?.name}</h5>
            </div>
            <div className="profile-card-body">
                {data.grade && <p>Grade: {data.grade} ({data.category})</p>}
                <p>Age: {data?.age}</p>
                <p>contact: {data?.contact || data.contact_number}</p>
                {/* <p><RenderIcons name="pe"/>:{student?.contact}</p> */}
                {data.date_of_birth ? <p>DOB: {data.date_of_birth}</p>: <p>ID: {data?.id_number}</p>}
                {data.physical_education && <p>pe: {data.physical_education ? "Yes" : "No"}</p>}
            </div>
            <div className="documents">
                <FilesDownloader bucketName={bucketName} folderName={folderName} id={data.id} />
            </div>
        </div>
    </div>
  );
}

export default ProfileInfoCard;