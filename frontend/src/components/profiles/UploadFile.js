import React, { useState, useEffect } from "react";
import UploadFileHelper from "./UploadHelper";

const UploadFile = ({ label, value, onChange, folder, id }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState(null); // store file if id isn't ready yet

  const tryUpload = async (file, currentId) => {
    if (!file || !currentId) return;

    setLoading(true);
    setError("");

    const url = await UploadFileHelper(file, folder, currentId);

    if (url) {
      onChange(url);
      setPendingFile(null); // clear once uploaded
    } else {
      setError("Upload failed. Try again.");
    }

    setLoading(false);
  };

  const handleFileChange = async (e) => {
    let file = e.target.files?.[0];
    if (!file) return;

    if (!(file instanceof File)) {
      try {
        file = new File([file], file.name || "upload.dat", {
          type: file.type || "application/octet-stream",
        });
      } catch (err) {
        setError("Invalid file, please re-upload.");
        return;
      }
    }

    if (!id) {
      // no id yet → stash file until id is available
      setPendingFile(file);
      setError("Waiting for record ID before uploading...");
    } else {
      await tryUpload(file, id);
    }
  };

  // 🔄 Retry upload automatically once id becomes available
  useEffect(() => {
    if (pendingFile && id) {
      tryUpload(pendingFile, id);
    }
  }, [id, pendingFile]);

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
