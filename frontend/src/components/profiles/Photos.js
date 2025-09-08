import React, { useEffect, useState } from "react";
import api from "../../api/client"; // supabase client

function Photos({ id, bucketName, folderName, photoCount = 5 }) {
  const [files, setFiles] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchFilesAndUrls() {
      try {
        const { data, error } = await api.storage
          .from(bucketName)
          .list(`${folderName}/${id}`);

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
        const paths = sortedFiles.map((f) => `${folderName}/${id}/${f.name}`);
        const { data: urlsData, error: urlError } = await api.storage
          .from(bucketName)
          .createSignedUrls(paths, 60);

        if (urlError) throw urlError;

        // Map file names to signed URLs
        const urls = {};
        urlsData.forEach((u, idx) => {
          urls[sortedFiles[idx].name] = u.signedUrl;
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
