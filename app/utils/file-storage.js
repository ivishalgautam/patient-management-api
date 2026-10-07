"use strict";
// Uploaded files on local disk under ./public, served by the static plugin
// at /public/... Stored paths look like "public/images/<ts>_<name>".
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import constants from "../lib/constants/index.js";

const PUBLIC_ROOT = path.resolve("public");
const { imageMime, videoMime, docsMime } = constants.mime;

const folderFor = (mimetype = "") => {
  const subtype = mimetype.split("/").pop();
  if (imageMime.includes(subtype)) return "public/images/";
  if (videoMime.includes(subtype)) return "public/videos/";
  if (docsMime.includes(subtype) || ["xlsx"].includes(subtype)) return "public/docs/";
  return "public/";
};

const safeName = (filename = "file") =>
  `${Date.now()}_${filename.replace(/[\s'/\\]/g, "_").toLowerCase()}`;

// Absolute path inside ./public, or null for anything that escapes it
// (e.g. "../../.env").
export const resolvePublicPath = (filePath) => {
  if (!filePath || typeof filePath !== "string") return null;
  const resolved = path.resolve(filePath);
  const relative = path.relative(PUBLIC_ROOT, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
};

// Saves one multipart file part; returns its stored path.
export async function saveFile(part) {
  const folder = folderFor(part.mimetype);
  await fs.promises.mkdir(folder, { recursive: true });
  // Forward slashes on every OS: the path doubles as a URL.
  const filePath = path.posix.join(folder, safeName(part.filename));
  await pipeline(part.file, fs.createWriteStream(filePath));
  return filePath;
}

// Reads all parts of a multipart request: files are saved, fields collected.
export async function uploadFiles(req) {
  const paths = [];
  const body = {};
  for await (const part of req.parts()) {
    if (part.type !== "file") {
      body[part.fieldname] = part.value;
      continue;
    }
    paths.push(await saveFile(part));
  }
  return { path: paths, body };
}

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  ogg: "video/ogg",
  webm: "video/webm",
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// GET /v1/upload?file_path=public/...
export async function getFile(req, res) {
  const publicPath = resolvePublicPath(req.query?.file_path);
  if (!publicPath || !fs.existsSync(publicPath)) {
    return res.code(404).send({ status: false, message: "File not found." });
  }
  const ext = path.extname(publicPath).slice(1).toLowerCase();
  if (CONTENT_TYPES[ext]) res.type(CONTENT_TYPES[ext]);
  return fs.readFileSync(publicPath);
}

// Deletes a stored file. Never throws; false if refused or already gone.
export async function deleteFile(filePath) {
  const fullPath = resolvePublicPath(filePath);
  if (!fullPath) return false;
  try {
    await fs.promises.unlink(fullPath);
    return true;
  } catch {
    return false;
  }
}

export async function cleanupFiles(filePaths) {
  for (const filePath of filePaths ?? []) await deleteFile(filePath);
}
