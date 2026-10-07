import path from "path";
import fs from "fs";
import pump from "pump";

import constants from "../lib/constants/index.js";
const { imageMime, videoMime, docsMime } = constants.mime;


export const uploadFiles = async (req, isFileUpload = false) => {
  const path = [];
  const body = {};
  const parts = req.parts();
  for await (const file of parts) {
    if (file.type !== "file") {
      body[file.fieldname] = file.value;
      continue;
    }

    let folder;
    const mime = file.mimetype.split("/").pop();
    if (imageMime.includes(mime)) {
      folder = "public/images/";
    } else if (videoMime.includes(mime)) {
      folder = "public/videos/";
    } else if (docsMime.includes(mime)) {
      folder = "public/docs/";
    } else {
      folder = "public/";
    }

    const filename = file.filename.replace(/[\s'/]/g, "_").toLowerCase();
    const filePath = `${folder}${Date.now()}_${filename}`;

    await fs.promises.mkdir(folder, { recursive: true });
    const url = await pump(file.file, fs.createWriteStream(filePath)).path;
    path.push(url);
  }

  return { path, body };
};

// Uploaded files live under <cwd>/public. Any path that resolves outside
// that folder (e.g. "../../.env") is rejected.
const PUBLIC_ROOT = path.resolve("public");

export const resolvePublicPath = (filePath) => {
  if (!filePath || typeof filePath !== "string") return null;
  const resolved = path.resolve(filePath);
  const relative = path.relative(PUBLIC_ROOT, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
};

export const getFile = async (req, res) => {
  const publicPath = resolvePublicPath(req.query?.file_path);
  if (!publicPath || !fs.existsSync(publicPath)) {
    return res.code(404).send({ status: false, message: "File not found." });
  }

  let mime = req.query.file_path.split(".").pop().toLowerCase();
  if (["jpeg", "jpg", "png", "gif", "webp"].includes(mime)) {
    if (mime === "jpg") {
      res.type(`image/jpeg`);
    } else {
      res.type(`image/${mime}`);
    }
  }
  if (["mp4", "mpeg", "ogg", "webm"].includes(mime)) {
    res.type(`video/${mime}`);
  }
  if (mime === "pdf") {
    res.type("application/pdf");
  }
  if (mime === "ppt") {
    res.type("application/vnd.ms-powerpoint");
  }

  if (mime === "docx") {
    res.type(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  }

  if (mime === "doc") {
    res.type("application/msword");
  }

  return fs.readFileSync(publicPath);
};

export const deleteFile = async (filePath) => {
  const fullPath = resolvePublicPath(filePath);
  if (!fullPath) {
    console.error(`Refusing to delete file outside public/: ${filePath}`);
    return false;
  }

  try {
    await fs.promises.unlink(fullPath);
    return true;
  } catch (err) {
    console.error(`Failed to delete file: ${filePath}`, err.message);
    return false;
  }
};
