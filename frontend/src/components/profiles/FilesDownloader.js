import React, { useEffect, useState } from "react";
import api from "../../api/client";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import JSZip from "jszip";
import { saveAs } from "file-saver";

function FilesDownloader({ bucketName, folderName, id }) {
  const { isOnline } = useOnlineStatus();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchFiles() {
      if (!isOnline) return;
      try {
        const { data, error } = await api.storage
          .from(bucketName)
          .list(`${folderName}/${id}`);
        if (error) throw error;
        setFiles(data);
      } catch (err) {
        setError(err.message);
      }
    }
    if (bucketName && folderName && id) fetchFiles();
  }, [bucketName, folderName, id]);

  async function downloadAllFiles() {
    if (!isOnline) return alert("You are offline. Please go online to download files.");
    if (!files.length) return alert("No files to download");

    setLoading(true);
    const zip = new JSZip();

    try {
      for (const file of files) {
        const { signedUrl, error: urlError } = await api.storage
          .from(bucketName)
          .createSignedUrl(`${folderName}/${id}/${file.name}`, 60);

        if (urlError) {
          console.warn("Failed to get signed URL for:", file.name, urlError);
          continue;
        }

        const response = await fetch(signedUrl);
        const blob = await response.blob();

        zip.file(file.name, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${folderName}-${id}-files.zip`);
    } catch (err) {
      setError("Failed to download files: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  if (error) return <div>Error loading files: {error}</div>;
  if (!files.length) return <div>No files found.</div>;

  return (
    <div>
      <p>{files.length} file(s) found.</p>
      <button onClick={downloadAllFiles} disabled={loading}>
        {loading ? "Preparing download..." : "Download All Files"}
      </button>
    </div>
  );
}

export default FilesDownloader;
