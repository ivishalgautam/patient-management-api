"use strict";
import { beginTransaction } from "../../db/transaction.js";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { treatmentSchema } from "../../validation-schema/treatment.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const validateData = treatmentSchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validateData);

    // clinic_id, patient_id, service_id,

    const clinic = await table.ClinicModel.getById(0, req.body.clinic_id);
    if (!clinic)
      return res
        .code(409)
        .send({ status: false, message: "Clinic not found." });

    const patient = await table.PatientModel.getById(0, req.body.patient_id);
    if (!patient)
      return res
        .code(409)
        .send({ status: false, message: "Patient not found." });

    const service = await table.ServiceModel.getById(0, req.body.service_id);
    if (!service)
      return res
        .code(409)
        .send({ status: false, message: "Service not found." });

    const record = await table.ClinicPatientMapModel.getByClinicPatientId(
      patient.id,
      clinic.id,
    );
    if (!record) {
      await table.ClinicPatientMapModel.create(patient.id, clinic.id, {
        transaction,
      });
    }

    const treatmentRecord =
      await table.TreatmentModel.getByClinicPatientServiceId(
        req.body.patient_id,
        req.body.clinic_id,
        req.body.service_id,
      );

    if (
      !treatmentRecord ||
      (treatmentRecord && treatmentRecord.status !== "active")
    ) {
      await table.TreatmentModel.create(
        req,
        {
          patient_id: patient.id,
          clinic_id: clinic.id,
          service_id: service.id,
        },
        { transaction },
      );
    }

    await transaction.commit();
    res.send({ status: true, message: "Added to treatment process." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const record = await table.TreatmentModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment not found!" });
    }

    const remainingPayment =
      await table.TreatmentPaymentModel.getRemainingPayment(0, record.id);
    if (remainingPayment.remaining_amount > 0) {
      return res.code(500).send({
        status: false,
        message: "The payment for this treatment is still pending.",
      });
    }

    const data = await table.TreatmentModel.update(req, 0, { transaction });
    await transaction.commit();

    res.send({
      status: true,
      data: data,
      message: "Treatment updated.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getBySlug = async (req, res) => {
  const record = await table.TreatmentModel.getBySlug(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Treatment not found!" });
  }

  res.send({
    status: true,
    data: await table.TreatmentModel.getBySlug(req),
  });
};

const getById = async (req, res) => {
  const record = await table.TreatmentModel.getById(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Treatment not found!" });
  }

  res.send({ status: true, data: record });
};

const getPatientDetails = async (req, res) => {
  const patient = await table.PatientModel.getByUserId(req.user_data.id);
  if (!patient) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Patient not found!" });
  }

  res.send({
    status: true,
    data: await table.TreatmentModel.getPatientDetails(patient.id),
  });
};

const getPatientDetailsByPatientAndClinicId = async (req, res) => {
  const patient = await table.PatientModel.getById(0, req.params.patient_id);
  if (!patient) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Patient not found!" });
  }

  const clinic = await table.ClinicModel.getById(0, req.params.clinic_id);
  if (!clinic) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Clinic not found!" });
  }

  res.send({
    status: true,
    data: await table.TreatmentModel.getPatientDetailsByPatientAndClinicId(
      patient.id,
      clinic.id,
    ),
  });
};

const getByClinicId = async (req, res) => {
  const record = await table.ClinicModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Clinic not found!" });
  }

  const data = await table.TreatmentModel.getByClinicId(req);

  res.send({ status: true, data: data });
};

const getByPatientId = async (req, res) => {
  const record = await table.PatientModel.getByUserId(req.user_data.id);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Patient not found!" });
  }

  const data = await table.TreatmentModel.getByPatientId(req, record.id);

  res.send({ status: true, data: data });
};

const getByPatientAndClinicId = async (req, res) => {
  const data = await table.TreatmentModel.getByPatientAndClinicId(
    req,
    req.params.patient_id,
    req.params.clinic_id,
  );

  res.send({ status: true, data: data });
};

const get = async (req, res) => {
  const data = await table.TreatmentModel.get(req);
  res.send({ status: true, data: data, total: data?.[0]?.total });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

  try {
    const record = await table.TreatmentModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment not found!" });

    await table.TreatmentModel.deleteById(req, req.params.id, { transaction });

    await transaction.commit();
    res.send({ status: true, message: "Treatment deleted." });
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
  getByPatientId: getByPatientId,
  getBySlug: getBySlug,
  getById: getById,
  getByClinicId: getByClinicId,
  getByPatientAndClinicId: getByPatientAndClinicId,
  getPatientDetailsByPatientAndClinicId: getPatientDetailsByPatientAndClinicId,
  getPatientDetails: getPatientDetails,
};
