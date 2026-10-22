"use strict";
import moment from "moment";
import { select, exec } from "../../db/sql.js";

// In-app notifications for everything that happens to an appointment.
//
// The patient always hears about their own appointment (a confirmation,
// even when they booked it themselves). On the clinic side the doctor and
// the clinic's front-desk staff hear about it, except whoever made the
// change: they were there.
//
//   event     booked | rescheduled | canceled | completed | checked_in | seated
//   previous  { date, slot } before a reschedule
export const BOOKING_EVENTS = ["booked", "rescheduled", "canceled", "completed", "checked_in", "seated"];

// Chair-side steps only matter to the patient waiting for them.
const PATIENT_ONLY = new Set(["checked_in", "seated"]);

const when = (date, slot) => moment(`${date} ${slot}`, "YYYY-MM-DD HH:mm:ss").format("ddd D MMM, h:mm A");

function messages(event, b, previous) {
  const at = when(b.date, b.slot);
  const was = previous ? when(previous.date, previous.slot) : null;
  const clinic = b.clinic_name ? ` at ${b.clinic_name}` : "";
  const patient = b.patient_name || "A patient";
  switch (event) {
    case "booked":
      return {
        patient: { title: "Appointment booked", body: `${at}${clinic}. We look forward to seeing you.` },
        staff: { title: `New appointment: ${patient}`, body: `${at}${clinic}` },
      };
    case "rescheduled":
      return {
        patient: { title: "Appointment rescheduled", body: `Now ${at}${clinic}${was ? ` (was ${was})` : ""}.` },
        staff: { title: `Appointment moved: ${patient}`, body: `Now ${at}${was ? ` (was ${was})` : ""}${clinic}` },
      };
    case "canceled":
      return {
        patient: { title: "Appointment cancelled", body: `Your appointment on ${at}${clinic} was cancelled. Call the clinic to rebook.` },
        staff: { title: `Appointment cancelled: ${patient}`, body: `${at}${clinic}` },
      };
    case "completed":
      return {
        patient: { title: "Visit completed", body: `Thanks for visiting${clinic} on ${at}. Your records have been updated.` },
        staff: { title: `Visit completed: ${patient}`, body: `${at}${clinic}` },
      };
    case "checked_in":
      return { patient: { title: "You're checked in", body: `Please take a seat; we'll call you shortly.` } };
    case "seated":
      return { patient: { title: "Your chair is ready", body: `${b.chair_name ? `${b.chair_name} is ready for you.` : "Please come through to the treatment room."}` } };
    default:
      return null;
  }
}

// The booking with everyone who should hear about it.
async function loadBooking(bookingId) {
  const rows = await select(
    `SELECT b.id, b.date, to_char(b.slot, 'HH24:MI:SS') AS slot, b.status, b.practice_id, b.clinic_id,
            c.name AS clinic_name, ch.name AS chair_name,
            pu.id AS patient_user_id, pu.fullname AS patient_name,
            du.id AS doctor_user_id,
            array_remove(array_agg(DISTINCT su.id), NULL) AS staff_user_ids
       FROM bookings b
       JOIN clinics c ON c.id = b.clinic_id
       LEFT JOIN chairs ch ON ch.id = b.chair_id
       JOIN patients p ON p.id = b.patient_id
       JOIN users pu ON pu.id = p.user_id
       JOIN doctors d ON d.id = b.doctor_id
       JOIN users du ON du.id = d.user_id
       LEFT JOIN staffs s ON s.doctor_id = d.id
            AND (EXISTS (SELECT 1 FROM clinic_staff_mappings m WHERE m.staff_id = s.id AND m.clinic_id = b.clinic_id)
                 OR NOT EXISTS (SELECT 1 FROM clinic_staff_mappings m WHERE m.staff_id = s.id))
       LEFT JOIN users su ON su.id = s.user_id AND su.is_active AND su.deleted_at IS NULL
      WHERE b.id = :bookingId
      GROUP BY b.id, c.name, ch.name, pu.id, du.id`,
    { bookingId },
  );
  return rows[0] ?? null;
}

export async function notifyBookingEvent(event, bookingId, { actorUserId = null, previous = null } = {}) {
  if (!BOOKING_EVENTS.includes(event)) throw new Error(`Unknown booking event: ${event}`);
  const b = await loadBooking(bookingId);
  if (!b) return [];
  const text = messages(event, b, previous);
  if (!text) return [];

  const rows = [];
  const add = (userId, { title, body }, link) =>
    rows.push({ practice_id: b.practice_id, user_id: userId, type: `appointment.${event}`, title, body, link, booking_id: b.id });

  if (b.patient_user_id) add(b.patient_user_id, text.patient, "/appointments");
  if (!PATIENT_ONLY.has(event) && text.staff) {
    const recipients = new Set([b.doctor_user_id, ...(b.staff_user_ids ?? [])]);
    recipients.delete(actorUserId);
    recipients.delete(b.patient_user_id);
    for (const userId of recipients) if (userId) add(userId, text.staff, `/appointments?booking=${b.id}&start_date=${b.date}&end_date=${b.date}`);
  }
  if (!rows.length) return [];

  const values = rows
    .map((_, i) => `(:p${i}, :u${i}, :t${i}, :ti${i}, :b${i}, :l${i}, :bk${i})`)
    .join(", ");
  const params = {};
  rows.forEach((r, i) => Object.assign(params, { [`p${i}`]: r.practice_id, [`u${i}`]: r.user_id, [`t${i}`]: r.type, [`ti${i}`]: r.title, [`b${i}`]: r.body, [`l${i}`]: r.link, [`bk${i}`]: r.booking_id }));
  await exec(`INSERT INTO user_notifications (practice_id, user_id, type, title, body, link, booking_id) VALUES ${values}`, params);
  return rows;
}

// Fire-and-forget wrapper: a notification must never undo or fail the
// change it describes.
export function notifyBookingEventSafe(log, event, bookingId, options) {
  return notifyBookingEvent(event, bookingId, options).catch((error) =>
    (log?.error ?? console.error).call(log ?? console, { err: error, event, bookingId }, "booking notification not sent"),
  );
}
