"use strict";
import config from "../config/index.js";
import { select, one } from "../db/sql.js";
import { AppError, badRequest, conflict } from "./app-error.js";

// Business-state rules for appointments, schedules, clinics and billing
// (audit defect #24). Each throws an AppError the error handler turns into
// { status: false, error, message, code }.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const rule = (message, code) => new AppError(400, message, { code });

// "Today" in the clinic's time zone, not the server's.
export async function clinicToday({ transaction } = {}) {
  const { today } = await one(`SELECT to_char((now() AT TIME ZONE :tz)::date, 'YYYY-MM-DD') AS today`, {
    tz: config.clinic_timezone,
  }, { transaction });
  return today;
}

const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

// A slot can be booked (or a booking moved to it) when the date isn't in
// the past, the clinic works that day, the time is in its schedule, it
// isn't blocked, and there's room. excludeBookingId: the booking being moved.
export async function assertBookable({ clinic, date, slot, excludeBookingId = null }, { transaction } = {}) {
  if (!DATE.test(String(date)) || Number.isNaN(Date.parse(date))) throw badRequest("Use a date like 2026-10-15.");
  if (date < (await clinicToday({ transaction }))) throw rule("Appointments can't be booked in the past.", "BOOKING_IN_PAST");

  const schedule = await one(`SELECT slots, days_off FROM slots WHERE clinic_id = :clinicId LIMIT 1`, { clinicId: clinic.id }, { transaction });
  if (!schedule?.slots?.includes(slot)) throw new AppError(404, "Slot not found.", { code: "SLOT_NOT_IN_SCHEDULE" });
  if ((schedule.days_off ?? []).includes(weekday(date))) throw rule("The clinic is closed on that day.", "CLINIC_DAY_OFF");

  const block = await one(`SELECT type, slots FROM blocked_slots WHERE clinic_id = :clinicId AND date = :date LIMIT 1`, {
    clinicId: clinic.id,
    date,
  }, { transaction });
  if (block && (block.type === "date" || (block.slots ?? []).includes(slot))) {
    throw rule("That time is blocked in the clinic's calendar.", "SLOT_BLOCKED");
  }

  const { n } = await one(
    `SELECT count(*)::int AS n FROM bookings
      WHERE clinic_id = :clinicId AND date = :date AND slot = :slot AND status = 'pending'
        AND (:excludeId::uuid IS NULL OR id <> :excludeId::uuid)`,
    { clinicId: clinic.id, date, slot, excludeId: excludeBookingId },
    { transaction },
  );
  if (n >= clinic.max_patients_per_slot) throw badRequest("Slots full.");
}

// Completed and canceled appointments are history: they can't be edited.
export function assertBookingOpen(booking) {
  if (booking.status === "canceled") throw rule("Can't change booking canceled.", "BOOKING_CLOSED");
  if (booking.status === "completed") throw rule("Can't change booking completed.", "BOOKING_CLOSED");
}

// (Completing early is allowed: patients do come in before their date.)
export function assertStatusChange(booking, status) {
  if (!["pending", "completed", "canceled"].includes(status)) {
    throw badRequest("Status must be pending, completed or canceled.");
  }
  assertBookingOpen(booking);
}

// Future pending appointments at the given times (for schedule changes).
export async function futurePendingBookings(clinicId, { date = null, keepSlots = null, keepDays = null } = {}) {
  const today = await clinicToday();
  const rows = await select(
    `SELECT id, to_char(date, 'YYYY-MM-DD') AS date, slot FROM bookings
      WHERE clinic_id = :clinicId AND status = 'pending' AND date >= :today
        AND (:date::date IS NULL OR date = :date::date)`,
    { clinicId, today, date },
  );
  return rows.filter(
    (b) => (keepSlots && !keepSlots.includes(b.slot)) || (keepDays && !keepDays.includes(weekday(b.date))) || (!keepSlots && !keepDays),
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function assertNoAffectedBookings(bookings, what) {
  if (bookings.length) {
    throw conflict(`${plural(bookings.length, "upcoming appointment")} would be left without a time: ${what}. Cancel or move them first.`, {
      code: "BOOKINGS_AFFECTED",
      details: { bookings: bookings.slice(0, 50) },
    });
  }
}

// A clinic with clinical, billing or appointment history can't be deleted
// (the database would otherwise cascade-delete all of it).
export async function assertClinicDeletable(clinicId, { transaction } = {}) {
  const counts = await one(
    `SELECT (SELECT count(*)::int FROM bookings WHERE clinic_id = :clinicId) AS bookings,
            (SELECT count(*)::int FROM treatments WHERE clinic_id = :clinicId) AS treatments,
            (SELECT count(*)::int FROM ledger_records WHERE clinic_id = :clinicId) AS ledger_entries`,
    { clinicId },
    { transaction },
  );
  const parts = [
    counts.bookings && plural(counts.bookings, "appointment"),
    counts.treatments && plural(counts.treatments, "treatment"),
    counts.ledger_entries && plural(counts.ledger_entries, "ledger entry").replace("entrys", "entries"),
  ].filter(Boolean);
  if (parts.length) {
    throw conflict(`This clinic has ${parts.join(", ")}. A clinic with history can't be deleted.`, {
      code: "CLINIC_HAS_HISTORY",
      details: counts,
    });
  }
}

export async function advanceBalance(clinicId, patientId, { transaction } = {}) {
  const { balance } = await one(
    `SELECT coalesce(sum(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END), 0)::int AS balance
       FROM ledgers WHERE clinic_id = :clinicId AND patient_id = :patientId`,
    { clinicId, patientId },
    { transaction },
  );
  return balance;
}

export function assertAmount(value, label) {
  if (!Number.isInteger(value) || value < 0) throw badRequest(`${label} must be a whole number of rupees.`);
}
