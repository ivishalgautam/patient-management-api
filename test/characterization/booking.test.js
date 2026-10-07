import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, nextWorkingDate, createPatient } from "../setup/factories.js";
import { waflyRequest } from "../setup/env.js";

let app;
let p;
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
});
afterAll(() => app.close());

describe("booking", () => {
  it("books a slot and sends the WhatsApp confirmation", async () => {
    waflyRequest.mockClear();
    const date = nextWorkingDate();
    const res = await api(app, p.staff.token).post("/v1/bookings", {
      clinic_id: p.clinic.id,
      patient_id: p.patient.id,
      date,
      slot: "09:30:00",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe(true);

    const [row] = await query(
      `SELECT status, doctor_id FROM bookings WHERE patient_id = :pid AND date = :date`,
      { pid: p.patient.id, date },
    );
    expect(row.status).toBe("pending");
    expect(row.doctor_id).toBe(p.doctor.doctor.id);
    expect(waflyRequest).toHaveBeenCalledTimes(1);
    expect(waflyRequest.mock.calls[0][0].url).toContain("sendtemplate.php");
  });

  it("rejects a slot that is not in the clinic's slot template", async () => {
    const res = await api(app, p.staff.token).post("/v1/bookings", {
      clinic_id: p.clinic.id,
      patient_id: p.patient.id,
      date: nextWorkingDate(),
      slot: "13:00:00",
    });
    expect(res.statusCode).toBe(404);
  });

  it("enforces max_patients_per_slot", async () => {
    const date = nextWorkingDate(3);
    const other = await createPatient(app, p.doctor.token);
    const first = await api(app, p.staff.token).post("/v1/bookings", {
      clinic_id: p.clinic.id,
      patient_id: p.patient.id,
      date,
      slot: "10:00:00",
    });
    expect(first.statusCode).toBe(200);
    const second = await api(app, p.staff.token).post("/v1/bookings", {
      clinic_id: p.clinic.id,
      patient_id: other.id,
      date,
      slot: "10:00:00",
    });
    expect(second.statusCode).toBe(400);
    expect(second.json().message).toBe("Slots full.");
  });

  it("returns 404 for an unknown clinic (was a ReferenceError)", async () => {
    const res = await api(app, p.staff.token).post("/v1/bookings", {
      clinic_id: "00000000-0000-4000-8000-000000000000",
      patient_id: p.patient.id,
      date: nextWorkingDate(),
      slot: "09:00:00",
    });
    expect(res.statusCode).toBe(404);
  });

  it("completing a booking creates a treatment and maps the patient to the clinic", async () => {
    const patient = await createPatient(app, p.doctor.token);
    const date = nextWorkingDate(4);
    await api(app, p.staff.token).post("/v1/bookings", {
      clinic_id: p.clinic.id,
      patient_id: patient.id,
      date,
      slot: "11:00:00",
    });
    const [booking] = await query(
      `SELECT id FROM bookings WHERE patient_id = :pid`,
      { pid: patient.id },
    );
    const res = await api(app, p.doctor.token).put(
      `/v1/bookings/status/${booking.id}`,
      { status: "completed", service_id: p.service.id },
    );
    expect(res.statusCode).toBe(200);

    const treatments = await query(
      `SELECT status, appointment_id FROM treatments WHERE patient_id = :pid`,
      { pid: patient.id },
    );
    expect(treatments).toHaveLength(1);
    expect(treatments[0].status).toBe("active");
    expect(treatments[0].appointment_id).toBe(booking.id);
    const maps = await query(
      `SELECT 1 FROM clinic_patient_mappings WHERE patient_id = :pid AND clinic_id = :cid`,
      { pid: patient.id, cid: p.clinic.id },
    );
    expect(maps).toHaveLength(1);

    const again = await api(app, p.doctor.token).put(
      `/v1/bookings/status/${booking.id}`,
      { status: "canceled" },
    );
    expect(again.statusCode).toBe(400);
  });

  it("lists bookings for a clinic", async () => {
    const res = await api(app, p.doctor.token).get(
      `/v1/bookings/getByClinicId/${p.clinic.id}`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe(true);
  });

  it("blocks a date for the clinic", async () => {
    const res = await api(app, p.doctor.token).post("/v1/block-slots", {
      clinic_id: p.clinic.id,
      type: "date",
      date: nextWorkingDate(10),
      slots: [],
    });
    expect(res.statusCode).toBe(200);
  });

  it("early returns don't leak database connections", async () => {
    // "Slots full" returns before commit; do it more times than the pool size.
    const date = nextWorkingDate(5);
    const patient = await createPatient(app, p.doctor.token);
    await api(app, p.staff.token).post("/v1/bookings", {
      clinic_id: p.clinic.id,
      patient_id: patient.id,
      date,
      slot: "09:00:00",
    });
    for (let i = 0; i < 12; i++) {
      const res = await api(app, p.staff.token).post("/v1/bookings", {
        clinic_id: p.clinic.id,
        patient_id: p.patient.id,
        date,
        slot: "09:00:00",
      });
      expect(res.statusCode).toBe(400);
    }
    const started = Date.now();
    const res = await api(app, p.doctor.token).get(`/v1/bookings/getByClinicId/${p.clinic.id}`);
    expect(res.statusCode).toBe(200);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
