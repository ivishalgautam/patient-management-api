"use strict";
import {
  deleteFile as deleteStoredFile,
  uploadFiles,
  getFile,
  resolvePublicPath,
} from "../../utils/file-storage.js";

const upload = async (req, res) => {
  let { path } = await uploadFiles(req);
  res.send(path);
};

const get = async (req, res) => getFile(req, res);

const _delete = async (req, res) => {
  if (!req.query?.file_path) {
    return res
      .code(400)
      .send({ status: false, message: "file_path is required parameter" });
  }

  if (!resolvePublicPath(req.query.file_path)) {
    return res.code(400).send({ status: false, message: "Invalid file_path." });
  }

  // Idempotent: a file that is already gone counts as deleted.
  await deleteStoredFile(req.query.file_path);
  return res.send({ status: true, message: "File deleted." });
};

export default {
  upload: upload,
  get: get,
  _delete: _delete,
};
