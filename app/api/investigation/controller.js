"use strict";
import { beginTransaction } from "../../db/transaction.js";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { investigationSchema } from "../../validation-schemas/treatment.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const validateData = investigationSchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validateData);
    const treatment = await table.TreatmentModel.getByPk(
      0,
      req.body.treatment_id
    );
    if (!treatment)
      return res
        .code(404)
        .send({ status: false, message: "Treatment not found." });

    const data = await table.InvestigationModel.create(req, { transaction });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Investigation created.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  const transaction = await beginTransaction(req);
  const record = await table.InvestigationModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Investigation not found!" });
  }

  res.send({
    status: true,
    data: await table.InvestigationModel.update(req, 0, { transaction }),
    message: "Investigation updated.",
  });
};

const getBySlug = async (req, res) => {
  const record = await table.InvestigationModel.getBySlug(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Investigation not found!" });
  }

  res.send({
    status: true,
    data: await table.InvestigationModel.getBySlug(req),
  });
};

const getById = async (req, res) => {
  const record = await table.InvestigationModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Investigation not found!" });
  }

  res.send({ status: true, data: record });
};

const getByTreatmentId = async (req, res) => {
  const treatment = await table.TreatmentModel.getByPk(req);
  if (!treatment)
    return res
      .code(404)
      .send({ status: false, message: "Treatment not found." });

  const record = await table.InvestigationModel.getByTreatmentId(req);

  res.send({ status: true, data: record });
};

const get = async (req, res) => {
  const data = await table.InvestigationModel.get(req);
  res.send({ status: true, data: data, total: data?.[0]?.total });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

  try {
    const record = await table.InvestigationModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Investigation not found!" });

    await table.InvestigationModel.deleteById(
      req,
      req.params.id,
      { transaction }
    );

    await transaction.commit();
    res.send({ status: true, message: "Investigation deleted." });
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
