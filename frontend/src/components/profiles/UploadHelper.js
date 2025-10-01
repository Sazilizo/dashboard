import api from "../../api/client";
import imageCompression from "browser-image-compression";

export const UploadFileHelper = async (file, folder, id) => {
  try {
    if (!file) return null;

    // only accept image or pdf
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      throw new Error("Only images and PDF files are allowed.");
    }

    let uploadFile = file;

    // compress images before upload
    if (file.type.startsWith("image/")) {
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
      filePath = `${folder}/${id}/${uniqueName}`;
    } else if (folder === "workers") {
      bucketName = "worker-uploads";
      filePath = `${folder}/${id}/${uniqueName}`;
    } else if (folder === "sessions") {
      bucketName = "session-uploads";
      filePath = `${folder}/${id}/${uniqueName}`;
    } else if (folder === "meals") {
      bucketName = "meal-uploads";
      filePath = `${folder}/${id}/${uniqueName}`;
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
      filePath = id ? `${folder}/${id}/${uniqueName}` : `${folder}/${uniqueName}`;
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
