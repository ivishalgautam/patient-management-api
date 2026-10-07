import { beforeAll, afterAll, describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { buildApp } from "../../app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, login } from "../setup/factories.js";
import { PERMISSION_MAP } from "../../app/lib/permission-map.js";
import { TENANT_MAP } from "../../app/lib/tenant-map.js";
import { PERMISSION_KEYS } from "../../app/lib/constants/permissions.js";
import { invalidatePermissions } from "../../app/lib/permissions.js";

let app;
const routes = [];
let p;
let patientToken;

beforeAll(async () => {
  app = await buildApp({
    logger: false,
    onRoute: (r) => {
      for (const m of [].concat(r.method)) if (m !== "HEAD") routes.push(`${m} ${r.url}`);
    },
  });
  await app.ready();
  await resetDb();
  p = await setupPractice(app);
  const [{ username }] = await query(`SELECT username FROM users WHERE id = :id`, {
    id: p.patient.user.id,
  });
  await query(`UPDATE users SET password = :pw WHERE id = :id`, {
    pw: bcrypt.hashSync("Pat@1234", 4),
    id: p.patient.user.id,
  });
  patientToken = await login(app, { username, password: "Pat@1234" });
});
afterAll(() => app.close());

describe("permission map", () => {
  it("has the same routes as the tenant map", () => {
    expect(Object.keys(PERMISSION_MAP).sort()).toEqual(Object.keys(TENANT_MAP).sort());
  });

  it("only uses known permission keys", () => {
    const used = Object.values(PERMISSION_MAP).filter(Array.isArray).flat();
    expect(used.filter((k) => !PERMISSION_KEYS.includes(k))).toEqual([]);
  });
});

describe("role defaults", () => {
  it.each([
    ["staff", "GET", "/v1/reports/:clinic"],
    ["staff", "GET", "/v1/treatment-payments/accounts/:clinic"],
    ["staff", "POST", "/v1/slots"],
    ["staff", "POST", "/v1/clinics"],
    ["staff", "GET", "/v1/staff"],
    ["staff", "POST", "/v1/patients/import"],
    ["doctor", "POST", "/v1/procedures"],
    ["patient", "GET", "/v1/patients"],
    ["patient", "GET", "/v1/ledgers"],
    ["patient", "GET", "/v1/treatment-visits"],
    ["patient", "POST", "/v1/treatments"],
    ["patient", "POST", "/v1/treatment-payments"],
    ["patient", "GET", "/v1/users"],
  ])("%s cannot %s %s", async (role, method, path) => {
    const token = { staff: p.staff.token, doctor: p.doctor.token, patient: patientToken }[role];
    const url = path.replace(":clinic", p.clinic.id);
    const res = await api(app, token)[method.toLowerCase()](url, method === "GET" ? undefined : {});
    expect(res.statusCode).toBe(403);
  });

  it("staff can work with appointments and treatments", async () => {
    const asStaff = api(app, p.staff.token);
    expect((await asStaff.get(`/v1/bookings/getByClinicId/${p.clinic.id}`)).statusCode).toBe(200);
    expect((await asStaff.get(`/v1/treatment-plans/getByPatientId/${p.patient.id}`)).statusCode).toBe(200);
  });

  it("patients reach their own records", async () => {
    const asPatient = api(app, patientToken);
    expect((await asPatient.get(`/v1/treatments/getByPatientId`)).statusCode).toBe(200);
    expect((await asPatient.get(`/v1/users/${p.patient.user.id}`)).statusCode).toBe(200);
    expect((await asPatient.get(`/v1/slots/getByClinicId/${p.clinic.id}`)).statusCode).toBe(200);
  });

  it("staff cannot edit or delete the doctor", async () => {
    const asStaff = api(app, p.staff.token);
    const edit = await asStaff.put(`/v1/users/${p.doctor.user.id}`, {
      username: p.doctor.username,
      fullname: "Hacked",
    });
    expect(edit.statusCode).toBe(403);
    const del = await asStaff.delete(`/v1/users/${p.doctor.user.id}`);
    expect(del.statusCode).toBe(403);
  });

  it("staff can still edit their own profile", async () => {
    const res = await api(app, p.staff.token).put(`/v1/users/${p.staff.user.id}`, {
      username: p.staff.user.username,
      fullname: "Front Desk Two",
    });
    expect(res.statusCode).toBe(200);
  });

  it("/users/me lists the caller's permissions", async () => {
    const me = await api(app, p.staff.token).get("/v1/users/me");
    expect(me.json().permissions).toContain("appointments.manage");
    expect(me.json().permissions).not.toContain("reports.view");
  });
});

describe("custom roles", () => {
  it("a practice role with fewer permissions limits the user", async () => {
    const [[role]] = await Promise.all([
      query(
        `INSERT INTO roles (id, practice_id, key, name, is_system, created_at, updated_at)
         VALUES (gen_random_uuid(), (SELECT practice_id FROM clinics WHERE id = :c), 'reception', 'Reception', false, now(), now())
         RETURNING id`,
        { c: p.clinic.id },
      ),
    ]);
    await query(
      `INSERT INTO role_permissions (id, role_id, permission_key, created_at)
       VALUES (gen_random_uuid(), :r, 'appointments.view', now())`,
      { r: role.id },
    );
    await query(`UPDATE users SET role_id = :r WHERE id = :u`, { r: role.id, u: p.staff.user.id });
    invalidatePermissions();

    const asStaff = api(app, p.staff.token);
    expect((await asStaff.get(`/v1/bookings/getByClinicId/${p.clinic.id}`)).statusCode).toBe(200);
    expect((await asStaff.get(`/v1/treatment-plans/getByPatientId/${p.patient.id}`)).statusCode).toBe(403);
  });
});
