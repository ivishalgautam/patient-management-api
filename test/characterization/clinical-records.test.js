import fs from "fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, multipart } from "../setup/factories.js";

let app;
let p;
let treatmentId;
const created = [];
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
  await api(app, p.doctor.token).post("/v1/treatments", {
    clinic_id: p.clinic.id,
    patient_id: p.patient.id,
    service_id: p.service.id,
  });
  [{ id: treatmentId }] = await query(
    `SELECT id FROM treatments WHERE patient_id = :pid`,
    { pid: p.patient.id },
  );
});
afterAll(async () => {
  for (const f of created) fs.rmSync(f, { force: true });
  await app.close();
});

const upload = (url, fields) => {
  const { payload, headers } = multipart(fields, [
    { field: "file", filename: "scan.png", contentType: "image/png", content: "PNGDATA" },
  ]);
  return app.inject({
    method: "POST",
    url,
    payload,
    headers: { ...headers, authorization: `Bearer ${p.doctor.token}` },
  });
};

describe("clinical records", () => {
  it("creates a comprehensive examination and an initial treatment plan", async () => {
    const res = await api(app, p.doctor.token).post("/v1/comprehensive-examinations", {
      patient_id: p.patient.id,
      chief_complaint: "Pain",
      medical_history: "None",
      dental_history: "None",
      examination: "Caries 46",
      affected_tooths: [{ tooth: "46", color: "#FF0000" }],
      gallery: [],
    });
    expect(res.statusCode).toBe(200);
    const plans = await query(
      `SELECT total_cost FROM treatment_plans WHERE treatment_id = :t`,
      { t: treatmentId },
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].total_cost).toBe(0);
  });

  it("uploads a patient document (multipart)", async () => {
    const res = await upload("/v1/documents", {
      patient_id: p.patient.id,
      title: "Consent form",
    });
    expect(res.statusCode).toBe(200);
    const doc = res.json().data;
    expect(doc.documents[0]).toMatch(/^public[\\/]images[\\/]\d+_.+\.png$/);
    created.push(...doc.documents);
    expect(fs.existsSync(doc.documents[0])).toBe(true);
  });

  it.fails("#25 keeps the original file name (today every 's' becomes '_')", async () => {
    const res = await upload("/v1/documents", {
      patient_id: p.patient.id,
      title: "Scan",
    });
    created.push(...res.json().data.documents);
    expect(res.json().data.documents[0]).toMatch(/_scan\.png$/);
  });

  it.fails("#26 exam without gallery uses the schema default []", async () => {
    const res = await api(app, p.doctor.token).post("/v1/comprehensive-examinations", {
      patient_id: p.patient.id,
      chief_complaint: "Pain",
      medical_history: "None",
      dental_history: "None",
      examination: "Caries 47",
      affected_tooths: [{ tooth: "47", color: "#FF0000" }],
    });
    expect(res.statusCode).toBe(200);
  });

  it("#27 fixed: uploads an x-ray for a treatment", async () => {
    const res = await upload("/v1/x-rays", {
      treatment_id: treatmentId,
      title: "OPG",
    });
    expect(res.statusCode).toBe(200);
    created.push(...res.json().data.files);
  });
});
