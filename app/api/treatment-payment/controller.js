"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { treatmentPaymentSchema } from "../../validation-schemas/treatment.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validate = treatmentPaymentSchema.parse(req.body);
    const treatment = await table.TreatmentModel.getByPk(
      0,
      req.body.treatment_id
    );
    if (!treatment)
      return res
        .code(404)
        .send({ status: false, message: "Treatment not found." });

    const data = await table.TreatmentPaymentModel.create(req, {
      transaction,
    });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Treatment payment created.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  try {
    const record = await table.TreatmentPaymentModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment payment not found!" });
    }

    res.send({
      status: true,
      data: await table.TreatmentPaymentModel.update(req),
      message: "Treatment payment updated.",
    });
  } catch (error) {
    throw error;
  }
};

const getBySlug = async (req, res) => {
  try {
    const record = await table.TreatmentPaymentModel.getBySlug(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment payment not found!" });
    }

    res.send({
      status: true,
      data: await table.TreatmentPaymentModel.getBySlug(req),
    });
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.TreatmentPaymentModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment payment not found!" });
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

    const record = await table.TreatmentPaymentModel.getByTreatmentId(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.TreatmentPaymentModel.get(req);
    res.send({ status: true, data: data, total: data?.[0]?.total });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const record = await table.TreatmentPaymentModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment payment not found!" });

    const isTreatmentDeleted = await table.TreatmentPaymentModel.deleteById(
      req,
      0,
      {
        transaction,
      }
    );

    await transaction.commit();
    res.send({ status: true, message: "Treatment payment deleted." });
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
