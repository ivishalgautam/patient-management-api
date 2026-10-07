"use strict";
import { beginTransaction } from "../../db/transaction.js";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { treatmentPlanSchema } from "../../validation-schema/treatment.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const validatePlanData = treatmentPlanSchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validatePlanData);
    const treatment = await table.TreatmentModel.getByPk(
      0,
      req.body.treatment_id
    );
    if (!treatment)
      return res
        .code(404)
        .send({ status: false, message: "Treatment not found." });

    const data = await table.TreatmentPlanModel.create(req, { transaction });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Treatment plan created.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const record = await table.TreatmentPlanModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment plan not found!" });
    }

    const data = await table.TreatmentPlanModel.update(req, 0, { transaction });
    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Treatment plan updated.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getBySlug = async (req, res) => {
  const record = await table.TreatmentPlanModel.getBySlug(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Treatment plan not found!" });
  }

  res.send({
    status: true,
    data: await table.TreatmentPlanModel.getBySlug(req),
  });
};

const getById = async (req, res) => {
  const record = await table.TreatmentPlanModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Treatment plan not found!" });
  }

  res.send({ status: true, data: record });
};

const getByPatientId = async (req, res) => {
  const patient = await table.PatientModel.getById(req);
  if (!patient)
    return res
      .code(404)
      .send({ status: false, message: "Patient not found." });

  const record = await table.TreatmentPlanModel.getByPatientId(req);

  res.send({ status: true, data: record });
};

const getByTreatmentId = async (req, res) => {
  const patient = await table.TreatmentModel.getById(req);
  if (!patient)
    return res
      .code(404)
      .send({ status: false, message: "Patient not found." });

  const record = await table.TreatmentPlanModel.getByTreatmentId(req);

  res.send({ status: true, data: record });
};

const get = async (req, res) => {
  const data = await table.TreatmentPlanModel.get(req);
  res.send({ status: true, data: data, total: data?.[0]?.total });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

  try {
    const record = await table.TreatmentPlanModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment plan not found!" });

    await table.TreatmentPlanModel.deleteById(
      req,
      req.params.id,
      { transaction }
    );

    await transaction.commit();
    res.send({ status: true, message: "Treatment plan deleted." });
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
  getByPatientId: getByPatientId,
  getByTreatmentId: getByTreatmentId,
};
