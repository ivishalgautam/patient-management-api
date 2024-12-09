"use strict";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { bookingSchema } from "../../validation-schemas/booking.schema.js";

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateData = bookingSchema.parse(req.body);
    const { role, id: userId } = req.user_data;
    const isSlotBooked = await table.BookingModel.getByClinicAndSlot(req);
    if (isSlotBooked)
      return res
        .code(409)
        .send({ status: false, message: "Slot already booked." });

    let patientRecord = null;
    if (role === "patient") {
      patientRecord = await table.PatientModel.getByUserId(userId);
      req.body.patient_id = patientRecord.id;
    } else {
      patientRecord = await table.PatientModel.getById(0, req.body.patient_id);
    }

    if (!patientRecord)
      return res
        .code(404)
        .send({ status: false, message: "Patient not registered." });

    const clinicRecord = await table.ClinicModel.getById(0, req.body.clinic_id);
    if (!clinicRecord)
      return res
        .code(404)
        .send({ status: false, message: "Clinic not exist." });
    req.body.doctor_id = clinicRecord.doctor_id;

    const serviceRecord = await table.ServiceModel.getById(
      0,
      req.body.service_id
    );
    if (!serviceRecord)
      return res
        .code(404)
        .send({ status: false, message: "Service not exist." });

    const slotRecord = await table.SlotModel.getByClinicId(
      0,
      req.body.clinic_id
    );
    if (!slotRecord.slots.includes(validateData.slot)) {
      return res.code(404).send({ status: false, message: "Slot not found." });
    }

    await table.BookingModel.create(req, { transaction });
    await transaction.commit();
    res.send({ status: true, message: "Successfully booked a slot." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.BookingModel.get(req);

    res.send({ status: true, data: data });
  } catch (error) {
    throw error;
  }
};

const getByClinicId = async (req, res) => {
  try {
    const clinicRecord = await table.ClinicModel.getById(req);
    if (!clinicRecord)
      return res
        .code(404)
        .send({ status: false, message: "Clinic not found." });

    const data = await table.BookingModel.getBookingsByClinicId(req);

    res.send({ status: true, data: data });
  } catch (error) {
    throw error;
  }
};

const updateById = async (req, res) => {
  try {
    const bookingRecord = await table.BookingModel.getById(req);
    if (!bookingRecord)
      return res
        .code(404)
        .send({ status: false, message: "Booking not found." });

    const data = await table.BookingModel.update(req);
    res.send({ status: true, data: data, message: "Updated." });
  } catch (error) {
    throw error;
  }
};

const updateStatus = async (req, res) => {
  try {
    const bookingRecord = await table.BookingModel.getById(req);
    if (!bookingRecord)
      return res
        .code(404)
        .send({ status: false, message: "Booking not found." });

    const data = await table.BookingModel.update(req);
    res.send({ status: true, data: data, message: "Updated." });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const record = await table.BookingModel.getByPk(req, {
      transaction,
    });
    if (!record)
      return res
        .code(404)
        .send({ status: false, message: "Service not found." });

    await table.BookingModel.deleteById(req, 0, { transaction });
    await transaction.commit();

    res.send({ status: true, mesage: "Service deleted." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export default {
  create: create,
  get: get,
  deleteById: deleteById,
  getByClinicId: getByClinicId,
  updateById: updateById,
  updateStatus: updateStatus,
};
