"use strict";
import { beginTransaction } from "../../db/transaction.js";
import table from "../../db/models.js";
import { ledgerSchema } from "../../validation-schemas/ledger.schema.js";

const create = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const validateData = ledgerSchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validateData);

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
};

const getById = async (req, res) => {
  const ledger = await table.LedgerModel.getById(req);
  if (!ledger)
    return res
      .code(404)
      .send({ status: false, message: "ledger not found." });

  res.send({ status: true, data: ledger });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

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
  const data = await table.LedgerModel.get(req);
  res.send({ status: true, data: data });
};

export default {
  create: create,
  getByPatientId: getByPatientId,
  get: get,
  getById: getById,
  deleteById: deleteById,
};
