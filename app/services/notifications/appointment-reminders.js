"use strict";
import moment from "moment";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../db/postgres.js";
import { sendWhatsApp } from "../whatsapp/templates.js";

// Each reminder: which bookings qualify and the minutes window relative to
// the appointment (before = minutes until it, after = minutes since it).
// Windows keep the original send times but tolerate lateness, so a short
// outage no longer skips messages. The *_sent flags make sending idempotent.
export const REMINDERS = {
  reminder_24h: { status: "pending", flag: "notification_24hr_sent", before: [1380, 1440] },
  reminder_2h: { status: "pending", flag: "notification_2hr_sent", before: [90, 120] },
  follow_up_1h: { status: "completed", flag: "notification_1hr_after_sent", after: [60, 90] },
  review_request: { status: "completed", flag: "review_message_sent", after: [120, 180] },
};

const BOOKING_SQL = `
  SELECT b.id, b.date, b.slot, b.status, b.practice_id,
         b.notification_24hr_sent, b.notification_2hr_sent,
         b.notification_1hr_after_sent, b.review_message_sent,
         u.fullname, u.country_code, u.mobile_number, c.contact_phone
    FROM bookings b
    JOIN patients p ON p.id = b.patient_id
    JOIN users u ON u.id = p.user_id
    JOIN clinics c ON c.id = b.clinic_id`;

const appointmentTime = (b) => moment(`${b.date} ${b.slot}`, "YYYY-MM-DD HH:mm:ss");

export function dueKinds(booking, now = moment()) {
  const at = appointmentTime(booking);
  const before = at.diff(now, "minutes");
  const after = now.diff(at, "minutes");
  return Object.entries(REMINDERS)
    .filter(([, r]) => booking.status === r.status && !booking[r.flag])
    .filter(([, r]) =>
      r.before
        ? before > r.before[0] && before <= r.before[1]
        : after >= r.after[0] && after < r.after[1],
    )
    .map(([kind]) => kind);
}

// Bookings around today only (the old cron scanned every booking ever).
export async function findDueReminders(now = moment()) {
  const bookings = await sequelize.query(
    `${BOOKING_SQL}
      WHERE b.status IN ('pending', 'completed')
        AND b.date BETWEEN :from AND :to`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        from: now.clone().subtract(1, "day").format("YYYY-MM-DD"),
        to: now.clone().add(2, "days").format("YYYY-MM-DD"),
      },
    },
  );
  return bookings.flatMap((b) => dueKinds(b, now).map((kind) => ({ bookingId: b.id, kind, practiceId: b.practice_id })));
}

// Sends one reminder if it is still due, then marks it sent.
export async function sendReminder({ bookingId, kind }, now = moment()) {
  const [booking] = await sequelize.query(`${BOOKING_SQL} WHERE b.id = :id`, {
    type: QueryTypes.SELECT,
    replacements: { id: bookingId },
  });
  if (!booking || !dueKinds(booking, now).includes(kind)) return { skipped: true };

  await sendWhatsApp(kind, {
    patient_phone: `${booking.country_code}${booking.mobile_number}`,
    patient_name: booking.fullname,
    contact_phone: booking.contact_phone,
    booked_day: booking.date,
    booked_slot: appointmentTime(booking).format("hh:mm A"),
  });
  await sequelize.query(`UPDATE bookings SET "${REMINDERS[kind].flag}" = true WHERE id = :id`, {
    replacements: { id: bookingId },
  });
  return { sent: true };
}
