import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, login, createPatient } from "../setup/factories.js";

let app;
let p;
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
});
afterAll(() => app.close());

describe("user management", () => {
  it("doctor-created patients get ddssN usernames and a doctor mapping", async () => {
    const pat = await createPatient(app, p.doctor.token);
    expect(pat.user.username).toMatch(/^ddss\d+$/);
    const maps = await query(
      `SELECT 1 FROM doctor_patient_mappings WHERE patient_id = :pid AND doctor_id = :did`,
      { pid: pat.id, did: p.doctor.doctor.id },
    );
    expect(maps).toHaveLength(1);
  });

  it("staff-created patients are mapped to the given clinic", async () => {
    const pat = await createPatient(app, p.staff.token, { clinic_id: p.clinic.id });
    const maps = await query(
      `SELECT 1 FROM clinic_patient_mappings WHERE patient_id = :pid AND clinic_id = :cid`,
      { pid: pat.id, cid: p.clinic.id },
    );
    expect(maps).toHaveLength(1);
  });

  it("patient usernames increase sequentially", async () => {
    const a = await createPatient(app, p.doctor.token);
    const b = await createPatient(app, p.doctor.token);
    const n = (u) => Number(u.user.username.replace("ddss", ""));
    expect(n(b)).toBe(n(a) + 1);
  });

  it("staff cannot create doctors (hotfix)", async () => {
    const res = await api(app, p.staff.token).post("/v1/users", {
      role: "doctor",
      username: "nodoc1",
      password: "x",
      fullname: "x",
      country_code: "91",
      mobile_number: "1",
    });
    expect(res.statusCode).toBe(403);
  });

  it("lists the doctor's patients and staff", async () => {
    expect((await api(app, p.doctor.token).get("/v1/users/patients")).statusCode).toBe(200);
    expect((await api(app, p.doctor.token).get("/v1/staff")).statusCode).toBe(200);
  });

  it("PUT /users/:id with password changes the target user's password", async () => {
    const res = await api(app, p.doctor.token).put(`/v1/users/${p.staff.user.id}`, {
      username: p.staff.user.username,
      fullname: "Front Desk",
      password: "NewStaff@1",
    });
    expect(res.statusCode).toBe(200);
    await login(app, {
      username: p.staff.user.username,
      password: "NewStaff@1",
      role: "staff",
    });
  });

  it("deactivating a user blocks their next request", async () => {
    const pat = await createPatient(app, p.doctor.token);
    const [{ username }] = await query(`SELECT username FROM users WHERE id = :id`, {
      id: pat.user.id,
    });
    // Patients get generated passwords; set a known one directly.
    const bcrypt = (await import("bcrypt")).default;
    await query(`UPDATE users SET password = :pw WHERE id = :id`, {
      pw: bcrypt.hashSync("Pat@123", 4),
      id: pat.user.id,
    });
    const token = await login(app, { username, password: "Pat@123", role: "patient" });
    const off = await api(app, p.doctor.token).put(`/v1/users/status/${pat.user.id}`, {
      is_active: false,
    });
    expect(off.statusCode).toBe(200);
    expect((await api(app, token).get("/v1/users/me")).statusCode).toBe(401);
  });
});

// Known defects from docs/revamp/02 §7. Each is expected to fail today and
// is flipped to a normal `it` when fixed in Phase 3.
describe("known defects", () => {
  it.fails("#15 change-password works with the correct old password", async () => {
    const res = await api(app, p.doctor.token).post(
      `/v1/users/${p.doctor.user.id}/change-password`,
      { old_password: p.doctor.password, new_password: "Doctor@456" },
    );
    expect(res.statusCode).toBe(200);
  });

  it.fails("#16 deleting an unknown user returns 404", async () => {
    const res = await api(app, p.doctor.token).delete(
      `/v1/users/00000000-0000-4000-8000-000000000000`,
    );
    expect(res.statusCode).toBe(404);
  });

  it.fails("#17 deleting a staff user keeps the clinical records they created", async () => {
    const pat = await createPatient(app, p.doctor.token);
    await api(app, p.staff.token).post("/v1/treatments", {
      clinic_id: p.clinic.id,
      patient_id: pat.id,
      service_id: p.service.id,
    });
    await api(app, p.doctor.token).delete(`/v1/users/${p.staff.user.id}`);
    const rows = await query(`SELECT 1 FROM treatments WHERE patient_id = :pid`, {
      pid: pat.id,
    });
    expect(rows).toHaveLength(1);
  });

  it.fails("dead route GET /users/staff responds without a server error", async () => {
    const res = await api(app, p.doctor.token).get("/v1/users/staff");
    expect(res.statusCode).toBeLessThan(500);
  });

  it.fails("#21 GET /treatment-payments does not crash for a non-patient", async () => {
    const res = await api(app, p.doctor.token).get(`/v1/treatment-payments`);
    expect(res.statusCode).toBeLessThan(500);
  });
});
