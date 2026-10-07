import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb } from "../setup/db.js";
import { setupPractice, api } from "../setup/factories.js";
import config from "../../app/config/index.js";
import { sendFollowUpReminders } from "../../app/api/notification/service.js";

let app;
let A;
let B;
let doctor;
let staff;
let pipeline;
let otherClinic;
const leads = {};

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(400);
  return res.json().data;
};
const ids = (rows) => rows.map((r) => r.id).sort();

beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  A = await setupPractice(app);
  B = await setupPractice(app);
  doctor = api(app, A.doctor.token);
  staff = api(app, A.staff.token);
  [pipeline] = ok(await doctor.get("/v1/pipelines"));
  // A second clinic in practice A; the staff member works only at A.clinic.
  otherClinic = ok(await doctor.post("/v1/clinics", { name: "Branch Clinic", address: "2 Side Road" }));

  const create = async (name, phone, extra = {}) =>
    ok(await doctor.post("/v1/leads", { full_name: name, phone, force: true, ...extra }));
  leads.practiceWide = await create("Practice Wide", "9811100001");
  leads.ownClinic = await create("Own Clinic", "9811100002", { clinic_id: A.clinic.id });
  leads.otherClinic = await create("Other Clinic", "9811100003", { clinic_id: otherClinic.id });
  leads.otherClinicMine = await create("Other Clinic Mine", "9811100004", {
    clinic_id: otherClinic.id,
    owner_id: A.staff.user.id,
  });
});
afterAll(async () => {
  await app.close();
});

describe("clinic-scoped lead visibility", () => {
  it("staff see practice-wide leads, their clinic's leads and their own", async () => {
    const list = ok(await staff.get("/v1/leads?limit=100"));
    expect(ids(list)).toEqual(ids([leads.practiceWide, leads.ownClinic, leads.otherClinicMine]));
  });

  it("doctors see every clinic", async () => {
    expect(ids(ok(await doctor.get("/v1/leads?limit=100")))).toEqual(ids(Object.values(leads)));
  });

  it("hides other clinics' leads everywhere else too", async () => {
    expect((await staff.get(`/v1/leads/${leads.otherClinic.id}`)).statusCode).toBe(404);
    expect((await staff.get(`/v1/leads/${leads.otherClinic.id}/timeline`)).statusCode).toBe(404);
    expect((await staff.post(`/v1/leads/${leads.otherClinic.id}/move`, { stage_id: pipeline.stages[1].id })).statusCode).toBe(404);
    expect((await staff.get(`/v1/leads/${leads.otherClinic.id}/convert/candidates`)).statusCode).toBe(404);
    const board = ok(await staff.get(`/v1/leads?view=kanban&pipeline_id=${pipeline.id}`));
    expect(board.stages.flatMap((s) => s.leads).map((l) => l.id)).not.toContain(leads.otherClinic.id);
    expect(ok(await staff.get("/v1/leads/duplicates?phone=9811100003"))).toEqual([]);
    expect(ok(await doctor.get("/v1/leads/duplicates?phone=9811100003"))).toHaveLength(1);
  });

  it("a duplicate warning doesn't reveal a lead the caller can't see", async () => {
    const res = await staff.post("/v1/leads", { full_name: "Again", phone: "9811100003" });
    expect(res.statusCode).toBe(409);
    expect(res.json().details.duplicates).toEqual([]);
  });

  it("staff can't put leads in clinics they don't work at", async () => {
    const res = await staff.post("/v1/leads", { full_name: "Elsewhere", phone: "9811100009", clinic_id: otherClinic.id });
    expect(res.statusCode).toBe(403);
    expect(ok(await staff.post("/v1/leads", { full_name: "Here", phone: "9811100010", clinic_id: A.clinic.id })).clinic_id).toBe(A.clinic.id);
  });
});

describe("roles & permissions", () => {
  let role;

  it("only role managers can see roles; everyone can see their own access", async () => {
    expect((await staff.get("/v1/roles")).statusCode).toBe(403);
    const mine = ok(await staff.get("/v1/roles/mine"));
    expect(mine.role).toBe("staff");
    expect(mine.permissions).toContain("leads.view_all");
    expect(mine.permissions).not.toContain("leads.view_all_clinics");
    expect(ok(await doctor.get("/v1/roles/mine")).permissions).toContain("leads.view_all_clinics");
  });

  it("lists the built-in roles read-only, with members and the permission catalogue", async () => {
    const roles = ok(await doctor.get("/v1/roles"));
    expect(roles.map((r) => [r.key, r.editable])).toEqual([
      ["doctor", false],
      ["staff", false],
    ]);
    expect(roles.find((r) => r.key === "staff").member_count).toBe(1);
    const catalogue = ok(await doctor.get("/v1/roles/permissions"));
    const all = catalogue.flatMap((g) => g.permissions);
    expect(all.find((p) => p.key === "leads.view_all_clinics")).toMatchObject({ assignable: true });
    expect(all.find((p) => p.key === "roles.manage")).toMatchObject({ assignable: false });
    const members = ok(await doctor.get("/v1/roles/members"));
    expect(members.find((m) => m.id === A.staff.user.id)).toMatchObject({ role: "staff", role_name: "Staff" });
  });

  it("creates a practice role from the Staff role", async () => {
    const [, staffRole] = ok(await doctor.get("/v1/roles"));
    role = ok(await doctor.post("/v1/roles", { name: "Lead manager", copy_from: staffRole.id }));
    expect(role).toMatchObject({ is_system: false, editable: true, base_role: "staff", member_count: 0 });
    expect(role.permissions).toEqual(staffRole.permissions);
    expect((await doctor.post("/v1/roles", { name: "lead MANAGER", permissions: [] })).statusCode).toBe(409);
    expect((await doctor.post("/v1/roles", { name: "Too much", permissions: ["roles.manage"] })).statusCode).toBe(400);
    expect((await doctor.post("/v1/roles", { name: "Nothing" })).statusCode).toBe(400);
  });

  it("assigning the role changes what the staff member can do", async () => {
    role = ok(
      await doctor.put(`/v1/roles/${role.id}`, {
        permissions: [...role.permissions, "leads.view_all_clinics", "leads.export"],
      }),
    );
    expect((await staff.get("/v1/leads/export")).statusCode).toBe(403);
    expect(ok(await doctor.put(`/v1/roles/members/${A.staff.user.id}`, { role_id: role.id })).role_name).toBe("Lead manager");

    expect(ok(await staff.get("/v1/roles/mine"))).toMatchObject({ role: "staff", role_name: "Lead manager" });
    expect((await staff.get("/v1/leads/export")).statusCode).toBe(200);
    // leads.view_all_clinics: now sees the other clinic too
    expect(ok(await staff.get("/v1/leads?limit=100")).map((l) => l.id)).toContain(leads.otherClinic.id);

    // Taking a permission away applies straight away.
    ok(await doctor.put(`/v1/roles/${role.id}`, { permissions: role.permissions.filter((p) => !p.startsWith("leads.")) }));
    expect((await staff.get("/v1/leads")).statusCode).toBe(403);
  });

  it("protects built-in roles, other practices' roles and non-staff users", async () => {
    const [doctorRole, staffRole] = ok(await doctor.get("/v1/roles"));
    expect((await doctor.put(`/v1/roles/${staffRole.id}`, { name: "Renamed" })).statusCode).toBe(403);
    expect((await doctor.delete(`/v1/roles/${doctorRole.id}`)).statusCode).toBe(403);
    expect((await api(app, B.doctor.token).put(`/v1/roles/${role.id}`, { name: "Mine now" })).statusCode).toBe(404);
    expect(ok(await api(app, B.doctor.token).get("/v1/roles")).map((r) => r.id)).not.toContain(role.id);
    expect((await api(app, B.doctor.token).put(`/v1/roles/members/${B.staff.user.id}`, { role_id: role.id })).statusCode).toBe(400);
    expect((await doctor.put(`/v1/roles/members/${A.doctor.user.id}`, { role_id: role.id })).statusCode).toBe(400);
    expect((await doctor.put(`/v1/roles/members/${B.staff.user.id}`, { role_id: role.id })).statusCode).toBe(404);
  });

  it("a role in use can't be deleted until its members move", async () => {
    expect((await doctor.delete(`/v1/roles/${role.id}`)).statusCode).toBe(409);
    const [, staffRole] = ok(await doctor.get("/v1/roles"));
    ok(await doctor.put(`/v1/roles/members/${A.staff.user.id}`, { role_id: staffRole.id }));
    ok(await doctor.delete(`/v1/roles/${role.id}`));
    expect(ok(await staff.get("/v1/roles/mine")).role_name).toBe("Staff");
    expect((await staff.get("/v1/leads")).statusCode).toBe(200);
  });
});

describe("lead export", () => {
  it("is off for staff by default", async () => {
    expect((await staff.get("/v1/leads/export")).statusCode).toBe(403);
  });

  it("exports the filtered leads as CSV with custom fields and tags", async () => {
    const lead = ok(
      await doctor.post("/v1/leads", {
        full_name: "=Export Me",
        phone: "9811100020",
        force: true,
        custom_fields: { interest: ["Implants", "Braces / Aligners"] },
        tags: ["VIP"],
      }),
    );
    const res = await doctor.get(`/v1/leads/export?q=${encodeURIComponent("Export Me")}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"/);
    const [header, row, ...rest] = res.body.replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(rest).toEqual([]);
    expect(header.startsWith("Name,Phone,Email,Pipeline,Stage,Status,Owner,Clinic,Source")).toBe(true);
    expect(header).toContain("Interested in");
    expect(row).toContain("'=Export Me");
    expect(row).toContain('"Implants, Braces / Aligners"');
    expect(row).toContain(lead.phone);
  });

  it("follows the caller's visibility", async () => {
    const [, staffRole] = ok(await doctor.get("/v1/roles"));
    const exporter = ok(await doctor.post("/v1/roles", { name: "Exporter", permissions: [...staffRole.permissions, "leads.export"] }));
    ok(await doctor.put(`/v1/roles/members/${A.staff.user.id}`, { role_id: exporter.id }));
    const csv = (await staff.get("/v1/leads/export")).body;
    expect(csv).toContain("Own Clinic");
    expect(csv).not.toContain("Other Clinic,");
    expect(csv).not.toMatch(/\r\n"?Other Clinic"?,/);
    ok(await doctor.put(`/v1/roles/members/${A.staff.user.id}`, { role_id: staffRole.id }));
  });

  it("refuses rather than truncates over the limit", async () => {
    const max = config.leads.export_max_rows;
    config.leads.export_max_rows = 2;
    try {
      const res = await doctor.get("/v1/leads/export");
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("narrow the filters");
    } finally {
      config.leads.export_max_rows = max;
    }
  });
});

describe("follow-up reminders", () => {
  const followUp = async (leadId, minutesFromNow, client = staff) =>
    ok(
      await client.post(`/v1/leads/${leadId}/activities`, {
        type: "follow_up",
        body: `Call back (${minutesFromNow} min)`,
        due_at: new Date(Date.now() + minutesFromNow * 60000).toISOString(),
      }),
    );

  it("notifies the lead owner once when a follow-up comes due", async () => {
    // Owned by staff; follow-up due in 10 minutes (window is 15).
    const soon = await followUp(leads.otherClinicMine.id, 10);
    await followUp(leads.otherClinicMine.id, 120); // later
    const old = await followUp(leads.otherClinicMine.id, -3 * 24 * 60); // long overdue
    expect(old.due_at).toBeTruthy();

    const sent = await sendFollowUpReminders();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ user_id: A.staff.user.id, lead_id: leads.otherClinicMine.id });
    expect(await sendFollowUpReminders()).toHaveLength(0);

    const inbox = await staff.get("/v1/notifications");
    const [n] = ok(inbox);
    expect(n).toMatchObject({ type: "lead_follow_up", title: "Follow-up due: Other Clinic Mine", link: `/leads/${leads.otherClinicMine.id}` });
    expect(n.body).toBe("Call back (10 min)");
    expect(inbox.json().meta.unread).toBe(1);

    // Moving the due time re-arms the reminder.
    ok(await staff.put(`/v1/lead-activities/${soon.id}`, { due_at: new Date(Date.now() + 5 * 60000).toISOString() }));
    expect(await sendFollowUpReminders()).toHaveLength(1);
  });

  it("skips completed follow-ups and unassigned leads go to whoever added the follow-up", async () => {
    const done = await followUp(leads.ownClinic.id, 5, doctor);
    ok(await doctor.put(`/v1/lead-activities/${done.id}`, { completed: true }));
    await followUp(leads.practiceWide.id, 5, doctor); // practice-wide lead: owner = doctor (creator)
    const sent = await sendFollowUpReminders();
    expect(sent.map((s) => s.lead_id)).toEqual([leads.practiceWide.id]);
  });

  it("notifications are private and can be marked read", async () => {
    const [n] = ok(await staff.get("/v1/notifications?unread=true"));
    expect((await doctor.post(`/v1/notifications/${n.id}/read`)).statusCode).toBe(404);
    ok(await staff.post(`/v1/notifications/${n.id}/read`));
    expect(ok(await staff.get("/v1/notifications/unread-count")).unread).toBe(1);
    ok(await staff.post("/v1/notifications/read-all"));
    expect(ok(await staff.get("/v1/notifications/unread-count")).unread).toBe(0);
    expect(ok(await api(app, B.doctor.token).get("/v1/notifications"))).toEqual([]);
  });
});
