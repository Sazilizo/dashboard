import api from "../../api/client";
import imageCompression from "browser-image-compression";

export const UploadFileHelper = async (file, folder, id) => {
  try {
    if (!file) return null;

    // Helper to check if file is an image (including SVG)
    const isImage = file.type.startsWith("image/") || file.type === "image/svg+xml";

    // only accept image or pdf
    if (!isImage && file.type !== "application/pdf") {
      throw new Error("Only images and PDF files are allowed.");
    }

    let uploadFile = file;

    // compress images before upload (skip SVG as it's already optimized)
    if (isImage && file.type !== "image/svg+xml") {
      try {
        const options = {
          maxSizeMB: 0.05, // ~50KB target
          maxWidthOrHeight: 800,
          useWebWorker: true,
        };
        uploadFile = await imageCompression(file, options);

        console.log(
          `Original: ${(file.size / 1024).toFixed(1)} KB → Compressed: ${(uploadFile.size / 1024).toFixed(1)} KB`
        );
      } catch (err) {
        console.warn("Image compression failed, using original file", err);
      }
    }

    const ext = file.name.split(".").pop();
    const uniqueName = `${Date.now()}_${Math.random()
      .toString(36)
      .substring(2)}.${ext}`;

    // ✅ If folder is a known resource, use bucket + folder/id
    // ✅ Otherwise, treat folder as a custom folder inside student-uploads
    let bucketName = "";
    let filePath = "";

    if (folder === "students") {
      bucketName = "student-uploads";
      // images should go into profile-picture subfolder so there is only one main profile image
      if (isImage) {
        // place profile-picture as a child of the record id folder: <folder>/<id>/profile-picture/<file>
        filePath = `${folder}/${id}/profile-picture/${uniqueName}`;
      } else {
        filePath = `${folder}/${id}/${uniqueName}`;
      }
    } else if (folder === "workers") {
      bucketName = "worker-uploads";
      if (isImage) {
        filePath = `${folder}/${id}/profile-picture/${uniqueName}`;
      } else {
        filePath = `${folder}/${id}/${uniqueName}`;
      }
    } else if (folder === "sessions") {
      bucketName = "session-uploads";
      if (isImage) {
        filePath = `${folder}/${id}/profile-picture/${uniqueName}`;
      } else {
        filePath = `${folder}/${id}/${uniqueName}`;
      }
    } else if (folder === "meals") {
      bucketName = "meal-uploads";
      if (isImage) {
        filePath = `${folder}/${id}/profile-picture/${uniqueName}`;
      } else {
        filePath = `${folder}/${id}/${uniqueName}`;
      }
    }else if (folder === "profile-avatars") {
      bucketName = "profile-avatars";
      const ext = file.name.split(".").pop().toLowerCase();
      filePath = `${id}.${ext}`;
      const extensions = ["jpg", "jpeg", "png", "webp"];
      const oldFiles = extensions
        .filter((e) => e !== ext)
        .map((e) => `${id}.${e}`);

      if (oldFiles.length) {
        await api.storage.from(bucketName).remove(oldFiles);
      }

    } else {
      // custom folder (fallback)
      bucketName = "student-uploads";
      if (isImage) {
        filePath = id ? `${folder}/${id}/profile-picture/${uniqueName}` : `${folder}/profile-picture/${uniqueName}`;
      } else {
        filePath = id ? `${folder}/${id}/${uniqueName}` : `${folder}/${uniqueName}`;
      }
    }

    // For images, ensure there is only one main profile-picture for this id: remove existing files in that folder
    if (isImage && id) {
      try {
        // list files under <folder>/<id>/profile-picture
        const listPath = `${folder}/${id}/profile-picture`;
        const { data: existing, error: listErr } = await api.storage.from(bucketName).list(listPath);
        if (!listErr && existing && existing.length) {
          const toRemove = existing.map((f) => `${listPath}/${f.name}`);
          if (toRemove.length) {
            await api.storage.from(bucketName).remove(toRemove);
          }
        }
      } catch (err) {
        console.warn("Failed to cleanup existing profile-picture files:", err);
      }
    }

    // upload file (✅ allow overwrite)
    const { error: uploadError } = await api.storage
      .from(bucketName)
      .upload(filePath, uploadFile, { upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError.message);
      return null;
    }

    // get public url
    const { data: urlData, error: urlError } = api.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    if (urlError) {
      console.error("Get public URL error:", urlError.message);
      return null;
    }

    return urlData?.publicUrl || null;
  } catch (err) {
    console.error("Unexpected upload error:", err.message);
    return null;
  }
};

export default UploadFileHelper;
