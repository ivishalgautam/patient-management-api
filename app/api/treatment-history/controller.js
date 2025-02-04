"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import slugify from "slugify";
import { deleteFile } from "../../helpers/file.js";
import { sequelize } from "../../db/postgres.js";
import { treatmentHistorySchema } from "../../validation-schemas/treatment.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateHistoryData = treatmentHistorySchema.parse(req.body);
    const treatment = await table.TreatmentModel.getByPk(
      0,
      req.body.treatment_id
    );
    if (!treatment)
      return res
        .code(404)
        .send({ status: false, message: "Treatment not found." });

    let slug = slugify(req.body.name, { lower: true });
    req.body.slug = slug;

    const data = await table.TreatmentHistoryModel.create(req, { transaction });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Treatment history created.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  try {
    let slug = "";
    if (req.body.name) {
      slug = slugify(req.body?.name, { lower: true });
      req.body.slug = slug;
    }

    const record = await table.TreatmentHistoryModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment history not found!" });
    }

    res.send({
      status: true,
      data: await table.TreatmentHistoryModel.update(req),
      message: "Treatment history updated.",
    });
  } catch (error) {
    throw error;
  }
};

const getBySlug = async (req, res) => {
  try {
    const record = await table.TreatmentHistoryModel.getBySlug(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment history not found!" });
    }

    res.send({
      status: true,
      data: await table.TreatmentHistoryModel.getBySlug(req),
    });
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.TreatmentHistoryModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment history not found!" });
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

    const record = await table.TreatmentHistoryModel.getByTreatmentId(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.TreatmentHistoryModel.get(req);
    res.send({ status: true, data: data, total: data?.[0]?.total });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = sequelize.transaction();

  try {
    const record = await table.TreatmentHistoryModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment history not found!" });

    const isTreatmentDeleted = await table.TreatmentHistoryModel.deleteById(
      req,
      req.params.id,
      { transaction }
    );

    if (isTreatmentDeleted) {
      deleteFile(record?.image);
    }

    await transaction.commit();
    res.send({ status: true, message: "Treatment history deleted." });
  } catch (error) {
    await (await transaction).rollback();
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
