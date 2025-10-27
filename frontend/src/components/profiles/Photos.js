import React, { useEffect, useState } from "react";
import api from "../../api/client"; // supabase client

// restrictToProfileFolder: when true, only list `${folderName}/${id}/profile-picture` with no fallback
function Photos({ id, bucketName, folderName, photoCount = 1, restrictToProfileFolder = true }) {
  const [files, setFiles] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchFilesAndUrls() {
      try {
        const profileFolder = `${folderName}/${id}/profile-picture`;

        // Try to list images from the profile-picture subfolder
        let { data: dataPrimary, error: errorPrimary } = await api.storage
          .from(bucketName)
          .list(profileFolder, { limit: 100 });

        if (errorPrimary) {
          console.warn("Error listing profile pictures:", errorPrimary.message);
          // Treat API errors as actual errors
          setError(errorPrimary.message);
          return;
        }

        // Helper to filter to likely file entries only
        const toImageFiles = (arr) =>
          (arr || [])
            .filter((f) => !!f?.name && f.name !== ".emptyFolderPlaceholder")
            .filter((f) => {
              // If metadata.size exists, it's a file; otherwise, use extension heuristic
              const isFileByMeta = typeof f?.metadata?.size === "number";
              const lower = String(f.name).toLowerCase();
              const isImageExt = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".heic"].some((ext) =>
                lower.endsWith(ext)
              );
              return isFileByMeta || isImageExt;
            });

        let imageFiles = toImageFiles(dataPrimary);

        // Optional fallback: only when explicitly allowed
        if (!restrictToProfileFolder && !imageFiles.length) {
          const recordRoot = `${folderName}/${id}`;
          const { data: dataFallback, error: errorFallback } = await api.storage
            .from(bucketName)
            .list(recordRoot, { limit: 100 });

          if (errorFallback) {
            console.warn("Error listing record root:", errorFallback.message);
            // Don't surface as UI error; just proceed with no photos
          } else {
            imageFiles = toImageFiles(dataFallback);
          }
        }

        if (!imageFiles.length) {
          // No photos is not an error; show graceful placeholder
          setFiles([]);
          setSignedUrls({});
          return;
        }

        // Sort by created_at desc if available, else by name
        const sortedFiles = imageFiles
          .sort((a, b) => (new Date(b.created_at || 0) - new Date(a.created_at || 0)) || (String(b.name).localeCompare(String(a.name))))
          .slice(0, photoCount);

        setFiles(sortedFiles);

        // Create signed URLs per-file (supabase-js v2)
        // Attempt signing in the profile-picture folder
        const paths = sortedFiles.map((f) => `${profileFolder}/${f.name}`);
        const signedResults = await Promise.all(
          paths.map((p) => api.storage.from(bucketName).createSignedUrl(p, 3600))
        );

        const urls = {};
        signedResults.forEach((r, idx) => {
          if (!r.error && r.data?.signedUrl) {
            urls[sortedFiles[idx].name] = r.data.signedUrl;
          }
        });

        // If not restricted and nothing signed yet, fallback to root signing
        if (!restrictToProfileFolder && Object.keys(urls).length === 0) {
          const fallbackPaths = sortedFiles.map((f) => `${folderName}/${id}/${f.name}`);
          const fallbackResults = await Promise.all(
            fallbackPaths.map((p) => api.storage.from(bucketName).createSignedUrl(p, 3600))
          );
          fallbackResults.forEach((r, idx) => {
            if (!r.error && r.data?.signedUrl) {
              urls[sortedFiles[idx].name] = r.data.signedUrl;
            }
          });
        }

        setSignedUrls(urls);
      } catch (err) {
        console.error("Failed to fetch photos:", err);
        setError(err.message);
      }
    }

    if (id && bucketName && folderName) fetchFilesAndUrls();
  }, [id, bucketName, folderName, photoCount, restrictToProfileFolder]);

  if (error) return <div className="text-red-500">Error loading images: {error}</div>;
  if (!files.length) return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded overflow-hidden">
      <span className="text-gray-500 text-sm">No image</span>
    </div>
  );

  return (
    <div className="">
      {files.map((file) => {
        const url = signedUrls[file.name];
        if (!url) return null;
        return (
          <div
            key={file.name}
            className=""
          >
            <img
              src={url}
              alt={file.name}
              loading="lazy"
              className=""
            />
          </div>
        );
      })}
    </div>
  );
}

export default Photos;
