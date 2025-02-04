"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { deleteFile } from "../../helpers/file.js";
import { sequelize } from "../../db/postgres.js";
import { bannerSchema } from "../../validation-schemas/banner.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateData = bannerSchema.parse(req.body);
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
  try {
    const record = await table.BannerModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Banner not found!" });
    }

    const data = await table.BannerModel.update(req);

    res.send({ status: true, message: "Banner updated.", data });
  } catch (error) {
    throw error;
  }
};

const getBySlug = async (req, res) => {
  try {
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
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.BannerModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Banner not found!" });
    }

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.BannerModel.get(req);
    res.send({ status: true, data: data, total: data?.[0]?.total });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

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
