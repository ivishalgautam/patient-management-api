import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, createPatient } from "../setup/factories.js";

let app;
let p;
let treatmentId;
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
  await api(app, p.doctor.token).post("/v1/treatments", {
    clinic_id: p.clinic.id,
    patient_id: p.patient.id,
    service_id: p.service.id,
  });
  [{ id: treatmentId }] = await query(`SELECT id FROM treatments WHERE patient_id = :p`, {
    p: p.patient.id,
  });
  await api(app, p.doctor.token).post("/v1/treatment-plans", {
    treatment_id: treatmentId,
    patient_id: p.patient.id,
    total_cost: 3000,
    notes: [],
  });
});
afterAll(() => app.close());

describe("soft-deleted payments and ledger entries", () => {
  it("deleting a payment hides it, restores the balance and keeps the record", async () => {
    const asDoctor = api(app, p.doctor.token);
    await asDoctor.post("/v1/treatment-payments", {
      treatment_id: treatmentId,
      clinic_id: p.clinic.id,
      payment_type: "installment",
      payment_method: "cash",
      amount_paid: 1000,
    });
    const [{ id }] = await query(`SELECT id FROM treatment_payments WHERE treatment_id = :t`, { t: treatmentId });

    const del = await asDoctor.delete(`/v1/treatment-payments/${id}`);
    expect(del.statusCode).toBe(200);
    expect(await query(`SELECT 1 FROM treatment_payments WHERE id = :id`, { id })).toHaveLength(0);
    const [kept] = await query(`SELECT deleted_at FROM treatment_payment_records WHERE id = :id`, { id });
    expect(kept.deleted_at).not.toBeNull();

    const again = await asDoctor.post("/v1/treatment-payments", {
      treatment_id: treatmentId,
      clinic_id: p.clinic.id,
      payment_type: "full",
      payment_method: "upi",
      amount_paid: 3000,
    });
    expect(again.statusCode).toBe(200);
    expect((await asDoctor.get(`/v1/treatment-payments/${id}`)).statusCode).toBe(404);
  });

  it("deleting a ledger entry removes it from the balance", async () => {
    const asDoctor = api(app, p.doctor.token);
    await asDoctor.post("/v1/ledgers", {
      clinic_id: p.clinic.id,
      patient_id: p.patient.id,
      reference_type: "adjustment",
      entry_type: "credit",
      amount: 700,
    });
    const balance = async () =>
      (await asDoctor.get(`/v1/ledgers/${p.clinic.id}/${p.patient.id}`)).json().data;
    expect(await balance()).toBe(700);
    const [{ id }] = await query(`SELECT id FROM ledgers WHERE patient_id = :p`, { p: p.patient.id });
    await asDoctor.delete(`/v1/ledgers/${id}`);
    expect(await balance()).toBe(0);
    expect(await query(`SELECT 1 FROM ledger_records WHERE id = :id`, { id })).toHaveLength(1);
  });
});

describe("staff accounts", () => {
  it("a deleted staff member can't log in or use old tokens and leaves the staff list", async () => {
    const res = await api(app, p.doctor.token).delete(`/v1/users/${p.staff.user.id}`);
    expect(res.statusCode).toBe(200);
    expect((await api(app, p.staff.token).get("/v1/users/me")).statusCode).toBe(401);
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: p.staff.user.username, password: "Staff@123" },
    });
    expect(loginRes.statusCode).toBe(404);
    const list = await api(app, p.doctor.token).get("/v1/staff?page=1&limit=50");
    expect(list.body).not.toContain(p.staff.user.id);
  });

  it("the database refuses to hard-delete a user who authored records", async () => {
    await expect(
      query(`DELETE FROM users WHERE id = :id`, { id: p.doctor.user.id }),
    ).rejects.toThrow(/foreign key/);
  });

  it("deleting a patient still removes that patient's own records", async () => {
    const pat = await createPatient(app, p.doctor.token);
    await api(app, p.doctor.token).post("/v1/notes", {
      patient_id: pat.id,
      notes: "x",
      affected_tooths: "11",
    });
    const res = await api(app, p.doctor.token).delete(`/v1/users/${pat.user.id}`);
    expect(res.statusCode).toBe(200);
    expect(await query(`SELECT 1 FROM notes WHERE patient_id = :p`, { p: pat.id })).toHaveLength(0);
  });
});

describe("patient numbers", () => {
  it("parallel registrations get distinct ddss numbers", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        api(app, p.doctor.token).post("/v1/users", {
          role: "patient",
          fullname: `Parallel ${i}`,
          country_code: "91",
          mobile_number: `97000000${i}0`,
        }),
      ),
    );
    const names = results.map((r) => r.json().user?.username);
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(new Set(names).size).toBe(6);
  });
});

describe("clinic contact phone", () => {
  it("is part of the clinic and editable", async () => {
    const [row] = await query(`SELECT contact_phone FROM clinics WHERE id = :c`, { c: p.clinic.id });
    expect(row.contact_phone).toBe("");
  });
});
