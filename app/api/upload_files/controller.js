"use strict";
import { ErrorHandler } from "../../helpers/error-handler.js";
import {
  deleteFile as deleteStoredFile,
  uploadFiles,
  getFile,
} from "../../helpers/file.js";

const upload = async (req, res) => {
  let { path } = await uploadFiles(req);
  res.send(path);
};

const get = async (req, res) => {
  res.send(await getFile(req, res));
};

const _delete = async (req, res) => {
  const filePath = !req.query || !req.query.file_path;
  if (filePath) {
    return res.send({
      message: "file_path is required parameter",
    });
  }

  deleteStoredFile(req.query.file_path);
};

export default {
  upload: upload,
  get: get,
  _delete: _delete,
};
