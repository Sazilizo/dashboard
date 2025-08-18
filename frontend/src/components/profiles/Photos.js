import React, { useEffect, useState } from "react";
import api from "../../api/client"; // your supabase client

function Photos({ id, bucketName, folderName }) {
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
        setFiles(data || []);

        // For each file, get signed URL
        const urls = {};
        for (const file of data) {
          const { data: urlData, error: urlError } = await api.storage
            .from(bucketName)
            .createSignedUrl(`${folderName}/${id}/${file.name}`, 60);
          if (urlError) {
            console.error("URL error for file:", file.name, urlError);
            urls[file.name] = null;
          } else {
            urls[file.name] = urlData.signedUrl;
          }
        }
        setSignedUrls(urls);
      } catch (err) {
        setError(err.message);
      }
    }

    if (id) fetchFilesAndUrls();
  }, [id]);

  if (error) return <div>Error loading images: {error}</div>;
  if (!files.length) return <div>No photos found</div>;

  return (
    <div>
      {files.map((file) => {
        const url = signedUrls[file.name];
        if (!url) return null;
        return (
          <img
            key={file.id}
            src={url}
            alt={file.name}
            style={{ maxWidth: "200px", margin: "0.5rem" }}
          />
        );
      })}
    </div>
  );
}

export default Photos;
