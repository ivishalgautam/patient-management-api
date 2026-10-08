import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, createPatient } from "../setup/factories.js";
import { clinicToday } from "../../app/lib/booking-rules.js";

let app;
let A;
let B;
let doctor;
let staff;
let today;
let chair1;
let chair2;

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(400);
  return res.json().data;
};

// Straight into the table: the day may be the test clinic's day off.
async function book(p, patientId, { date = today, slot = "09:00:00" } = {}) {
  const [{ id }] = await query(
    `INSERT INTO bookings (id, practice_id, doctor_id, patient_id, clinic_id, date, slot, status, created_at, updated_at)
     SELECT gen_random_uuid(), c.practice_id, c.doctor_id, :patientId, c.id, :date, :slot, 'pending', now(), now()
       FROM clinics c WHERE c.id = :clinicId RETURNING id`,
    { patientId, clinicId: p.clinic.id, date, slot },
  );
  return id;
}

beforeAll(async () => {
  await resetDb();
  app = await buildTestApp();
  A = await setupPractice(app);
  B = await setupPractice(app);
  doctor = api(app, A.doctor.token);
  staff = api(app, A.staff.token);
  today = await clinicToday();
});
afterAll(async () => app?.close());

describe("chairs", () => {
  it("adds chairs per clinic, rejects duplicate names, archives", async () => {
    chair1 = ok(await doctor.post("/v1/schedule/chairs", { clinic_id: A.clinic.id, name: "Chair 1", color: "#10b981" }));
    chair2 = ok(await doctor.post("/v1/schedule/chairs", { clinic_id: A.clinic.id, name: "Chair 2" }));
    expect(chair2.position).toBe(1);
    expect((await doctor.post("/v1/schedule/chairs", { clinic_id: A.clinic.id, name: "chair 1" })).statusCode).toBe(409);
    const spare = ok(await doctor.post("/v1/schedule/chairs", { clinic_id: A.clinic.id, name: "Spare" }));
    ok(await doctor.put(`/v1/schedule/chairs/${spare.id}`, { archived: true }));
    const list = ok(await staff.get(`/v1/schedule/chairs?clinic_id=${A.clinic.id}`));
    expect(list.map((c) => c.name)).toEqual(["Chair 1", "Chair 2"]);
  });

  it("only clinic managers change chairs, and practices stay apart", async () => {
    expect((await staff.post("/v1/schedule/chairs", { clinic_id: A.clinic.id, name: "X" })).statusCode).toBe(403);
    expect((await api(app, B.doctor.token).post("/v1/schedule/chairs", { clinic_id: A.clinic.id, name: "X" })).statusCode).toBe(404);
    expect((await api(app, B.doctor.token).get(`/v1/schedule/day?clinic_id=${A.clinic.id}`)).statusCode).toBe(404);
  });
});

describe("patient journey", () => {
  let id;
  let other;

  it("shows the day's appointments by stage", async () => {
    id = await book(A, A.patient.id);
    const second = await createPatient(app, A.doctor.token, { fullname: "Ravi" });
    other = await book(A, second.id, { slot: "09:30:00" });
    const board = ok(await staff.get(`/v1/schedule/day?clinic_id=${A.clinic.id}`));
    expect(board.date).toBe(today);
    expect(board.chairs).toHaveLength(2);
    expect(board.bookings.map((b) => b.stage)).toEqual(["booked", "booked"]);
    expect(board.bookings[0]).toMatchObject({ slot: "09:00", patient_name: "Asha Patel" });
  });

  it("checks in, seats, finishes and measures the wait", async () => {
    ok(await staff.put(`/v1/schedule/bookings/${id}/chair`, { chair_id: chair1.id }));
    expect(ok(await staff.post(`/v1/schedule/bookings/${id}/check-in`)).stage).toBe("waiting");
    expect((await staff.post(`/v1/schedule/bookings/${id}/check-in`)).statusCode).toBe(400);
    // pretend the patient waited 12 minutes
    await query(`UPDATE bookings SET checked_in_at = now() - interval '12 minutes' WHERE id = :id`, { id });
    const seated = ok(await staff.post(`/v1/schedule/bookings/${id}/seat`, {}));
    expect(seated).toMatchObject({ stage: "in_chair", chair_id: chair1.id, wait_minutes: 12 });
  });

  it("won't put two patients in the same chair", async () => {
    const res = await staff.post(`/v1/schedule/bookings/${other}/seat`, { chair_id: chair1.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("CHAIR_BUSY");
    // a walk-in seated directly counts as checked in now
    expect(ok(await staff.post(`/v1/schedule/bookings/${other}/seat`, { chair_id: chair2.id }))).toMatchObject({ stage: "in_chair", wait_minutes: 0 });
  });

  it("finishes the visit, frees the chair and can undo a mis-tap", async () => {
    expect(ok(await staff.post(`/v1/schedule/bookings/${id}/finish`)).stage).toBe("done");
    expect(ok(await staff.post(`/v1/schedule/bookings/${id}/undo`)).stage).toBe("in_chair");
    ok(await staff.post(`/v1/schedule/bookings/${id}/finish`));
    const board = ok(await staff.get(`/v1/schedule/day?clinic_id=${A.clinic.id}`));
    expect(board.stats).toMatchObject({ booked: 2, in_chair: 1, done: 1, avg_wait_minutes: 6 });
  });

  it("refuses a chair from another clinic or practice and future check-ins", async () => {
    const otherChair = ok(await api(app, B.doctor.token).post("/v1/schedule/chairs", { clinic_id: B.clinic.id, name: "B1" }));
    expect((await staff.put(`/v1/schedule/bookings/${other}/chair`, { chair_id: otherChair.id })).statusCode).toBe(404);
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const later = await book(A, A.patient.id, { date: tomorrow });
    const res = await staff.post(`/v1/schedule/bookings/${later}/check-in`);
    expect(res.json().code).toBe("NOT_TODAY");
  });
});

describe("waiting report", () => {
  it("averages waits by day, doctor and hour", async () => {
    const r = ok(await doctor.get(`/v1/schedule/waiting-report?clinic_id=${A.clinic.id}&from=${today}&to=${today}`));
    expect(r.totals).toMatchObject({ appointments: 2, arrived: 2, avg_wait: 6, longest_wait: 12 });
    expect(r.by_day[0]).toMatchObject({ date: today, avg_wait: 6 });
    expect(r.by_doctor).toHaveLength(1);
    expect((await staff.get(`/v1/schedule/waiting-report?clinic_id=${A.clinic.id}&from=${today}&to=${today}`)).statusCode).toBe(403);
  });
});
