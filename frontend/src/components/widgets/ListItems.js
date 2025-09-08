import React from "react";
import { Link } from "react-router-dom";
import Photos from "../profiles/Photos";

export default function ListItems({ students }) {
  if (!students || students.length === 0) return <p>No students found.</p>;

  return (
    <ul className="app-list">
      {students.map((s) => (
        <li key={s.id}>
          <Link to={`/dashboard/students/${s.id}`}>
            <div className="app-profile-photo">
              <Photos bucketName="student-uploads" folderName="students" id={s.id} photoCount={1} />
            </div>
            <div className="app-list-item-details">
              <p><strong>{s.full_name}</strong></p>
              <p>Grade: {s.grade}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
