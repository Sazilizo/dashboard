import React, { useEffect, useState, useMemo } from "react";
import api from "../../api/client"; // Supabase client instance

function Photos({ id, bucketName, folderName, photoCount = 5, pageSize = 20 }) {
  const [files, setFiles] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // configurable subfolders — just add more here if needed
  const subfolders = useMemo(() => ["", "profile-pictures", "documents"], []);

  useEffect(() => {
    if (!id || !bucketName || !folderName) return;

    async function fetchAllFiles() {
      setLoading(true);
      setError(null);

      try {
        // 1️⃣ List all folders concurrently
        const listPromises = subfolders.map(async (sub) => {
          const path = sub ? `${folderName}/${id}/${sub}` : `${folderName}/${id}`;
          const { data, error } = await api.storage.from(bucketName).list(path);

          if (error) {
            console.warn(`Error listing ${path}:`, error.message);
            return [];
          }

          return (data || []).map((file) => ({
            ...file,
            path: `${path}/${file.name}`,
            subfolder: sub || "root",
          }));
        });

        const results = await Promise.all(listPromises);
        const allFiles = results.flat();

        if (!allFiles.length) {
          setFiles([]);
          setHasMore(false);
          setLoading(false);
          return;
        }

        // 2️⃣ Sort newest first
        const sorted = allFiles.sort((a, b) => {
          if (a.created_at && b.created_at) {
            return new Date(b.created_at) - new Date(a.created_at);
          }
          return b.name.localeCompare(a.name);
        });

        setHasMore(sorted.length > pageSize);
        setFiles(sorted);
      } catch (err) {
        console.error("❌ Failed to fetch files:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchAllFiles();
  }, [id, bucketName, folderName, subfolders, pageSize]);

  // 🧠 Paginated slice
  const currentPageFiles = useMemo(() => {
    const end = page * pageSize;
    const slice = files.slice(0, end);
    setHasMore(files.length > end);
    return slice;
  }, [files, page, pageSize]);

  // 3️⃣ Fetch signed URLs for currently visible files only
  useEffect(() => {
    if (!currentPageFiles.length) return;

    async function fetchSignedUrls() {
      try {
        const filePaths = currentPageFiles.map((f) => f.path);
        const { data: signedBatch, error: batchError } = await api.storage
          .from(bucketName)
          .createSignedUrls(filePaths, 60 * 10); // valid for 10 min

        if (batchError) throw new Error(batchError.message);

        const urlsMap = {};
        signedBatch.forEach((item, i) => {
          if (item?.signedUrl) urlsMap[filePaths[i]] = item.signedUrl;
        });

        setSignedUrls((prev) => ({ ...prev, ...urlsMap }));
      } catch (err) {
        console.error("Signed URL fetch error:", err);
        setError(err.message);
      }
    }

    fetchSignedUrls();
  }, [currentPageFiles, bucketName]);

  // 🧩 Group files by folder
  const groupedFiles = useMemo(() => {
    return subfolders.reduce((acc, sub) => {
      acc[sub || "root"] = currentPageFiles.filter(
        (f) => f.subfolder === (sub || "root")
      );
      return acc;
    }, {});
  }, [currentPageFiles, subfolders]);

  if (loading) return <div className="text-gray-500 animate-pulse">Loading files...</div>;
  if (error) return <div className="text-red-500">Error: {error}</div>;
  if (!files.length) return <div>No files found.</div>;

  return (
    <div className="space-y-6">
      {Object.entries(groupedFiles).map(([sub, group]) =>
        group.length ? (
          <div key={sub}>
            <h3 className="text-lg font-semibold capitalize mb-2">
              {sub === "root" ? "General Files" : sub.replace("-", " ")}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {group.map((file) => {
                const url = signedUrls[file.path];
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
                return (
                  <div
                    key={file.path}
                    className="border rounded-xl p-2 shadow-sm hover:shadow-md transition bg-white"
                  >
                    {isImage && url ? (
                      <img
                        src={url}
                        alt={file.name}
                        loading="lazy"
                        className="w-full h-40 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-40 bg-gray-50 rounded-lg text-gray-600">
                        📄 <span className="truncate text-xs">{file.name}</span>
                      </div>
                    )}
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-blue-600 mt-1 text-center truncate"
                      >
                        {file.name}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null
      )}

      {/* Pagination control */}
      {hasMore && (
        <div className="text-center mt-4">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}

export default Photos;
