"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { xraySchema } from "../../validation-schemas/treatment.schema.js";
import { deleteFile } from "../../helpers/file.js";
import { cleanupFiles } from "../../helpers/cleanup-files.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  console.log("isMultipart", req.isMultipart());
  try {
    req.body.files = req.filePaths;
    const validateData = xraySchema.parse(req.body);
    const treatment = await table.TreatmentModel.getByPk(
      0,
      req.body.treatment_id
    );
    if (!treatment)
      return res
        .code(404)
        .send({ status: false, message: "Treatment not found." });

    const data = await table.XrayModel.create(req, { transaction });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Xray created.",
    });
  } catch (error) {
    await transaction.rollback();
    await cleanupFiles(req.filePaths);
    throw error;
  }
};

const updateById = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const record = await table.XrayModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Xray not found!" });
    }

    // Handle document deletion
    const existingDocuments = record.filePaths;
    const documentsToDelete = existingDocuments.filter(
      (doc) => !req.body.filePaths?.includes(doc)
    );

    // console.log({ existingDocuments, documentsToDelete });

    res.send({
      status: true,
      data: await table.XrayModel.update(req, 0, { transaction }),
      message: "Xray updated.",
    });
  } catch (error) {
    throw error;
  }
};

const getBySlug = async (req, res) => {
  try {
    const record = await table.XrayModel.getBySlug(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Xray not found!" });
    }

    res.send({
      status: true,
      data: await table.XrayModel.getBySlug(req),
    });
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.XrayModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Xray not found!" });
    }

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getByTreatmentId = async (req, res) => {
  try {
    const treatment = await table.TreatmentModel.getByPk(req);
    if (!treatment)
      return res
        .code(404)
        .send({ status: false, message: "Treatment not found." });

    const record = await table.XrayModel.getByTreatmentId(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.XrayModel.get(req);
    res.send({ status: true, data: data, total: data?.[0]?.total });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const record = await table.XrayModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Xray not found!" });

    const isDeleted = await table.XrayModel.deleteById(req, req.params.id, {
      transaction,
    });

    if (isDeleted) {
      cleanupFiles(record.files);
    }
    await transaction.commit();
    res.send({ status: true, message: "Xray deleted." });
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
  getByTreatmentId: getByTreatmentId,
};
