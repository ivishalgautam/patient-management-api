import fs from "fs";
import path from "path";

export const saveFile = async (file) => {
  const mime = file.mimetype.split("/").pop();

  const imageMime = ["jpeg", "jpg", "png", "gif"];
  const videoMime = ["mp4", "avi", "mov"];
  const docsMime = ["pdf", "docx", "xlsx"];

  let folder;

  if (imageMime.includes(mime)) {
    folder = "public/images/";
  } else if (videoMime.includes(mime)) {
    folder = "public/videos/";
  } else if (docsMime.includes(mime)) {
    folder = "public/docs/";
  } else {
    folder = "public/";
  }

  fs.mkdirSync(folder, { recursive: true });

  const filename = `${Date.now()}_${file.filename.replace(/[\\s'/]/g, "_").toLowerCase()}`;
  const filepath = path.join(folder, filename);

  await file
    .toBuffer()
    .then((buffer) => fs.promises.writeFile(filepath, buffer));

  return filepath;
};

export const deleteFile = async (filePath) => {
  const fullPath = path.resolve(filePath);

  try {
    await fs.promises.unlink(fullPath); // Delete the file from disk
    console.log(`File deleted: ${filePath}`);
  } catch (err) {
    console.error(`Failed to delete file: ${filePath}`, err);
    throw err; // Optionally, rethrow or log the error
  }
};
