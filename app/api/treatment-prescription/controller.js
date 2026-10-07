"use strict";
import { beginTransaction } from "../../db/transaction.js";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { deleteFile } from "../../helpers/file.js";
import { treatmentPrescriptionSchema } from "../../validation-schemas/treatment.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const validatePrescriptionData = treatmentPrescriptionSchema.parse(
      req.body
    );
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validatePrescriptionData);
    const treatment = await table.TreatmentModel.getByPk(
      0,
      req.body.treatment_id
    );
    if (!treatment)
      return res
        .code(404)
        .send({ status: false, message: "Treatment not found." });

    const data = await table.TreatmentPrescriptionModel.create(req, {
      transaction,
    });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Treatment prescription created.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  const record = await table.TreatmentPrescriptionModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Treatment prescription not found!" });
  }

  res.send({
    status: true,
    data: await table.TreatmentPrescriptionModel.update(req),
    message: "Treatment prescription updated.",
  });
};

const getBySlug = async (req, res) => {
  const record = await table.TreatmentPrescriptionModel.getBySlug(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Treatment prescription not found!" });
  }

  res.send({
    status: true,
    data: await table.TreatmentPrescriptionModel.getBySlug(req),
  });
};

const getById = async (req, res) => {
  const record = await table.TreatmentPrescriptionModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Treatment prescription not found!" });
  }

  res.send({ status: true, data: record });
};

const getByTreatmentId = async (req, res) => {
  const treatment = await table.TreatmentModel.getByPk(req);
  if (!treatment)
    return res
      .code(404)
      .send({ status: false, message: "Treatment not found." });

  const record = await table.TreatmentPrescriptionModel.getByTreatmentId(req);

  res.send({ status: true, data: record });
};

const get = async (req, res) => {
  const data = await table.TreatmentPrescriptionModel.get(req);
  res.send({ status: true, data: data, total: data?.[0]?.total });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

  try {
    const record = await table.TreatmentPrescriptionModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment prescription not found!" });

    const isTreatmentDeleted =
      await table.TreatmentPrescriptionModel.deleteById(req, 0, {
        transaction,
      });

    await transaction.commit();
    res.send({ status: true, message: "Treatment prescription deleted." });
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
