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
    // Resetting a password revokes that user's existing tokens.
    expect((await api(app, p.staff.token).get("/v1/users/me")).statusCode).toBe(401);
    p.staff.token = await login(app, {
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
describe("passwords and token revocation", () => {
  it("#15 fixed: change-password works and revokes old tokens", async () => {
    const oldToken = p.doctor.token;
    const wrong = await api(app, oldToken).post(
      `/v1/users/${p.doctor.user.id}/change-password`,
      { old_password: "nope", new_password: "Doctor@456" },
    );
    expect(wrong.statusCode).toBe(400);

    const res = await api(app, oldToken).post(
      `/v1/users/${p.doctor.user.id}/change-password`,
      { old_password: p.doctor.password, new_password: "Doctor@456" },
    );
    expect(res.statusCode).toBe(200);
    p.doctor.token = res.json().token;
    p.doctor.password = "Doctor@456";

    expect((await api(app, oldToken).get("/v1/users/me")).statusCode).toBe(401);
    expect((await api(app, p.doctor.token).get("/v1/users/me")).statusCode).toBe(200);
    await login(app, { ...p.doctor, role: "doctor" });
  });

  it("cannot change someone else's password via change-password", async () => {
    const res = await api(app, p.staff.token).post(
      `/v1/users/${p.doctor.user.id}/change-password`,
      { old_password: "x", new_password: "y" },
    );
    expect(res.statusCode).toBe(403);
  });

  it("/users/me and login never return the password hash", async () => {
    const me = await api(app, p.doctor.token).get("/v1/users/me");
    expect(me.json()).not.toHaveProperty("password");
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: p.doctor.username, password: p.doctor.password },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user_data).not.toHaveProperty("password");
  });

  it("new patients get a random temporary password, returned once", async () => {
    const res = await api(app, p.doctor.token).post("/v1/users", {
      role: "patient",
      fullname: "Ravi Kumar",
      country_code: "91",
      mobile_number: "9811112222",
    });
    const { temporary_password, user } = res.json();
    expect(temporary_password).toMatch(/^[A-Za-z2-9]{10}$/);
    expect(temporary_password).not.toBe("ravi2222");
    await login(app, { username: user.username, password: temporary_password });
  });
});

describe("known defects", () => {


  it("#16 fixed: deleting an unknown user returns 404", async () => {
    const res = await api(app, p.doctor.token).delete(
      `/v1/users/00000000-0000-4000-8000-000000000000`,
    );
    expect(res.statusCode).toBe(404);
  });

  it("#17 fixed: deleting a staff user keeps the clinical records they created", async () => {
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

  it("#21 fixed: GET /treatment-payments is patient self-service (403 for staff roles)", async () => {
    const res = await api(app, p.doctor.token).get(`/v1/treatment-payments`);
    expect(res.statusCode).toBe(403);
  });
});
