"use strict";
import { beginTransaction } from "../../db/transaction.js";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { clinicSchema } from "../../validation-schemas/clinic.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const validateData = clinicSchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validateData);

    const doctor = await table.DoctorModel.getByUserId(req);
    if (!doctor)
      return res
        .code(409)
        .send({ status: false, message: "Doctor not registered." });

    const data = await table.ClinicModel.create(req, doctor.id, {
      transaction,
    });
    await transaction.commit();

    res.send({ status: true, data: data, message: "Clinic created." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  const record = await table.ClinicModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Clinic not found!" });
  }

  const data = await table.ClinicModel.update(req);

  res.send({ status: true, message: "Clinic updated.", data });
};

const getById = async (req, res) => {
  const record = await table.ClinicModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Clinic not found!" });
  }

  res.send({ status: true, data: record });
};

const getByDoctorId = async (req, res) => {
  const record = await table.DoctorModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Doctor not found!" });
  }

  res.send({
    status: true,
    data: await table.ClinicModel.getByDoctorId(req),
  });
};

const get = async (req, res) => {
  const data = await table.ClinicModel.get(req);
  res.send({ status: true, data: data });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

  try {
    const record = await table.ClinicModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Clinic not found!" });

    await table.ClinicModel.deleteById(req, req.params.id, {
      transaction,
    });

    await transaction.commit();
    res.send({ status: true, message: "Clinic deleted." });
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
  getById: getById,
  getByDoctorId: getByDoctorId,
};
