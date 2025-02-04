"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { staffSchema } from "../../validation-schemas/staff.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateData = staffSchema.parse(req.body);

    const doctor = await table.DoctorModel.getById(0, req.body.doctor_id);
    if (!doctor)
      return res
        .code(409)
        .send({ status: false, message: "Doctor not registered." });

    const data = await table.StaffModel.create(doctor.id, req.body.staff_id, {
      transaction,
    });
    await transaction.commit();

    res.send({ status: true, data: data, message: "Staff created." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.StaffModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Staff not found!" });
    }

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.StaffModel.get(req);
    res.send({ status: true, data: data });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const record = await table.StaffModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Staff not found!" });

    await table.StaffModel.deleteById(req, req.params.id, {
      transaction,
    });

    await transaction.commit();
    res.send({ status: true, message: "Staff deleted." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export default {
  create: create,
  get: get,
  deleteById: deleteById,
  getById: getById,
};
