"use strict";
import { beginTransaction } from "../../db/transaction.js";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { staffSchema } from "../../validation-schema/staff.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const validateData = staffSchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validateData);

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
  const record = await table.StaffModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Staff not found!" });
  }

  res.send({ status: true, data: record });
};

const get = async (req, res) => {
  const data = await table.StaffModel.get(req);
  res.send({ status: true, data: data });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

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
