"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { treatmentVisitSchema } from "../../validation-schemas/treatment.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const validate = treatmentVisitSchema.parse(req.body);

    const treatment = await table.TreatmentModel.getByPk(
      0,
      req.body.treatment_id,
    );

    if (!treatment) {
      await transaction.rollback();
      return res.code(404).send({
        status: false,
        message: "Treatment not found.",
      });
    }

    const data = await table.TreatmentVisitModel.create(req, { transaction });

    await transaction.commit();

    res.send({ status: true, data, message: "Treatment visit created." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  try {
    const record = await table.TreatmentVisitModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment visit not found!" });
    }

    res.send({
      status: true,
      data: await table.TreatmentVisitModel.update(req),
      message: "Treatment visit updated.",
    });
  } catch (error) {
    throw error;
  }
};

const getBySlug = async (req, res) => {
  try {
    const record = await table.TreatmentVisitModel.getBySlug(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment visit not found!" });
    }

    res.send({
      status: true,
      data: await table.TreatmentVisitModel.getBySlug(req),
    });
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.TreatmentVisitModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment visit not found!" });
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

    const record = await table.TreatmentVisitModel.getByTreatmentId(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.TreatmentVisitModel.get(req);
    res.send({ status: true, data: data });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const record = await table.TreatmentVisitModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment visit not found!" });

    const isTreatmentDeleted = await table.TreatmentVisitModel.deleteById(
      req,
      0,
      {
        transaction,
      },
    );

    await transaction.commit();
    res.send({ status: true, message: "Treatment visit deleted." });
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
