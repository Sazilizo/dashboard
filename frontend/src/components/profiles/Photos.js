import React, { useEffect, useState } from "react";
import api from "../../api/client"; // supabase client

function Photos({ id, bucketName, folderName, photoCount = 5 }) {
  const [files, setFiles] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchFilesAndUrls() {
      try {
        // List images from profile-picture subfolder inside the record id folder
        const listPath = `${folderName}/${id}/profile-picture`;
        const { data, error } = await api.storage
          .from(bucketName)
          .list(listPath);

        if (error) {
          setError(error.message);
          return;
        }

        // Sort files by created_at descending if available, then slice
        const sortedFiles = (data || [])
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, photoCount);

        setFiles(sortedFiles);

        // Batch signed URLs for efficiency
        const paths = sortedFiles.map((f) => `${folderName}/${id}/profile-picture/${f.name}`);
        // create signed URLs per-file (supabase-js v2)
        const signedResults = await Promise.all(paths.map((p) => api.storage.from(bucketName).createSignedUrl(p, 60)));
        const urls = {};
        signedResults.forEach((r, idx) => {
          if (!r.error) urls[sortedFiles[idx].name] = r.data?.signedUrl || null;
        });
        setSignedUrls(urls);
      } catch (err) {
        console.error("Failed to fetch photos:", err);
        setError(err.message);
      }
    }

    if (id) fetchFilesAndUrls();
  }, [id, bucketName, folderName, photoCount]);

  if (error) return <div className="text-red-500">Error loading images: {error}</div>;
  if (!files.length) return <div>No photos found</div>;

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
