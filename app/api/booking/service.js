"use strict";
import moment from "moment";
import table from "../../db/models.js";
import { one } from "../../db/sql.js";
import { QUEUES, enqueue } from "../../jobs/queue.js";
import { notFound } from "../../lib/app-error.js";
import { assertBookable } from "../../lib/booking-rules.js";

// Books a slot for a patient at a clinic. Patients book for themselves;
// staff pass patient_id. Returns the created booking.
export async function createBooking({ clinicId, patientId, date, slot }, { user, transaction }) {
  const clinic = await table.ClinicModel.getById(0, clinicId);
  if (!clinic) throw notFound("Clinic not found!");

  // Date not past, clinic open, slot in schedule and not blocked, room left.
  await assertBookable({ clinic, date, slot }, { transaction });

  // Read inside the caller's transaction: lead conversion books for a
  // patient it has just created and not yet committed.
  const patient = await one(
    `SELECT pt.id, pt.user_id, u.fullname, CONCAT('+', u.country_code, ' ', u.mobile_number) AS mobile_number
       FROM patients pt JOIN users u ON u.id = pt.user_id
      WHERE ${user.role === "patient" ? "pt.user_id = :userId" : "pt.id = :patientId"}`,
    { userId: user.id, patientId: patientId ?? null },
    { transaction },
  );
  if (!patient?.id) throw notFound("Patient not registered.");

  const booking = await table.BookingModel.create(
    {
      body: {
        doctor_id: clinic.doctor_id,
        patient_id: patient.id,
        clinic_id: clinicId,
        date,
        slot,
      },
    },
    { transaction },
  );
  return { booking, patient, clinic };
}

// WhatsApp confirmation; called only after the booking is committed.
export async function notifyBookingConfirmed({ booking, patient, clinic }) {
  // patient.mobile_number from PatientModel.getById is "+<cc> <number>";
  // getByUserId returns the raw patient row, so fall back to the user.
  let phone = patient.mobile_number;
  let name = patient.fullname;
  if (!phone) {
    const user = await table.UserModel.findAuthUserById(patient.user_id);
    phone = `${user?.country_code ?? ""}${user?.mobile_number ?? ""}`;
    name = user?.fullname;
  }
  // Queued so a WhatsApp outage is retried instead of lost.
  await enqueue(QUEUES.WHATSAPP_SEND, {
    kind: "booking_confirm",
    practiceId: clinic?.practice_id,
    payload: {
      patient_phone: phone,
      patient_name: name,
      service_name: "Dental service",
      contact_phone: clinic?.contact_phone,
      booked_slot: moment(`${booking.date} ${booking.slot}`).format("dddd DD MMMM h:mm A"),
    },
  });
}

export default { createBooking, notifyBookingConfirmed };
