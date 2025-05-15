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

    const remainingCost =
      await table.TreatmentPlanModel.countRemainingCostByTreatmentId(
        req.body.treatment_id
      );

    if (!remainingCost)
      return res.status(409).send({
        status: false,
        message: "Please add treatment plan to make payments!",
      });
    const currPaid = req.body.amount_paid;
    if (remainingCost < currPaid) {
      return res.status(409).send({
        message: `Remaining balance is ${remainingCost}!`,
        status: false,
      });
    }

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

const getByPatientId = async (req, res) => {
  try {
    const patient = await table.PatientModel.getById(req);
    if (!patient)
      return res
        .code(404)
        .send({ status: false, message: "Patient not found." });

    const record = await table.TreatmentPaymentModel.getByPatientId(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getRemainingPayment = async (req, res) => {
  try {
    const treatment = await table.TreatmentModel.getByPk(req);
    if (!treatment)
      return res
        .code(404)
        .send({ status: false, message: "Treatment not found." });

    const record = await table.TreatmentPaymentModel.getRemainingPayment(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const patient = await table.PatientModel.getByUserId(req.user_data.id);

    const data = await table.TreatmentPaymentModel.getByPatientId(
      req,
      patient.id
    );
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

const accounts = async (req, res) => {
  try {
    const data = await table.TreatmentPaymentModel.paymentsSummary(req);

    res.send(data);
  } catch (error) {
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
  getRemainingPayment: getRemainingPayment,
  accounts: accounts,
  getByPatientId: getByPatientId,
};
