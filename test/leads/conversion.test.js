import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, login, nextWorkingDate } from "../setup/factories.js";
import { waflyRequest } from "../setup/env.js";

let app;
let p;
let doctor;
let staff;

beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
  doctor = api(app, p.doctor.token);
  staff = api(app, p.staff.token);
});
afterAll(() => app.close());

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(300);
  return res.json().data;
};

describe("convert a lead into a patient", () => {
  it("registers a new patient, books the first appointment and keeps the link", async () => {
    const lead = ok(
      await staff.post("/v1/leads", {
        full_name: "Nikhil Rao",
        phone: "+91 98200 11122",
        email: "nikhil@example.com",
        clinic_id: p.clinic.id,
        source: "Facebook",
      }),
    );
    waflyRequest.mockClear();
    const date = nextWorkingDate(6);
    const result = ok(
      await staff.post(`/v1/leads/${lead.id}/convert`, { booking: { date, slot: "10:30:00" } }),
    );
    expect(result.username).toMatch(/^ddss\d+$/);
    expect(result.temporary_password).toHaveLength(10);
    expect(result.booking_id).toBeTruthy();

    const [patient] = await query(
      `SELECT pt.source_lead_id, pt.source, pt.practice_id, u.fullname, u.country_code, u.mobile_number, u.email
         FROM patients pt JOIN users u ON u.id = pt.user_id WHERE pt.id = :id`,
      { id: result.patient_id },
    );
    expect(patient).toMatchObject({
      source_lead_id: lead.id,
      source: "Facebook",
      fullname: "Nikhil Rao",
      country_code: "91",
      mobile_number: "9820011122",
      email: "nikhil@example.com",
    });
    const converted = ok(await staff.get(`/v1/leads/${lead.id}`));
    expect(converted.status).toBe("converted");
    expect(converted.converted_patient_id).toBe(result.patient_id);
    expect(converted.stage_type).toBe("won");
    const [booking] = await query(`SELECT clinic_id, date, slot, status FROM bookings WHERE id = :id`, { id: result.booking_id });
    expect(booking).toMatchObject({ clinic_id: p.clinic.id, slot: "10:30:00", status: "pending" });
    await vi.waitFor(() => expect(waflyRequest).toHaveBeenCalled(), { timeout: 10000 });
    const tl = ok(await staff.get(`/v1/leads/${lead.id}/timeline`));
    expect(tl[0].type).toBe("conversion");

    // The new patient can log in with the returned credentials.
    await login(app, { username: result.username, password: result.temporary_password });
  });

  it("can't convert twice", async () => {
    const lead = ok(await staff.post("/v1/leads", { full_name: "Once Only", phone: "9820011199" }));
    ok(await staff.post(`/v1/leads/${lead.id}/convert`, {}));
    expect((await staff.post(`/v1/leads/${lead.id}/convert`, {})).statusCode).toBe(409);
  });

  it("suggests and links an existing patient with the same phone", async () => {
    const lead = ok(await staff.post("/v1/leads", { full_name: "Returning", phone: "9820011122", force: true }));
    const candidates = ok(await staff.get(`/v1/leads/${lead.id}/convert/candidates`));
    expect(candidates).toHaveLength(1);
    const result = ok(await staff.post(`/v1/leads/${lead.id}/convert`, { link_patient_id: candidates[0].patient_id }));
    expect(result.patient_id).toBe(candidates[0].patient_id);
    expect(result.username).toBeUndefined();
  });

  it("rolls everything back when the appointment can't be booked", async () => {
    const lead = ok(await staff.post("/v1/leads", { full_name: "Bad Slot", phone: "9820011155" }));
    const before = (await query(`SELECT count(*)::int AS n FROM patients`))[0].n;
    const res = await staff.post(`/v1/leads/${lead.id}/convert`, {
      booking: { date: nextWorkingDate(6), slot: "23:00:00" },
    });
    expect(res.statusCode).toBe(404);
    expect((await query(`SELECT count(*)::int AS n FROM patients`))[0].n).toBe(before);
    expect(ok(await staff.get(`/v1/leads/${lead.id}`)).status).toBe("open");
  });

  it("needs a mobile number when the lead only has an email", async () => {
    const lead = ok(await staff.post("/v1/leads", { full_name: "Email Only", email: "only@example.com" }));
    expect((await staff.post(`/v1/leads/${lead.id}/convert`, {})).statusCode).toBe(400);
    const result = ok(
      await staff.post(`/v1/leads/${lead.id}/convert`, { patient: { mobile_number: "9820011177", country_code: "91" } }),
    );
    expect(result.patient_id).toBeTruthy();
  });

  it("requires leads.convert", async () => {
    const lead = ok(await doctor.post("/v1/leads", { full_name: "No Perm", phone: "9820011188" }));
    const [role] = await query(
      `INSERT INTO roles (practice_id, key, name) SELECT practice_id, 'viewer', 'Viewer' FROM clinics WHERE id = :c RETURNING id`,
      { c: p.clinic.id },
    );
    await query(`INSERT INTO role_permissions (role_id, permission_key) VALUES (:r, 'leads.view'), (:r, 'leads.view_all')`, { r: role.id });
    await query(`UPDATE users SET role_id = :r WHERE id = :u`, { r: role.id, u: p.staff.user.id });
    const { invalidatePermissions } = await import("../../app/lib/permissions.js");
    invalidatePermissions();
    expect((await staff.post(`/v1/leads/${lead.id}/convert`, {})).statusCode).toBe(403);
  });
});
