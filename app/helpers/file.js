import path from "path";
import fs from "fs";
import pump from "pump";
import { dirname } from "path";
import { fileURLToPath } from "url";

import constants from "../lib/constants/index.js";
import { ErrorHandler } from "./error-handler.js";
const { imageMime, videoMime, docsMime } = constants.mime;

export const uploadFiles = async (req, isFileUpload = false) => {
  const path = [];
  const body = {};
  const parts = req.parts();

  for await (const file of parts) {
    console.log({ file });
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
    path.push(await pump(file.file, fs.createWriteStream(filePath)).path);
  }

  return { path, body };
};

export const getFile = async (req, res) => {
  if (!req.query || !req.query.file_path) {
    return ErrorHandler({
      code: 404,
      message: "file_path is required parameter",
    });
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDirPath = dirname(currentFilePath);
  const publicPath = path.join(currentDirPath, "../../", req.query.file_path);

  if (!fs.existsSync(publicPath)) {
    return ErrorHandler({ code: 500, message: "file not found" });
  }

  let mime = req.query.file_path.split(".").pop();
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
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  }

  if (mime === "doc") {
    res.type("application/msword");
  }

  const filePath = fs.readFileSync(publicPath);

  return filePath;
};

export const deleteFile = (filepath) => {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDirPath = dirname(currentFilePath);
  const publicPath = path.join(currentDirPath, "../../", filepath);

  if (fs.existsSync(publicPath)) {
    fs.unlinkSync(publicPath);
    console.log("file deleted");
  } else {
    console.log("File not found!");
  }
};
