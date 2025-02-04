import { deleteFile } from "./multer.js";

export const cleanupFiles = async (filePaths) => {
  for (const filePath of filePaths) {
    try {
      await deleteFile(filePath);
    } catch (err) {
      console.error(`Failed to delete file: ${filePath}`, err);
    }
  }
};
