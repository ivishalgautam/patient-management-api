"use strict";
import moment from "moment";
import table from "../../db/models.js";
import { sendBookingConfirm } from "../../utils/waffly.js";
import { badRequest, notFound } from "../../lib/app-error.js";

// Books a slot for a patient at a clinic. Patients book for themselves;
// staff pass patient_id. Returns the created booking.
export async function createBooking({ clinicId, patientId, date, slot }, { user, transaction }) {
  const clinic = await table.ClinicModel.getById(0, clinicId);
  if (!clinic) throw notFound("Clinic not found!");

  const booked = await table.BookingModel.getByClinicDateAndSlot(null, clinicId, slot, date);
  if (booked >= clinic.max_patients_per_slot) throw badRequest("Slots full.");

  const patient =
    user.role === "patient"
      ? await table.PatientModel.getByUserId(user.id)
      : await table.PatientModel.getById(0, patientId);
  if (!patient?.id) throw notFound("Patient not registered.");

  const slotTemplate = await table.SlotModel.getByClinicId(0, clinicId);
  if (!slotTemplate?.slots?.includes(slot)) throw notFound("Slot not found.");

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
  return { booking, patient };
}

// WhatsApp confirmation; called only after the booking is committed.
export async function notifyBookingConfirmed({ booking, patient }) {
  // patient.mobile_number from PatientModel.getById is "+<cc> <number>";
  // getByUserId returns the raw patient row, so fall back to the user.
  let phone = patient.mobile_number;
  let name = patient.fullname;
  if (!phone) {
    const user = await table.UserModel.findAuthUserById(patient.user_id);
    phone = `${user?.country_code ?? ""}${user?.mobile_number ?? ""}`;
    name = user?.fullname;
  }
  await sendBookingConfirm({
    patient_phone: phone,
    patient_name: name,
    service_name: "Dental service",
    booked_slot: moment(`${booking.date} ${booking.slot}`).format("dddd DD MMMM h:mm A"),
  });
}

export default { createBooking, notifyBookingConfirmed };
