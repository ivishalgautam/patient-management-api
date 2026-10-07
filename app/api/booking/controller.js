"use strict";
import { beginTransaction } from "../../db/transaction.js";
import table from "../../db/models.js";
import { createBooking, notifyBookingConfirmed } from "./service.js";
import { bookingSchema } from "../../validation-schemas/booking.schema.js";

const create = async (req, res) => {
  const data = bookingSchema.parse(req.body);
  const transaction = await beginTransaction(req);
  const result = await createBooking(
    { clinicId: data.clinic_id, patientId: req.body.patient_id, date: data.date, slot: data.slot },
    { user: req.user_data, transaction },
  );
  await transaction.commit();

  // Notification failures must not undo a committed booking.
  notifyBookingConfirmed(result).catch((error) =>
    req.log.error({ err: error }, "booking confirmation not sent"),
  );

  res.send({ status: true, message: "Successfully booked a slot." });
};

const get = async (req, res) => {
  const data = await table.BookingModel.get(req);

  res.send({ status: true, data: data });
};

const getByClinicId = async (req, res) => {
  const clinicRecord = await table.ClinicModel.getById(req);
  if (!clinicRecord)
    return res
      .code(404)
      .send({ status: false, message: "Clinic not found." });

  const data = await table.BookingModel.getBookingsByClinicId(req);

  res.send({ status: true, data: data });
};

const getByDateAndClinic = async (req, res) => {
  const record = await table.BookingModel.getByDateAndClinic(req);
  if (!record) {
    return res.send({ status: false, data: {} });
  }

  res.send({ status: true, data: record });
};

const updateById = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const bookingRecord = await table.BookingModel.getById(req);
    if (!bookingRecord)
      return res
        .code(404)
        .send({ status: false, message: "Booking not found." });
    // return console.log({ bookingRecord });

    const data = await table.BookingModel.update(req, 0, { transaction });
    await transaction.commit();
    res.send({ status: true, data: data, message: "Updated." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateStatus = async (req, res) => {
  const transaction = await beginTransaction(req);

  try {
    const status = req.body.status;
    if (!status)
      return res
        .code(400)
        .send({ status: false, message: "Status is required." });

    const bookingRecord = await table.BookingModel.getById(req);
    if (!bookingRecord)
      return res
        .code(404)
        .send({ status: false, message: "Booking not found." });

    if (bookingRecord.status === "canceled")
      return res.code(400).send({
        status: false,
        message: "Can't change booking canceled.",
      });

    if (bookingRecord.status === "completed")
      return res.code(400).send({
        status: false,
        message: "Can't change booking completed.",
      });

    const data = await table.BookingModel.update(req, 0, { transaction });
    if (data.status === "completed") {
      const service_id = req.body.service_id;
      const treatmentRecord =
        await table.TreatmentModel.getByClinicPatientServiceId(
          bookingRecord.patient_id,
          bookingRecord.clinic_id,
          service_id,
        );
      // return;
      if (
        !treatmentRecord ||
        (treatmentRecord && treatmentRecord.status !== "active")
      ) {
        await table.TreatmentModel.create(
          req,
          {
            patient_id: bookingRecord.patient_id,
            clinic_id: bookingRecord.clinic_id,
            service_id: service_id,
            appointment_id: bookingRecord.id,
            // cost: service.discounted_price,
          },
          { transaction },
        );
      }

      const patientExistInClinic =
        await table.ClinicPatientMapModel.getByClinicPatientId(
          bookingRecord.patient_id,
          bookingRecord.clinic_id,
        );

      if (!patientExistInClinic) {
        await table.ClinicPatientMapModel.create(
          bookingRecord.patient_id,
          bookingRecord.clinic_id,
          { transaction },
        );
      }
    }

    await transaction.commit();
    res.send({ status: true, data: data, message: "Updated." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const record = await table.BookingModel.getByPk(req, { transaction });
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
  getByDateAndClinic: getByDateAndClinic,
};
