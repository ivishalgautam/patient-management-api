"use strict";
import { beginTransaction } from "../../db/transaction.js";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import slugify from "slugify";
import { deleteFile } from "../../utils/file-storage.js";
import { treatmentHistorySchema } from "../../validation-schema/treatment.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const validateHistoryData = treatmentHistorySchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validateHistoryData);
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
};

const getBySlug = async (req, res) => {
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
};

const getById = async (req, res) => {
  const record = await table.TreatmentHistoryModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Treatment history not found!" });
  }

  res.send({ status: true, data: record });
};

const getByTreatmentId = async (req, res) => {
  const treatment = await table.TreatmentModel.getByPk(req);
  if (!treatment)
    return res
      .code(404)
      .send({ status: false, message: "Treatment not found." });

  const record = await table.TreatmentHistoryModel.getByTreatmentId(req);

  res.send({ status: true, data: record });
};

const get = async (req, res) => {
  const data = await table.TreatmentHistoryModel.get(req);
  res.send({ status: true, data: data, total: data?.[0]?.total });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

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
