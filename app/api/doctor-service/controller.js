"use strict";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { doctorServiceSchema } from "../../validation-schemas/doctor-service.schema.js";

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateProcedureData = doctorServiceSchema.parse(req.body);

    let doctorRecord = null;
    if (req.user_data.role === "doctor") {
      doctorRecord = await table.DoctorModel.getByUserId(0, req.user_data.id);
    }
    if (req.user_data.role === "admin") {
      doctorRecord = await table.DoctorModel.getById(0, req.body.doctor_id);
    }

    if (!doctorRecord)
      return res
        .code(404)
        .send({ status: false, message: "Doctor not found." });

    const services = req.body.services;
    const promises = services.map(async (srv) => {
      const serviceId = srv;
      const serviceRecord = await table.ServiceModel.getById(0, serviceId);
      if (!serviceRecord) return;

      const isExist = await table.DoctorServiceMapModel.getByDoctorAndServiceId(
        0,
        doctorRecord.id,
        serviceId
      );

      if (isExist) return;

      req.body.service_id = serviceId;
      req.body.doctor_id = doctorRecord.id;
      await table.DoctorServiceMapModel.create(req, {
        transaction,
      });
    });

    await Promise.all(promises);
    await transaction.commit();
    res.send({ status: true, message: "Services added." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.DoctorServiceMapModel.get(req);

    res.send({ status: true, data: data });
  } catch (error) {
    throw error;
  }
};

const getByServiceId = async (req, res) => {
  try {
    const service = await table.ServiceModel.getById(req);
    if (!service) return res.code(404).send({ message: "Service not found!" });

    const data = await table.DoctorServiceMapModel.getByServiceId(req);

    res.send({ status: true, data: data });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const record = await table.DoctorServiceMapModel.getByPk(req, {
      transaction,
    });
    if (!record)
      return res
        .code(404)
        .send({ status: false, message: "Service not found." });

    await table.DoctorServiceMapModel.deleteById(req, 0, { transaction });
    await transaction.commit();

    res.send({ status: true, message: "Service deleted." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export default {
  create: create,
  get: get,
  deleteById: deleteById,
  getByServiceId: getByServiceId,
};
