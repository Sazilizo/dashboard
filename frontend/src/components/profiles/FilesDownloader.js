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

  // Recursively fetch files under a folder
  async function fetchFilesRecursively(path) {
    try {
      const { data, error } = await api.storage.from(bucketName).list(path, { limit: 1000, offset: 0 });
      if (error) throw error;

      let allFiles = [];
      for (const item of data) {
        if (item.type === "folder") {
          const nestedFiles = await fetchFilesRecursively(`${path}/${item.name}`);
          allFiles = [...allFiles, ...nestedFiles];
        } else {
          allFiles.push({
            name: item.name,
            fullPath: `${path}/${item.name}`
          });
        }
      }
      return allFiles;
    } catch (err) {
      console.error("Error listing files:", err);
      setError(err.message);
      return [];
    }
  }

  useEffect(() => {
    if (!bucketName || !folderName || !id || !isOnline) return;

    const folderPath = `${folderName}/${id}`;
    fetchFilesRecursively(folderPath).then(setFiles);
  }, [bucketName, folderName, id, isOnline]);

  async function downloadAllFiles() {
    if (!isOnline) return alert("You are offline. Please go online to download files.");
    if (!files.length) return alert("No files to download");

    setLoading(true);
    const zip = new JSZip();

    try {
      for (const file of files) {
        // Exact file path for signed URL
        const { signedUrl, error: urlError } = await api.storage.from(bucketName).createSignedUrl(file.fullPath, 60);
        if (urlError) {
          console.warn("Failed to get signed URL for:", file.fullPath, urlError);
          continue;
        }

        const response = await fetch(signedUrl);
        if (!response.ok) {
          console.warn("Failed to fetch file:", file.fullPath, response.status);
          continue;
        }

        const blob = await response.blob();
        // Preserve folder structure inside zip
        const relativePath = file.fullPath.replace(`${folderName}/`, "");
        zip.file(relativePath, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${folderName}-${id}-files.zip`);
    } catch (err) {
      console.error("Failed to download files:", err);
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
