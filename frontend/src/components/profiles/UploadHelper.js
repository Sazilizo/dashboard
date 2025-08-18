import api from "../../api/client";

export const UploadFileHelper = async (file, folder, id) => {
  try {
    if (!file) return null;

    // only accept image or pdf
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      throw new Error("Only images and PDF files are allowed.");
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
    else bucketName = "student-uploads"; // fallback
    // upload file
    const { data: uploadData, error: uploadError } = await api.storage
      .from(bucketName)
      .upload(fileName, file);

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

  