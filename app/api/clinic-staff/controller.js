"use strict";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { clinicStaffSchema } from "../../validation-schemas/clinic-staff.schema.js";

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateData = clinicStaffSchema.parse(req.body);

    const clinic = await table.ClinicModel.getById(0, req.body.clinic_id);
    if (!clinic)
      return res
        .code(404)
        .send({ status: false, message: "Clinic not found." });

    const staff = await table.StaffModel.getById(0, req.body.staff_id);
    if (!staff)
      return res.code(404).send({ status: false, message: "Staff not found." });

    await table.ClinicStaffMapModel.create(staff.id, clinic.id, {
      transaction,
    });

    await transaction.commit();
    res.send({ status: true, message: "Added to clinic." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getMyPatientsByClinicId = async (req, res) => {
  try {
    res.send({ status: true, data: await table.ClinicStaffMapModel.get(req) });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const record = await table.ClinicStaffMapModel.getById(req);
    if (!record)
      return res
        .code(404)
        .send({ status: false, message: "Patient not found in clinic." });

    await table.ClinicStaffMapModel.deleteById(req, 0, { transaction });
    await transaction.commit();
    res.send({ status: true, message: "Patient removed from clinic." });
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
