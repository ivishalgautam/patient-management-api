import { beforeAll, afterAll, describe, it, expect } from "vitest";
import moment from "moment";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice } from "../setup/factories.js";
import { waflyGet } from "../setup/env.js";
import { processAppointmentNotifications } from "../../app/services/appointment-notification.service.js";

let app;
let p;
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
});
afterAll(() => app.close());

// Inserts a booking whose date+slot is `minutesFromNow` away (server TZ).
async function bookingAt(minutesFromNow, status) {
  const at = moment().add(minutesFromNow, "minutes");
  const [row] = await query(
    `INSERT INTO bookings (id, doctor_id, patient_id, clinic_id, date, slot, status, created_at, updated_at)
     VALUES (gen_random_uuid(), :doctor, :patient, :clinic, :date, :slot, :status, now(), now())
     RETURNING id`,
    {
      doctor: p.doctor.doctor.id,
      patient: p.patient.id,
      clinic: p.clinic.id,
      date: at.format("YYYY-MM-DD"),
      slot: at.format("HH:mm:ss"),
      status,
    },
  );
  return row.id;
}

const flags = async (id) =>
  (
    await query(
      `SELECT notification_24hr_sent, notification_2hr_sent,
              notification_1hr_after_sent, review_message_sent
         FROM bookings WHERE id = :id`,
      { id },
    )
  )[0];

describe("appointment reminder cron", () => {
  it("sends each reminder once inside its window", async () => {
    const day = await bookingAt(1438, "pending");
    const twoHours = await bookingAt(118, "pending");
    const followUp = await bookingAt(-62, "completed");
    const review = await bookingAt(-122, "completed");
    const outside = await bookingAt(600, "pending");

    waflyGet.mockClear();
    await processAppointmentNotifications();

    expect((await flags(day)).notification_24hr_sent).toBe(true);
    expect((await flags(twoHours)).notification_2hr_sent).toBe(true);
    expect((await flags(followUp)).notification_1hr_after_sent).toBe(true);
    expect((await flags(review)).review_message_sent).toBe(true);
    expect(Object.values(await flags(outside)).some(Boolean)).toBe(false);
    expect(waflyGet).toHaveBeenCalledTimes(4);

    waflyGet.mockClear();
    await processAppointmentNotifications();
    expect(waflyGet).not.toHaveBeenCalled();
  });
});
