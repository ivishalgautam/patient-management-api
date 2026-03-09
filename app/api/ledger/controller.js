"use strict";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { ledgerSchema } from "../../validation-schemas/ledger.schema.js";

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateData = ledgerSchema.parse(req.body);

    const clinic = await table.ClinicModel.getById(0, validateData.clinic_id);
    if (!clinic)
      return res
        .code(404)
        .send({ status: false, message: "Clinic not found." });

    const patient = await table.PatientModel.getById(
      0,
      validateData.patient_id
    );
    if (!patient)
      return res
        .code(404)
        .send({ status: false, message: "Patient not found." });

    const data = await table.LedgerModel.create(req, transaction);

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Ledger added.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getByPatientId = async (req, res) => {
  try {
    const clinic = await table.ClinicModel.getById(0, req.params.clinic_id);
    if (!clinic)
      return res
        .code(404)
        .send({ status: false, message: "Clinic not found." });

    const patient = await table.PatientModel.getById(0, req.params.patient_id);
    if (!patient)
      return res
        .code(404)
        .send({ status: false, message: "Patient not found." });

    const record = await table.LedgerModel.ledgerBalanceByClinicAndPatient(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const ledger = await table.LedgerModel.getById(req);
    if (!ledger)
      return res
        .code(404)
        .send({ status: false, message: "ledger not found." });

    res.send({ status: true, data: ledger });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const ledger = await table.LedgerModel.getById(req);
    if (!ledger)
      return res
        .code(404)
        .send({ status: false, message: "ledger not found." });

    await table.LedgerModel.deleteById(req, 0, transaction);
    await transaction.commit();

    res.send({ status: true, data: ledger, message: "Ledger deleted." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.LedgerModel.get(req);
    res.send({ status: true, data: data });
  } catch (error) {
    throw error;
  }
};

export default {
  create: create,
  getByPatientId: getByPatientId,
  get: get,
  getById: getById,
  deleteById: deleteById,
};
