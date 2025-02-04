"use strict";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { clinicPatientSchema } from "../../validation-schemas/clinic-patient.schema.js";

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateData = clinicPatientSchema.parse(req.body);

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

    const appointment = await table.BookingModel.getById(
      0,
      req.body.appointment_id
    );
    if (!appointment)
      return res
        .code(409)
        .send({ status: false, message: "Appointment not found." });

    const record = await table.ClinicPatientMapModel.getByClinicPatientId(
      patient.id,
      clinic.id
    );

    if (!record) {
      await table.ClinicPatientMapModel.create(patient.id, clinic.id, {
        transaction,
      });
    }

    const treatmentRecord =
      await table.TreatmentModel.getByClinicPatientServiceId(
        patient.id,
        clinic.id,
        appointment.service_id
      );

    if (treatmentRecord) {
      return res
        .code(409)
        .send({ status: false, message: "Treatment already exist." });
    }

    await table.TreatmentModel.create(
      req,
      {
        patient_id: patient.id,
        clinic_id: clinic.id,
        service_id_id: appointment.service_id,
        appointment_id: appointment.id,
      },
      { transaction }
    );

    await transaction.commit();
    res.send({ status: true, message: "Added to clinic." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getMyPatientsByClinicId = async (req, res) => {
  try {
    res.send({
      status: true,
      data: await table.ClinicPatientMapModel.get(req),
    });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const record = await table.ClinicPatientMapModel.getById(req);
    if (!record)
      return res
        .code(404)
        .send({ status: false, message: "Patient not found in clinic." });

    await table.ClinicPatientMapModel.deleteById(req, 0, { transaction });
    await transaction.commit();
    res.send({
      status: true,
      message: "Patient removed from clinic.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export default {
  create: create,
  getMyPatientsByClinicId: getMyPatientsByClinicId,
  deleteById: deleteById,
};
