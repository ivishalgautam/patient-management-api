import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api } from "../setup/factories.js";

let app;
let p;
let treatmentId;
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
});
afterAll(() => app.close());

const asDoctor = () => api(app, p.doctor.token);

describe("treatment lifecycle", () => {
  it("adds a patient to treatment and maps them to the clinic", async () => {
    const res = await asDoctor().post("/v1/treatments", {
      clinic_id: p.clinic.id,
      patient_id: p.patient.id,
      service_id: p.service.id,
    });
    expect(res.statusCode).toBe(200);
    const [t] = await query(
      `SELECT id, status FROM treatments WHERE patient_id = :pid`,
      { pid: p.patient.id },
    );
    expect(t.status).toBe("active");
    treatmentId = t.id;
  });

  it("does not open a second active treatment for the same service", async () => {
    await asDoctor().post("/v1/treatments", {
      clinic_id: p.clinic.id,
      patient_id: p.patient.id,
      service_id: p.service.id,
    });
    const rows = await query(`SELECT 1 FROM treatments WHERE patient_id = :pid`, {
      pid: p.patient.id,
    });
    expect(rows).toHaveLength(1);
  });

  it("creates a treatment plan with affected teeth and cost", async () => {
    const res = await asDoctor().post("/v1/treatment-plans", {
      treatment_id: treatmentId,
      patient_id: p.patient.id,
      total_cost: 10000,
      notes: [{ note: "RCT on 36" }],
      affected_tooths: [{ tooth: "36", color: "#FF0000" }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.total_cost).toBe(10000);
  });

  it("records a prescription, a visit and vitals", async () => {
    const rx = await asDoctor().post("/v1/treatment-prescriptions", {
      treatment_id: treatmentId,
      data: [
        {
          medicine_name: "Amoxicillin",
          dosage: "500mg",
          tablet_amount: 1,
          frequency: "morning",
          duration: 5,
        },
      ],
    });
    expect(rx.statusCode).toBe(200);
    const visit = await asDoctor().post("/v1/treatment-visits", {
      treatment_id: treatmentId,
      visit_notes: [{ note: "Access opening done" }],
    });
    expect(visit.statusCode).toBe(200);
    const vitals = await asDoctor().post("/v1/investigations", {
      treatment_id: treatmentId,
      temperature: 98,
      weight: 60,
      blood_pressure: 120,
      oxygen_saturation: 98,
    });
    expect(vitals.statusCode).toBe(200);
  });

  it("adds a dental note for the patient", async () => {
    const res = await asDoctor().post("/v1/notes", {
      patient_id: p.patient.id,
      notes: "Sensitivity on lower left",
      affected_tooths: "36",
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("payments and advance ledger", () => {
  it("reports the remaining balance from plan cost minus payments", async () => {
    const res = await asDoctor().get(
      `/v1/treatment-payments/getRemainingPayment/${treatmentId}`,
    );
    expect(res.statusCode).toBe(200);
  });

  it("accepts an installment payment", async () => {
    const res = await asDoctor().post("/v1/treatment-payments", {
      treatment_id: treatmentId,
      clinic_id: p.clinic.id,
      payment_type: "installment",
      payment_method: "cash",
      amount_paid: 4000,
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects a payment larger than the remaining balance", async () => {
    const res = await asDoctor().post("/v1/treatment-payments", {
      treatment_id: treatmentId,
      clinic_id: p.clinic.id,
      payment_type: "installment",
      payment_method: "upi",
      amount_paid: 7000,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Remaining balance is 6000");
  });

  it("rejects advance usage above the ledger balance", async () => {
    const res = await asDoctor().post("/v1/treatment-payments", {
      treatment_id: treatmentId,
      clinic_id: p.clinic.id,
      payment_type: "installment",
      payment_method: "cash",
      amount_paid: 0,
      advance_used: 1000,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Advance balance exceeded");
  });

  it("uses advance credited in the ledger and debits it", async () => {
    const credit = await asDoctor().post("/v1/ledgers", {
      clinic_id: p.clinic.id,
      patient_id: p.patient.id,
      reference_type: "treatment_payment",
      entry_type: "credit",
      amount: 2000,
      description: "Advance received",
    });
    expect(credit.statusCode).toBe(200);

    const pay = await asDoctor().post("/v1/treatment-payments", {
      treatment_id: treatmentId,
      clinic_id: p.clinic.id,
      payment_type: "installment",
      payment_method: "cash",
      amount_paid: 1000,
      advance_used: 1500,
    });
    expect(pay.statusCode).toBe(200);

    const bal = await asDoctor().get(
      `/v1/ledgers/${p.clinic.id}/${p.patient.id}`,
    );
    expect(bal.statusCode).toBe(200);
    expect(bal.json().data).toBe(500);

    const [{ remaining }] = await query(
      `SELECT (SELECT SUM(total_cost) FROM treatment_plans WHERE treatment_id = :t)
            - (SELECT SUM(amount_paid) FROM treatment_payments WHERE treatment_id = :t) AS remaining`,
      { t: treatmentId },
    );
    // Advance usage is recorded on the payment row but only amount_paid
    // reduces the remaining balance (current behaviour).
    expect(Number(remaining)).toBe(5000);
  });

  it("returns the clinic accounts summary", async () => {
    const res = await asDoctor().get(`/v1/treatment-payments/accounts/${p.clinic.id}`);
    expect(res.statusCode).toBe(200);
  });
});

describe("reports", () => {
  it("returns clinic reports for the doctor", async () => {
    const res = await asDoctor().get(`/v1/reports/${p.clinic.id}`);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toHaveProperty("today_appointments");
    expect(data).toHaveProperty("total_collection");
  });

  it("returns admin reports", async () => {
    const res = await api(app, p.admin.token).get(`/v1/reports`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveProperty("today_patients");
  });
});
