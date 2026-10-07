import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, createPatient, nextWorkingDate } from "../setup/factories.js";

// Audit defect #24: state rules for appointments, schedules, clinics and
// billing. setupPractice's clinic is open 09:00–12:00 every 30 min, closed
// Sundays, one patient per slot.
let app;
let p;
let doctor;
let staff;
let patient;
let otherPatient;

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(400);
  return res.json().data;
};
const book = (date, slot, patientId = patient.id) =>
  staff.post("/v1/bookings", { clinic_id: p.clinic.id, patient_id: patientId, date, slot });
const bookingId = async (date, slot) =>
  (await query(`SELECT id FROM bookings WHERE clinic_id = :c AND date = :date AND slot = :slot`, { c: p.clinic.id, date, slot }))[0].id;

function nextSunday(minDaysAhead = 3) {
  const d = new Date();
  d.setDate(d.getDate() + minDaysAhead);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
  doctor = api(app, p.doctor.token);
  staff = api(app, p.staff.token);
  patient = await createPatient(app, p.doctor.token);
  otherPatient = await createPatient(app, p.doctor.token);
});
afterAll(() => app.close());

describe("booking", () => {
  it("refuses past dates, days off and blocked time", async () => {
    const past = await book("2020-01-06", "09:00:00");
    expect(past.statusCode).toBe(400);
    expect(past.json().code).toBe("BOOKING_IN_PAST");

    const sunday = await book(nextSunday(), "09:00:00");
    expect(sunday.statusCode).toBe(400);
    expect(sunday.json().code).toBe("CLINIC_DAY_OFF");

    const blockedDay = nextWorkingDate(10);
    ok(await doctor.post("/v1/block-slots", { clinic_id: p.clinic.id, type: "date", date: blockedDay, slots: [] }));
    expect((await book(blockedDay, "09:00:00")).json().code).toBe("SLOT_BLOCKED");

    const partlyBlocked = nextWorkingDate(11);
    ok(await doctor.post("/v1/block-slots", { clinic_id: p.clinic.id, type: "slot", date: partlyBlocked, slots: ["10:00:00"] }));
    expect((await book(partlyBlocked, "10:00:00")).json().code).toBe("SLOT_BLOCKED");
    expect((await book(partlyBlocked, "10:30:00")).statusCode).toBe(200);
  });

  it("still refuses times outside the schedule and full slots", async () => {
    const date = nextWorkingDate(12);
    expect((await book(date, "13:00:00")).statusCode).toBe(404);
    ok(await book(date, "09:00:00"));
    const full = await book(date, "09:00:00", otherPatient.id);
    expect(full.statusCode).toBe(400);
    expect(full.json().message).toBe("Slots full.");
  });
});

describe("rescheduling and status", () => {
  const date = nextWorkingDate(13);
  let id;

  it("moves a booking to a free time, never into the past or a full slot", async () => {
    ok(await book(date, "09:00:00"));
    ok(await book(date, "10:00:00", otherPatient.id));
    id = await bookingId(date, "09:00:00");

    // Saving without changing the time doesn't count the booking against itself.
    expect((await staff.put(`/v1/bookings/${id}`, { date, slot: "09:00:00" })).statusCode).toBe(200);
    expect((await staff.put(`/v1/bookings/${id}`, { slot: "09:30:00" })).statusCode).toBe(200);
    expect((await staff.put(`/v1/bookings/${id}`, { date: "2020-01-06" })).json().code).toBe("BOOKING_IN_PAST");
    const full = await staff.put(`/v1/bookings/${id}`, { slot: "10:00:00" });
    expect(full.statusCode).toBe(400);
    expect(full.json().message).toBe("Slots full.");
    const [row] = await query(`SELECT slot, doctor_id FROM bookings WHERE id = :id`, { id });
    expect(row.slot).toBe("09:30:00");
  });

  it("status and patient can't be changed through a plain update", async () => {
    expect((await staff.put(`/v1/bookings/${id}`, { status: "completed" })).statusCode).toBe(400);
    expect((await staff.put(`/v1/bookings/${id}`, { patient_id: otherPatient.id })).statusCode).toBe(400);
    expect((await staff.put(`/v1/bookings/status/${id}`, { status: "done" })).statusCode).toBe(400);
  });

  it("completed and canceled appointments can't be edited", async () => {
    ok(await doctor.put(`/v1/bookings/status/${id}`, { status: "completed", service_id: p.service.id }));
    const res = await staff.put(`/v1/bookings/${id}`, { slot: "11:00:00" });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Can't change booking completed.");

    const other = await bookingId(date, "10:00:00");
    ok(await staff.put(`/v1/bookings/status/${other}`, { status: "canceled" }));
    expect((await staff.put(`/v1/bookings/${other}`, { slot: "11:30:00" })).json().message).toBe("Can't change booking canceled.");
  });
});

describe("schedule changes", () => {
  const date = nextWorkingDate(15);
  let slotId;

  beforeAll(async () => {
    ok(await book(date, "11:30:00"));
    [{ id: slotId }] = await query(`SELECT id FROM slots WHERE clinic_id = :c`, { c: p.clinic.id });
  });

  it("won't drop a time or day that upcoming appointments use", async () => {
    const shorter = await doctor.put(`/v1/slots/${slotId}`, { start_time: "09:00:00", end_time: "11:00:00", interval_in_minute: 30, days_off: [0] });
    expect(shorter.statusCode).toBe(409);
    expect(shorter.json().code).toBe("BOOKINGS_AFFECTED");
    expect(shorter.json().message).toMatch(/upcoming appointment/);

    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const closed = await doctor.put(`/v1/slots/${slotId}`, { start_time: "09:00:00", end_time: "12:00:00", interval_in_minute: 30, days_off: [0, weekday] });
    expect(closed.statusCode).toBe(409);

    // A change that keeps every booked time is fine.
    expect((await doctor.put(`/v1/slots/${slotId}`, { start_time: "09:00:00", end_time: "12:00:00", interval_in_minute: 30, days_off: [0] })).statusCode).toBe(200);
    expect((await doctor.delete(`/v1/slots/${slotId}`)).statusCode).toBe(409);
  });

  it("won't block time that already has appointments", async () => {
    const day = await doctor.post("/v1/block-slots", { clinic_id: p.clinic.id, type: "date", date, slots: [] });
    expect(day.statusCode).toBe(409);
    expect((await doctor.post("/v1/block-slots", { clinic_id: p.clinic.id, type: "slot", date, slots: ["11:30:00"] })).statusCode).toBe(409);
    expect((await doctor.post("/v1/block-slots", { clinic_id: p.clinic.id, type: "slot", date, slots: ["09:00:00"] })).statusCode).toBe(200);
  });
});

describe("deleting a clinic", () => {
  it("is allowed while the clinic has no history", async () => {
    const empty = ok(await doctor.post("/v1/clinics", { name: "Pop-up", address: "Camp" }));
    expect((await doctor.delete(`/v1/clinics/${empty.id}`)).statusCode).toBe(200);
  });

  it("is refused once it has appointments, treatments or ledger entries", async () => {
    const res = await doctor.delete(`/v1/clinics/${p.clinic.id}`);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("CLINIC_HAS_HISTORY");
    expect((await query(`SELECT 1 FROM clinics WHERE id = :id`, { id: p.clinic.id })).length).toBe(1);
  });

  it("the database refuses too", async () => {
    await expect(query(`DELETE FROM clinics WHERE id = :id`, { id: p.clinic.id })).rejects.toThrow(/foreign key/);
  });
});

describe("payments and advances", () => {
  let treatmentId;
  let secondClinic;
  const pay = (body) =>
    doctor.post("/v1/treatment-payments", {
      treatment_id: treatmentId,
      clinic_id: p.clinic.id,
      payment_type: "installment",
      payment_method: "cash",
      amount_paid: 0,
      ...body,
    });
  const balance = async () =>
    (
      await query(
        `SELECT coalesce(sum(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END), 0)::int AS b
           FROM ledgers WHERE clinic_id = :c AND patient_id = :p`,
        { c: p.clinic.id, p: patient.id },
      )
    )[0].b;

  beforeAll(async () => {
    ok(await doctor.post("/v1/treatments", { clinic_id: p.clinic.id, patient_id: patient.id, service_id: p.service.id }));
    [{ id: treatmentId }] = await query(`SELECT id FROM treatments WHERE patient_id = :pid AND status = 'active' ORDER BY created_at LIMIT 1`, {
      pid: patient.id,
    });
    ok(await doctor.post("/v1/treatment-plans", { treatment_id: treatmentId, patient_id: patient.id, total_cost: 10000, notes: [], affected_tooths: [] }));
    secondClinic = ok(await doctor.post("/v1/clinics", { name: "Second", address: "Elsewhere" }));
  });

  it("checks the clinic and the amounts", async () => {
    expect((await pay({ clinic_id: secondClinic.id, amount_paid: 1000 })).json().message).toBe("The payment's clinic must be the treatment's clinic.");
    expect((await pay({ amount_paid: 0 })).json().message).toBe("Enter the amount paid or the advance used.");
    expect((await pay({ amount_paid: 2.5 })).json().message).toBe("Amount paid must be a whole number of rupees.");
  });

  it("an edited payment stays within the balance", async () => {
    const payment = ok(await pay({ amount_paid: 4000 }));
    expect((await doctor.put(`/v1/treatment-payments/${payment.id}`, { amount_paid: 7000 })).statusCode).toBe(200);
    const over = await doctor.put(`/v1/treatment-payments/${payment.id}`, { amount_paid: 11000 });
    expect(over.statusCode).toBe(400);
    expect(over.json().message).toBe("Remaining balance is 10000");
    expect((await doctor.put(`/v1/treatment-payments/${payment.id}`, { advance_used: 500 })).json().message).toMatch(/advance used can't be changed/);
    expect((await doctor.put(`/v1/treatment-payments/${payment.id}`, { payment_method: "cheque" })).statusCode).toBe(400);
    const [row] = await query(`SELECT amount_paid FROM treatment_payments WHERE id = :id`, { id: payment.id });
    expect(row.amount_paid).toBe(7000);
  });

  it("the advance balance never goes negative", async () => {
    const credit = ok(
      await doctor.post("/v1/ledgers", {
        clinic_id: p.clinic.id,
        patient_id: patient.id,
        reference_type: "adjustment",
        entry_type: "credit",
        amount: 3000,
      }),
    );
    const debit = await doctor.post("/v1/ledgers", {
      clinic_id: p.clinic.id,
      patient_id: patient.id,
      reference_type: "adjustment",
      entry_type: "debit",
      amount: 5000,
    });
    expect(debit.statusCode).toBe(400);
    expect(debit.json().message).toBe("Advance balance is 3000.");

    const withAdvance = ok(await pay({ advance_used: 2000 }));
    expect(await balance()).toBe(1000);
    // 2000 of this credit is spent, so deleting it would leave -2000.
    expect((await doctor.delete(`/v1/ledgers/${credit.id}`)).json().message).toMatch(/already been used \(balance 1000\)/);

    // Deleting the payment gives its advance back.
    ok(await doctor.delete(`/v1/treatment-payments/${withAdvance.id}`));
    expect(await balance()).toBe(3000);
    expect((await doctor.delete(`/v1/ledgers/${credit.id}`)).statusCode).toBe(200);
    expect(await balance()).toBe(0);
  });
});
