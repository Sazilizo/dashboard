import React, { useEffect, useState, useRef } from "react";
import api from "../../api/client"; // Supabase client
import JSZip from "jszip";
import { saveAs } from "file-saver";
import "../../styles/imageDownload.css";
import { cacheFiles, getCachedFiles, getDB } from "../../utils/tableCache";

let dbInstance = null;
async function getFastDB() {
  if (dbInstance) return dbInstance;
  dbInstance = await getDB(["cached_files"]);
  return dbInstance;
}

export default function FilesPopup({ bucketName, folderName, id, onClose }) {
  const [files, setFiles] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const observer = useRef(null);

  // ✅ Lazy-load images safely
  const handleLazyLoad = (img) => {
    if (!img || !(img instanceof Element)) return;
    if (!observer.current) {
      observer.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const lazyImg = entry.target;
              lazyImg.src = lazyImg.dataset.src;
              observer.current.unobserve(lazyImg);
            }
          });
        },
        { rootMargin: "200px" }
      );
    }
    observer.current.observe(img);
  };

  useEffect(() => {
    let isCancelled = false;
    const cacheKey = `${bucketName}/${folderName}/${id}`;

    async function fetchFiles() {
      setLoading(true);
      try {
        const db = await getFastDB();
        const cached = await getCachedFiles(cacheKey);

        // ⚡ Instantly show cached version if available
        if (cached?.files?.length) {
          setFiles(cached.files);
          setSignedUrls(cached.signedUrls);
          setLoading(false);
          if (navigator.onLine) refreshFiles(cacheKey); // background refresh
          return;
        }

        // Otherwise load fresh data
        await refreshFiles(cacheKey);
      } catch (err) {
        console.error("Failed to fetch files:", err);
        if (!isCancelled) setError(err.message || "Failed to load files");
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    async function refreshFiles(cacheKey) {
      const basePath = `${folderName}/${id}`;

      // List both document and profile-picture folders concurrently
      const [rootRes, docsRes, profileRes] = await Promise.all([
        api.storage.from(bucketName).list(basePath, { limit: 1000 }),
        api.storage.from(bucketName).list(`${basePath}/documents`, { limit: 1000 }),
        api.storage.from(bucketName).list(`${basePath}/profile-picture`, { limit: 1000 }),
      ]);

      const listErrors = [rootRes.error, docsRes.error, profileRes.error].filter(Boolean);
      if (listErrors.length) throw listErrors[0];

      // Merge files from all folders
      const rootFiles = (rootRes.data || [])
        .filter((f) => f.metadata)
        .map((f) => ({ ...f, fullPath: `${basePath}/${f.name}` }));

      const docFiles = (docsRes.data || [])
        .filter((f) => f.metadata)
        .map((f) => ({ ...f, fullPath: `${basePath}/documents/${f.name}` }));

      const profileFiles = (profileRes.data || [])
        .filter((f) => f.metadata)
        .map((f) => ({ ...f, fullPath: `${basePath}/profile-picture/${f.name}` }));

      const allFiles = [...rootFiles, ...docFiles, ...profileFiles];
      if (!allFiles.length) throw new Error("No files found");

      // ✅ Batch signed URL generation
      const { data: urlBatch, error: urlError } = await api.storage
        .from(bucketName)
        .createSignedUrls(
          allFiles.map((f) => f.fullPath),
          3600
        );

      if (urlError) throw urlError;

      const urls = {};
      urlBatch.forEach((u, i) => {
        if (u?.signedUrl) urls[allFiles[i].fullPath] = u.signedUrl;
      });

      const filesPayload = { files: allFiles, signedUrls: urls };
      await cacheFiles(cacheKey, filesPayload);

      if (!isCancelled) {
        setFiles(allFiles);
        setSignedUrls(urls);
      }
    }

    fetchFiles();
    return () => {
      isCancelled = true;
    };
  }, [bucketName, folderName, id]);

  const toggleSelect = (file) => {
    const newSet = new Set(selectedFiles);
    if (newSet.has(file.fullPath)) newSet.delete(file.fullPath);
    else newSet.add(file.fullPath);
    setSelectedFiles(newSet);
  };

  const handleDownload = async (file) => {
    try {
      const url = signedUrls[file.fullPath];
      if (!url) throw new Error("Signed URL not available");
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = window.URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      window.URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to download file: " + err.message);
    }
  };

  const downloadSelectedAsZip = async () => {
    if (!selectedFiles.size) return alert("No files selected!");
    const zip = new JSZip();
    try {
      const fetches = Array.from(selectedFiles).map(async (path) => {
        const url = signedUrls[path];
        if (!url) return;
        const res = await fetch(url);
        const blob = await res.blob();
        const fileName = path.split("/").pop();
        zip.file(fileName, blob);
      });
      await Promise.all(fetches);
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `files-${id}.zip`);
    } catch (err) {
      console.error("ZIP download failed:", err);
      alert("Failed to download selected files");
    }
  };

  const fileIcon = (name) => {
    const ext = name.split(".").pop().toLowerCase();
    switch (ext) {
      case "pdf": return "📄";
      case "doc":
      case "docx": return "📝";
      case "xlsx": return "📊";
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
      case "webp": return "🖼️";
      default: return "📁";
    }
  };

  if (loading)
    return (
      <div className="popup-overlay">
        <div className="popup-loading">Loading files...</div>
      </div>
    );
  if (error)
    return (
      <div className="popup-overlay">
        <div className="popup-error">Error: {error}</div>
      </div>
    );
  if (!files.length)
    return (
      <div className="popup-overlay">
        <div className="popup-empty">No files found.</div>
      </div>
    );

  return (
    <div className="popup-overlay">
      <div className="popup-content">
        <button className="popup-close" onClick={onClose}>✖</button>
        <h4>Files for {id}</h4>

        <button className="btn btn-primary mb-2" onClick={downloadSelectedAsZip}>
          Download Selected ({selectedFiles.size})
        </button>

        <div className="file-grid">
          {files.map((file) => {
            const url = signedUrls[file.fullPath];
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);

            return (
              <div key={file.fullPath} className="file-item">
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.fullPath)}
                  onChange={() => toggleSelect(file)}
                />
                {isImage && url ? (
                  <img
                    data-src={url}
                    alt={file.name}
                    ref={handleLazyLoad}
                    className="file-preview"
                  />
                ) : (
                  <div className="file-icon">
                    {fileIcon(file.name)} {file.name}
                  </div>
                )}
                <button
                  className="btn btn-secondary btn-sm mt-1"
                  onClick={() => handleDownload(file)}
                >
                  Download
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
