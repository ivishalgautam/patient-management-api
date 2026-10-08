"use strict";
// Chair board: chairs per clinic, the day's appointments by chair, and the
// patient's journey (arrived -> in chair -> done) for waiting-time numbers.
// Completing the appointment itself (which opens a treatment) stays on the
// existing PUT /bookings/status/:id.
import config from "../../config/index.js";
import { select, one, exec } from "../../db/sql.js";
import { AppError, badRequest, conflict, notFound } from "../../lib/app-error.js";
import { clinicToday } from "../../lib/booking-rules.js";

const rule = (message, code) => new AppError(400, message, { code });

async function assertClinic(ctx, clinicId) {
  const row = await one(`SELECT 1 FROM clinics WHERE id = :id AND practice_id = :practiceId`, { id: clinicId, practiceId: ctx.practiceId });
  if (!row) throw notFound("Clinic not found.");
}

// --- chairs ---------------------------------------------------------------------

export async function listChairs(ctx, { clinic_id: clinicId, include_archived: includeArchived }) {
  await assertClinic(ctx, clinicId);
  return select(
    `SELECT * FROM chairs WHERE clinic_id = :clinicId ${includeArchived ? "" : "AND archived_at IS NULL"}
      ORDER BY archived_at NULLS FIRST, position, created_at`,
    { clinicId },
  );
}

async function assertFreeName(clinicId, name, exceptId = null) {
  const taken = await one(
    `SELECT 1 FROM chairs WHERE clinic_id = :clinicId AND lower(name) = lower(:name) AND archived_at IS NULL
        AND (:exceptId::uuid IS NULL OR id <> :exceptId)`,
    { clinicId, name, exceptId },
  );
  if (taken) throw conflict(`There's already a chair called "${name}".`);
}

export async function createChair(ctx, input) {
  await assertClinic(ctx, input.clinic_id);
  await assertFreeName(input.clinic_id, input.name);
  return one(
    `INSERT INTO chairs (practice_id, clinic_id, name, color, position)
     VALUES (:practiceId, :clinicId, :name, coalesce(:color, '#0ea5e9'),
             (SELECT coalesce(max(position) + 1, 0) FROM chairs WHERE clinic_id = :clinicId))
     RETURNING *`,
    { practiceId: ctx.practiceId, clinicId: input.clinic_id, name: input.name, color: input.color ?? null },
  );
}

async function loadChair(ctx, id) {
  const chair = await one(`SELECT * FROM chairs WHERE id = :id AND practice_id = :practiceId`, { id, practiceId: ctx.practiceId });
  if (!chair) throw notFound("Chair not found.");
  return chair;
}

export async function updateChair(ctx, id, input) {
  const chair = await loadChair(ctx, id);
  if (input.name) await assertFreeName(chair.clinic_id, input.name, id);
  if (input.archived === false && chair.archived_at) await assertFreeName(chair.clinic_id, input.name ?? chair.name, id);
  return one(
    `UPDATE chairs SET name = coalesce(:name, name), color = coalesce(:color, color), position = coalesce(:position, position),
            archived_at = CASE WHEN :archived::boolean IS NULL THEN archived_at WHEN :archived THEN coalesce(archived_at, now()) ELSE NULL END
      WHERE id = :id RETURNING *`,
    { id, name: input.name ?? null, color: input.color ?? null, position: input.position ?? null, archived: input.archived ?? null },
  );
}

// --- the day board -------------------------------------------------------------------

const BOOKING_COLUMNS = `
  b.id, b.clinic_id, b.patient_id, b.doctor_id, b.chair_id, to_char(b.date, 'YYYY-MM-DD') AS date,
  to_char(b.slot, 'HH24:MI') AS slot, b.status, b.checked_in_at, b.seated_at, b.finished_at,
  pu.fullname AS patient_name, pu.mobile_number AS patient_phone, du.fullname AS doctor_name,
  ch.name AS chair_name, ch.color AS chair_color`;
const BOOKING_FROM = `FROM bookings b
  JOIN patients p ON p.id = b.patient_id JOIN users pu ON pu.id = p.user_id
  LEFT JOIN doctors d ON d.id = b.doctor_id LEFT JOIN users du ON du.id = d.user_id
  LEFT JOIN chairs ch ON ch.id = b.chair_id`;

// Where the patient is in their visit.
export function stageOf(b) {
  if (b.status === "canceled") return "canceled";
  if (b.finished_at || b.status === "completed") return "done";
  if (b.seated_at) return "in_chair";
  if (b.checked_in_at) return "waiting";
  return "booked";
}

const minutesBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
const decorate = (b, now = new Date()) => ({
  ...b,
  stage: stageOf(b),
  wait_minutes: b.checked_in_at ? minutesBetween(b.checked_in_at, b.seated_at ?? (b.finished_at || now)) : null,
  chair_minutes: b.seated_at ? minutesBetween(b.seated_at, b.finished_at ?? now) : null,
});

export async function dayBoard(ctx, { clinic_id: clinicId, date }) {
  await assertClinic(ctx, clinicId);
  const day = date ?? (await clinicToday());
  const [chairs, bookings, schedule] = await Promise.all([
    listChairs(ctx, { clinic_id: clinicId }),
    select(`SELECT ${BOOKING_COLUMNS} ${BOOKING_FROM} WHERE b.clinic_id = :clinicId AND b.date = :day ORDER BY b.slot, pu.fullname`, {
      clinicId,
      day,
    }),
    one(`SELECT slots, interval_in_minute FROM slots WHERE clinic_id = :clinicId LIMIT 1`, { clinicId }),
  ]);
  const rows = bookings.map((b) => decorate(b));
  const waited = rows.filter((b) => b.seated_at && b.checked_in_at);
  return {
    date: day,
    slots: (schedule?.slots ?? []).map((s) => String(s).slice(0, 5)),
    interval_minutes: schedule?.interval_in_minute ?? 30,
    chairs,
    bookings: rows,
    stats: {
      booked: rows.filter((b) => b.stage !== "canceled").length,
      waiting: rows.filter((b) => b.stage === "waiting").length,
      in_chair: rows.filter((b) => b.stage === "in_chair").length,
      done: rows.filter((b) => b.stage === "done").length,
      no_show: rows.filter((b) => b.stage === "booked").length,
      avg_wait_minutes: waited.length ? Math.round(waited.reduce((s, b) => s + b.wait_minutes, 0) / waited.length) : null,
    },
  };
}

async function loadBooking(ctx, id) {
  const b = await one(`SELECT ${BOOKING_COLUMNS} ${BOOKING_FROM} WHERE b.id = :id AND b.practice_id = :practiceId`, { id, practiceId: ctx.practiceId });
  if (!b) throw notFound("Appointment not found.");
  return b;
}
const reload = async (ctx, id) => decorate(await loadBooking(ctx, id));

function assertActive(b) {
  if (b.status === "canceled") throw rule("This appointment was cancelled.", "BOOKING_CLOSED");
}

// Someone else already in this chair right now?
async function assertChairFree(b, chairId) {
  const busy = await one(
    `SELECT pu.fullname FROM bookings x JOIN patients p ON p.id = x.patient_id JOIN users pu ON pu.id = p.user_id
      WHERE x.chair_id = :chairId AND x.id <> :id AND x.date = :date AND x.seated_at IS NOT NULL AND x.finished_at IS NULL
        AND x.status <> 'canceled' LIMIT 1`,
    { chairId, id: b.id, date: b.date },
  );
  if (busy) throw rule(`${busy.fullname} is still in that chair. Finish their visit first.`, "CHAIR_BUSY");
}

async function assertChairOfClinic(chairId, clinicId) {
  const chair = await one(`SELECT clinic_id, archived_at FROM chairs WHERE id = :id`, { id: chairId });
  if (!chair || chair.clinic_id !== clinicId) throw badRequest("That chair isn't in this appointment's clinic.");
  if (chair.archived_at) throw badRequest("That chair is archived.");
}

export async function assignChair(ctx, id, { chair_id: chairId }) {
  const b = await loadBooking(ctx, id);
  assertActive(b);
  if (chairId) {
    await assertChairOfClinic(chairId, b.clinic_id);
    if (b.seated_at && !b.finished_at) await assertChairFree(b, chairId);
  }
  await exec(`UPDATE bookings SET chair_id = :chairId, updated_at = now() WHERE id = :id`, { id, chairId: chairId ?? null });
  return reload(ctx, id);
}

export async function checkIn(ctx, id) {
  const b = await loadBooking(ctx, id);
  assertActive(b);
  if (b.checked_in_at) throw rule("The patient is already checked in.", "ALREADY_CHECKED_IN");
  if (b.date > (await clinicToday())) throw rule("Patients can only be checked in on the day of their appointment.", "NOT_TODAY");
  await exec(`UPDATE bookings SET checked_in_at = now(), updated_at = now() WHERE id = :id`, { id });
  return reload(ctx, id);
}

export async function seat(ctx, id, { chair_id: chairId }) {
  const b = await loadBooking(ctx, id);
  assertActive(b);
  if (b.seated_at) throw rule("The patient is already in a chair.", "ALREADY_SEATED");
  const target = chairId ?? b.chair_id;
  if (!target) throw badRequest("Choose a chair.");
  await assertChairOfClinic(target, b.clinic_id);
  await assertChairFree(b, target);
  if (b.date > (await clinicToday())) throw rule("Patients can only be seated on the day of their appointment.", "NOT_TODAY");
  // Walk-ins seated straight away count as checked in now.
  await exec(
    `UPDATE bookings SET chair_id = :chairId, checked_in_at = coalesce(checked_in_at, now()), seated_at = now(), updated_at = now()
      WHERE id = :id`,
    { id, chairId: target },
  );
  return reload(ctx, id);
}

export async function finish(ctx, id) {
  const b = await loadBooking(ctx, id);
  assertActive(b);
  if (!b.seated_at) throw rule("The patient hasn't been seated yet.", "NOT_SEATED");
  if (b.finished_at) throw rule("This visit is already finished.", "ALREADY_FINISHED");
  await exec(`UPDATE bookings SET finished_at = now(), updated_at = now() WHERE id = :id`, { id });
  return reload(ctx, id);
}

// Undo the last step (a mis-tap at the front desk).
export async function undo(ctx, id) {
  const b = await loadBooking(ctx, id);
  assertActive(b);
  const column = b.finished_at ? "finished_at" : b.seated_at ? "seated_at" : b.checked_in_at ? "checked_in_at" : null;
  if (!column) throw badRequest("Nothing to undo.");
  if (column === "finished_at" && b.status === "completed") throw rule("The appointment is completed; it can't be reopened here.", "BOOKING_CLOSED");
  await exec(`UPDATE bookings SET ${column} = NULL, updated_at = now() WHERE id = :id`, { id });
  return reload(ctx, id);
}

// --- waiting-time analysis -------------------------------------------------------------

export async function waitingReport(ctx, { clinic_id: clinicId, from, to }) {
  await assertClinic(ctx, clinicId);
  const params = { clinicId, from, to, tz: config.clinic_timezone || "Asia/Kolkata" };
  const where = `b.clinic_id = :clinicId AND b.date BETWEEN :from::date AND :to::date AND b.status <> 'canceled'`;
  const [byDay, byDoctor, byHour, totals] = await Promise.all([
    select(
      `SELECT to_char(b.date, 'YYYY-MM-DD') AS date, count(*)::int AS appointments,
              count(b.checked_in_at)::int AS arrived,
              round(avg(extract(epoch FROM b.seated_at - b.checked_in_at) / 60) FILTER (WHERE b.seated_at IS NOT NULL))::int AS avg_wait,
              round(avg(extract(epoch FROM b.finished_at - b.seated_at) / 60) FILTER (WHERE b.finished_at IS NOT NULL))::int AS avg_chair
         FROM bookings b WHERE ${where} GROUP BY b.date ORDER BY b.date`,
      params,
    ),
    select(
      `SELECT coalesce(du.fullname, 'Unassigned') AS doctor, count(*)::int AS appointments,
              round(avg(extract(epoch FROM b.seated_at - b.checked_in_at) / 60) FILTER (WHERE b.seated_at IS NOT NULL))::int AS avg_wait,
              round(avg(extract(epoch FROM b.finished_at - b.seated_at) / 60) FILTER (WHERE b.finished_at IS NOT NULL))::int AS avg_chair
         FROM bookings b LEFT JOIN doctors d ON d.id = b.doctor_id LEFT JOIN users du ON du.id = d.user_id
        WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`,
      params,
    ),
    select(
      `SELECT extract(hour FROM b.checked_in_at AT TIME ZONE :tz)::int AS hour, count(*)::int AS arrivals,
              round(avg(extract(epoch FROM b.seated_at - b.checked_in_at) / 60) FILTER (WHERE b.seated_at IS NOT NULL))::int AS avg_wait
         FROM bookings b WHERE ${where} AND b.checked_in_at IS NOT NULL GROUP BY 1 ORDER BY 1`,
      params,
    ),
    one(
      `SELECT count(*)::int AS appointments, count(b.checked_in_at)::int AS arrived,
              count(*) FILTER (WHERE b.checked_in_at IS NULL AND b.status = 'pending' AND b.date < (now() AT TIME ZONE :tz)::date)::int AS no_shows,
              round(avg(extract(epoch FROM b.seated_at - b.checked_in_at) / 60) FILTER (WHERE b.seated_at IS NOT NULL))::int AS avg_wait,
              max(round(extract(epoch FROM b.seated_at - b.checked_in_at) / 60))::int AS longest_wait,
              round(avg(extract(epoch FROM b.finished_at - b.seated_at) / 60) FILTER (WHERE b.finished_at IS NOT NULL))::int AS avg_chair
         FROM bookings b WHERE ${where}`,
      params,
    ),
  ]);
  return { totals, by_day: byDay, by_doctor: byDoctor, by_hour: byHour };
}
