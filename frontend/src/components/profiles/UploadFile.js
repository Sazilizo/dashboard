import React, { useState } from "react";
import UploadFileHelper from "./UploadHelper";

const UploadFile = ({ label, value, onChange, folder = "students", id}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file instanceof File) {
      try {
        file = new File([file], file.name || "upload.dat", {type: file.type  || "application/octet-stream" }); // convert Blob to File
      }catch(err){
        setError("Invalid file, please re-upload.");
        return;
      }
    }
    setLoading(true);
    setError("");

    const url = await UploadFileHelper(file, folder, id);
    if (url) {
      onChange(url); // pass URL back to form
    } else {
      setError("Upload failed. Try again.");
    }
    setLoading(false);
  };

  return (
    <div className="mb-3">
      <label className="block mb-1 font-medium">{label}</label>
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={handleFileChange}
        className="block w-full"
      />
      {loading && <p className="text-sm text-gray-500">Uploading...</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {value && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline text-sm"
        >
          View uploaded file
        </a>
      )}
    </div>
  );
};

export default UploadFile;
