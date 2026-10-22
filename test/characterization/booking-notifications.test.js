import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, nextWorkingDate } from "../setup/factories.js";

let app;
let p;
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
});
afterAll(() => app.close());

const notificationsFor = (userId, type) =>
  query(`SELECT type, title, body, link, booking_id FROM user_notifications WHERE user_id = :userId AND type = :type ORDER BY created_at`, { userId, type });

describe("appointment notifications", () => {
  let bookingId;
  const date = nextWorkingDate(4);

  it("tells the patient and the doctor about a new booking, not the staff member who made it", async () => {
    const res = await api(app, p.staff.token).post("/v1/bookings", { clinic_id: p.clinic.id, patient_id: p.patient.id, date, slot: "09:30:00" });
    expect(res.statusCode).toBe(200);
    [{ id: bookingId }] = await query(`SELECT id FROM bookings WHERE patient_id = :pid AND date = :date`, { pid: p.patient.id, date });

    const patient = await notificationsFor(p.patient.user.id, "appointment.booked");
    expect(patient).toHaveLength(1);
    expect(patient[0].title).toBe("Appointment booked");
    expect(patient[0].body).toContain("9:30 AM");
    expect(patient[0].link).toBe("/appointments");
    expect(patient[0].booking_id).toBe(bookingId);

    const doctor = await notificationsFor(p.doctor.user.id, "appointment.booked");
    expect(doctor).toHaveLength(1);
    expect(doctor[0].title).toBe("New appointment: Asha Patel");
    expect(doctor[0].link).toContain(`booking=${bookingId}`);

    expect(await notificationsFor(p.staff.user.id, "appointment.booked")).toHaveLength(0);
  });

  it("tells the patient and the front desk when the doctor reschedules", async () => {
    const res = await api(app, p.doctor.token).put(`/v1/bookings/${bookingId}`, { slot: "10:30:00" });
    expect(res.statusCode).toBe(200);

    const [patient] = await notificationsFor(p.patient.user.id, "appointment.rescheduled");
    expect(patient.body).toContain("10:30 AM");
    expect(patient.body).toContain("was");
    expect(patient.body).toContain("9:30 AM");
    expect(await notificationsFor(p.staff.user.id, "appointment.rescheduled")).toHaveLength(1);
    expect(await notificationsFor(p.doctor.user.id, "appointment.rescheduled")).toHaveLength(0);
  });

  it("does not notify an update that changes nothing", async () => {
    const res = await api(app, p.doctor.token).put(`/v1/bookings/${bookingId}`, { slot: "10:30:00" });
    expect(res.statusCode).toBe(200);
    expect(await notificationsFor(p.patient.user.id, "appointment.rescheduled")).toHaveLength(1);
  });

  it("tells everyone else when an appointment is cancelled", async () => {
    const res = await api(app, p.staff.token).put(`/v1/bookings/status/${bookingId}`, { status: "canceled" });
    expect(res.statusCode).toBe(200);
    const [patient] = await notificationsFor(p.patient.user.id, "appointment.canceled");
    expect(patient.title).toBe("Appointment cancelled");
    expect(await notificationsFor(p.doctor.user.id, "appointment.canceled")).toHaveLength(1);
    expect(await notificationsFor(p.staff.user.id, "appointment.canceled")).toHaveLength(0);
  });

  it("lists appointment notifications with the booking id", async () => {
    const res = await api(app, p.doctor.token).get("/v1/notifications?limit=50");
    expect(res.statusCode).toBe(200);
    const mine = res.json().data.filter((n) => n.type.startsWith("appointment."));
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.every((n) => n.booking_id === bookingId)).toBe(true);
  });
});
