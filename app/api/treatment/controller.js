"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import slugify from "slugify";
import { deleteFile } from "../../helpers/file.js";
import { sequelize } from "../../db/postgres.js";
import { clinicPatientSchema } from "../../validation-schemas/clinic-patient.schema.js";
import { treatmentSchema } from "../../validation-schemas/treatment.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateData = treatmentSchema.parse(req.body);

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
      clinic.id
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
        req.body.service_id
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
        { transaction }
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
  const transaction = await sequelize.transaction();
  try {
    const record = await table.TreatmentModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment not found!" });
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
  try {
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
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.TreatmentModel.getById(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment not found!" });
    }

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getPatientDetails = async (req, res) => {
  try {
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
  } catch (error) {
    throw error;
  }
};

const getPatientDetailsByPatientAndClinicId = async (req, res) => {
  try {
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
        clinic.id
      ),
    });
  } catch (error) {
    throw error;
  }
};

const getByClinicId = async (req, res) => {
  try {
    const record = await table.ClinicModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Clinic not found!" });
    }

    const data = await table.TreatmentModel.getByClinicId(req);

    res.send({ status: true, data: data });
  } catch (error) {
    throw error;
  }
};

const getByPatientId = async (req, res) => {
  try {
    const record = await table.PatientModel.getByUserId(req.user_data.id);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Patient not found!" });
    }

    const data = await table.TreatmentModel.getByPatientId(req, record.id);

    res.send({ status: true, data: data });
  } catch (error) {
    throw error;
  }
};

const getByPatientAndClinicId = async (req, res) => {
  try {
    const data = await table.TreatmentModel.getByPatientAndClinicId(
      req,
      req.params.patient_id,
      req.params.clinic_id
    );

    res.send({ status: true, data: data });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.TreatmentModel.get(req);
    res.send({ status: true, data: data, total: data?.[0]?.total });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

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
