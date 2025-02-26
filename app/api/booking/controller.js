"use strict";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { bookingSchema } from "../../validation-schemas/booking.schema.js";

const create = async (req, res) => {
  let transaction;
  try {
    // Start a transaction
    transaction = await sequelize.transaction();

    // Validate the input data
    const validateData = bookingSchema.parse(req.body);
    const { role, id: userId } = req.user_data;

    // Check if the slot is already booked
    const isSlotBooked = await table.BookingModel.getByClinicDateAndSlot(req);
    if (isSlotBooked) {
      return res
        .code(400)
        .send({ status: false, message: "Slot already booked." });
    }

    // Retrieve the patient record
    const patientRecord =
      role === "patient"
        ? await table.PatientModel.getByUserId(userId)
        : await table.PatientModel.getById(0, req.body.patient_id);

    if (!patientRecord || !patientRecord.id) {
      return res
        .code(404)
        .send({ status: false, message: "Patient not registered." });
    }
    req.body.patient_id = patientRecord.id;

    // Fetch clinic, service, and slot details concurrently
    const [clinicRecord, serviceRecord, slotRecord] = await Promise.all([
      table.ClinicModel.getById(0, req.body.clinic_id),
      table.ServiceModel.getById(0, req.body.service_id),
      table.SlotModel.getByClinicId(0, req.body.clinic_id),
    ]);

    // Validate clinic existence
    if (!clinicRecord) {
      return res
        .code(404)
        .send({ status: false, message: "Clinic does not exist." });
    }
    req.body.doctor_id = clinicRecord.doctor_id;

    // Validate service existence
    if (!serviceRecord) {
      return res
        .code(404)
        .send({ status: false, message: "Service does not exist." });
    }

    // Validate slot availability
    if (!slotRecord?.slots?.includes(validateData.slot)) {
      return res.code(404).send({ status: false, message: "Slot not found." });
    }

    // Create the booking
    await table.BookingModel.create(req, { transaction });

    // Commit the transaction
    await transaction.commit();

    // Respond with success
    res.send({ status: true, message: "Successfully booked a slot." });
  } catch (error) {
    // Rollback transaction in case of error
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Transaction rollback failed:", rollbackError);
      }
    }

    // Log the error and send a response
    console.error("Error during booking creation:", error);
    res.code(500).send({ status: false, message: "Internal server error." });
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

const getByDateAndClinic = async (req, res) => {
  try {
    const record = await table.BookingModel.getByDateAndClinic(req);
    if (!record) {
      return res.send({ status: false, data: {} });
    }

    res.send({ status: true, data: record });
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
    // return console.log({ bookingRecord });

    const data = await table.BookingModel.update(req);
    res.send({ status: true, data: data, message: "Updated." });
  } catch (error) {
    throw error;
  }
};

const updateStatus = async (req, res) => {
  const transaction = await sequelize.transaction();

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
      const treatmentRecord =
        await table.TreatmentModel.getByClinicPatientServiceId(
          bookingRecord.patient_id,
          bookingRecord.clinic_id,
          bookingRecord.service_id
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
            service_id: bookingRecord.service_id,
            appointment_id: bookingRecord.id,
            // cost: service.discounted_price,
          },
          { transaction }
        );
      }

      const patientExistInClinic =
        await table.ClinicPatientMapModel.getByClinicPatientId(
          bookingRecord.patient_id,
          bookingRecord.clinic_id
        );

      if (!patientExistInClinic) {
        await table.ClinicPatientMapModel.create(
          bookingRecord.patient_id,
          bookingRecord.clinic_id,
          { transaction }
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
  getByDateAndClinic: getByDateAndClinic,
};
