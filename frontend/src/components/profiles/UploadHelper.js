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
    const fileName = `${folder}/${id}/${Date.now()}_${Math.random()
      .toString(36)
      .substring(2)}.${ext}`;

    // pick bucket
    let bucketName = "";
    if (folder === "students") bucketName = "student-uploads";
    else if (folder === "workers") bucketName = "worker-uploads";
    else if (folder === "sessions") bucketName = "session-uploads";
    else if (folder === "meals") bucketName = "meal-uploads";
    else bucketName = "student-uploads"; // fallback

    // upload file
    const { error: uploadError } = await api.storage
      .from(bucketName)
      .upload(fileName, uploadFile);

    if (uploadError) {
      console.error("Upload error:", uploadError.message);
      return null;
    }

    // get public url
    const { data: urlData, error: urlError } = api.storage
      .from(bucketName)
      .getPublicUrl(fileName);

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
