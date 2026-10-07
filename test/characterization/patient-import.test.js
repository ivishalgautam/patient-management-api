import { beforeAll, afterAll, describe, it, expect } from "vitest";
import xlsx from "xlsx";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, createService, multipart } from "../setup/factories.js";

let app;
let p;
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
  await createService(app, p.admin.token, "Scaling");
  await createService(app, p.admin.token, "Root Canal");
});
afterAll(() => app.close());

function sheet(rows) {
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), "Sheet1");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

const importFile = (buffer, fields = {}) => {
  const form = multipart(fields, [
    {
      field: "file",
      filename: "patients.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: buffer,
    },
  ]);
  return app.inject({
    method: "POST",
    url: "/v1/patients/import",
    payload: form.payload,
    headers: { ...form.headers, authorization: `Bearer ${p.doctor.token}` },
  });
};

const rows = [
  { patient_id: "9001", fullname: "Imran Shaikh", mobile_number: "9822000001", gender: "m", date: "01/02/2026", treatment: "Scaling", cost: "1500" },
  { treatment: "Root Canal", cost: "6000" },
  { patient_id: "9002", fullname: "Neha Rao", mobile_number: "9822000002", gender: "f", date: "03/02/2026", treatment: "Scaling", cost: "1200" },
];

describe("patient Excel import", () => {
  it("creates patients with closed, fully paid treatments in the clinic", async () => {
    const res = await importFile(sheet(rows), { clinic_id: p.clinic.id });
    expect(res.statusCode, res.body).toBe(200);

    const [imran] = await query(
      `SELECT pt.id, pt.practice_id, u.gender FROM users u JOIN patients pt ON pt.user_id = u.id WHERE u.username = 'ddss9001'`,
    );
    expect(imran.gender).toBe("male");
    const treatments = await query(
      `SELECT t.status, t.clinic_id, tp.total_cost, pay.amount_paid
         FROM treatments t
         JOIN treatment_plans tp ON tp.treatment_id = t.id
         JOIN treatment_payments pay ON pay.treatment_id = t.id
        WHERE t.patient_id = :p ORDER BY tp.total_cost`,
      { p: imran.id },
    );
    expect(treatments).toEqual([
      { status: "close", clinic_id: p.clinic.id, total_cost: 1500, amount_paid: 1500 },
      { status: "close", clinic_id: p.clinic.id, total_cost: 6000, amount_paid: 6000 },
    ]);
    const maps = await query(`SELECT 1 FROM clinic_patient_mappings WHERE patient_id = :p`, { p: imran.id });
    expect(maps).toHaveLength(1);
  });

  it("re-importing an existing patient adds the new treatments once", async () => {
    const before = await query(
      `SELECT count(*)::int AS n FROM treatments t JOIN patients pt ON pt.id = t.patient_id
         JOIN users u ON u.id = pt.user_id WHERE u.username = 'ddss9002'`,
    );
    await importFile(sheet([rows[2]]), { clinic_id: p.clinic.id });
    const after = await query(
      `SELECT count(*)::int AS n FROM treatments t JOIN patients pt ON pt.id = t.patient_id
         JOIN users u ON u.id = pt.user_id WHERE u.username = 'ddss9002'`,
    );
    expect(after[0].n).toBe(before[0].n + 1);
  });

  it("rejects the whole file when a treatment has no matching service", async () => {
    const res = await importFile(
      sheet([{ ...rows[0], patient_id: "9003", treatment: "Teleportation" }]),
      { clinic_id: p.clinic.id },
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("Teleportation");
    const users = await query(`SELECT 1 FROM users WHERE username = 'ddss9003'`);
    expect(users).toHaveLength(0);
  });
});
