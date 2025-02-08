import { saveFile } from "../../helpers/multer.js";

export const multipartPreHandler = async (req, reply, checkForArrays = []) => {
  const parts = req.parts();
  const body = {};
  const filePaths = [];

  for await (const part of parts) {
    if (part.file) {
      const filePath = await saveFile(part);
      filePaths.push(filePath);
    } else {
      checkForArrays.includes(part.fieldname)
        ? (body[part.fieldname] = JSON.parse(part.value))
        : (body[part.fieldname] = part.value);
    }
  }

  // Attach parsed body and file paths to the request
  req.body = body;
  req.filePaths = filePaths;
};
