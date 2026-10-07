"use strict";
import { beginTransaction } from "../../db/transaction.js";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { deleteFile } from "../../utils/file-storage.js";
import { bannerSchema } from "../../validation-schema/banner.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const validateData = bannerSchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validateData);
    const data = await table.BannerModel.create(req, { transaction });

    await transaction.commit();
    res.send({ status: true, data: data, message: "Banner created." });
  } catch (error) {
    await transaction.rollback();
    req.body.url && deleteFile(req.body.url);
    throw error;
  }
};

const updateById = async (req, res) => {
  const record = await table.BannerModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Banner not found!" });
  }

  const data = await table.BannerModel.update(req);

  res.send({ status: true, message: "Banner updated.", data });
};

const getBySlug = async (req, res) => {
  const record = await table.BannerModel.getBySlug(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Banner not found!" });
  }

  res.send({
    status: true,
    data: await table.BannerModel.getBySlug(req),
  });
};

const getById = async (req, res) => {
  const record = await table.BannerModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Banner not found!" });
  }

  res.send({ status: true, data: record });
};

const get = async (req, res) => {
  const data = await table.BannerModel.get(req);
  res.send({ status: true, data: data, total: data?.[0]?.total });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

  try {
    const record = await table.BannerModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Banner not found!" });

    const isBannerDeleted = await table.BannerModel.deleteById(req, 0, {
      transaction,
    });

    if (isBannerDeleted) {
      try {
        deleteFile(record?.url); // Move within the transaction context
      } catch (error) {
        throw new Error(`File deletion failed: ${error.message}`);
      }
    }
    await transaction.commit();
    res.send({ status: true, message: "Banner deleted." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export default {
  create: create,
  get: get,
  updateById: updateById,
  deleteById: deleteById,
  getBySlug: getBySlug,
  getById: getById,
};
