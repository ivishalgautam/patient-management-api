import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, login } from "../setup/factories.js";
import { invalidatePermissions } from "../../app/lib/permissions.js";

let app;
let p;
let doctor;
let staff;
let pipeline;

beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
  doctor = api(app, p.doctor.token);
  staff = api(app, p.staff.token);
  [pipeline] = (await doctor.get("/v1/pipelines")).json().data;
});
afterAll(() => app.close());

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(300);
  return res.json().data;
};
let seq = 0;
const phone = () => `98${String(10000000 + seq++).padStart(8, "0")}`;
const stage = (name) => pipeline.stages.find((s) => s.name === name);

describe("create", () => {
  it("creates in the default pipeline's first stage, owned by the creator", async () => {
    const lead = ok(await staff.post("/v1/leads", { full_name: "Riya Sen", phone: phone(), source: "Walk-in" }));
    expect(lead.pipeline_id).toBe(pipeline.id);
    expect(lead.stage_name).toBe("New Enquiry");
    expect(lead.status).toBe("open");
    expect(lead.owner_id).toBe(p.staff.user.id);
    const tl = ok(await staff.get(`/v1/leads/${lead.id}/timeline`));
    expect(tl.map((a) => a.type)).toContain("created");
    const [history] = await query(`SELECT from_stage_id, to_stage_id FROM lead_stage_history WHERE lead_id = :id`, { id: lead.id });
    expect(history.from_stage_id).toBeNull();
  });

  it("needs a name and a phone or email", async () => {
    expect((await staff.post("/v1/leads", { full_name: "No Contact" })).statusCode).toBe(400);
    expect((await staff.post("/v1/leads", { phone: phone() })).statusCode).toBe(400);
  });

  it("stores typed custom fields and creates tags on the fly", async () => {
    const lead = ok(
      await doctor.post("/v1/leads", {
        full_name: "Arjun Mehta",
        email: "arjun@example.com",
        tags: ["Facebook Ad", "VIP"],
        custom_fields: { interest: ["Implants", "Whitening"], preferred_time: "Evening" },
      }),
    );
    expect(lead.custom_fields).toEqual({ interest: ["Implants", "Whitening"], preferred_time: "Evening" });
    expect(lead.tags.map((t) => t.name)).toEqual(["Facebook Ad", "VIP"]);

    const badOption = await doctor.post("/v1/leads", {
      full_name: "X",
      phone: phone(),
      custom_fields: { interest: ["Teleportation"] },
    });
    expect(badOption.statusCode).toBe(400);
    expect(badOption.json().message).toContain("Teleportation");
    const unknown = await doctor.post("/v1/leads", { full_name: "X", phone: phone(), custom_fields: { nope: 1 } });
    expect(unknown.statusCode).toBe(400);
  });
});

describe("dedupe", () => {
  it("matches the same phone in another format, and the same email", async () => {
    ok(await doctor.post("/v1/leads", { full_name: "Kiran", phone: "98765 11111" }));
    const dup = await doctor.post("/v1/leads", { full_name: "Kiran again", phone: "+91 98765-11111" });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe("DUPLICATE_LEAD");
    expect(dup.json().details.duplicates[0].matched_on).toBe("phone");

    const byEmail = await doctor.post("/v1/leads", { full_name: "Arjun 2", email: "ARJUN@example.com " });
    expect(byEmail.statusCode).toBe(409);
  });

  it("creates a flagged duplicate when forced", async () => {
    const lead = ok(await doctor.post("/v1/leads", { full_name: "Kiran forced", phone: "9876511111", force: true }));
    expect(lead.duplicate_of_id).toBeTruthy();
  });

  it("checks for duplicates before saving", async () => {
    const res = ok(await doctor.get(`/v1/leads/duplicates?phone=${encodeURIComponent("+919876511111")}`));
    expect(res.length).toBeGreaterThan(0);
  });
});

describe("stages", () => {
  let lead;
  let gated;
  beforeAll(async () => {
    lead = ok(await doctor.post("/v1/leads", { full_name: "Stage Mover", phone: phone() }));
    gated = ok(
      await doctor.post(`/v1/pipelines/${pipeline.id}/stages`, {
        name: "Interest captured",
        required_fields: ["cf:interest", "email"],
      }),
    );
  });

  it("blocks entering a stage until its required fields are filled", async () => {
    const res = await doctor.post(`/v1/leads/${lead.id}/move`, { stage_id: gated.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("REQUIRED_FIELDS");
    expect(res.json().details.missing).toEqual(["cf:interest", "email"]);

    ok(await doctor.put(`/v1/leads/${lead.id}`, { email: "mover@example.com", custom_fields: { interest: ["Braces / Aligners"] } }));
    expect(ok(await doctor.post(`/v1/leads/${lead.id}/move`, { stage_id: gated.id })).stage_id).toBe(gated.id);
  });

  it("logs every move with time spent, and syncs status from the stage type", async () => {
    ok(await doctor.post(`/v1/leads/${lead.id}/move`, { stage_id: stage("Won - Treatment Started").id }));
    expect(ok(await doctor.get(`/v1/leads/${lead.id}`)).status).toBe("won");
    const lost = ok(await doctor.post(`/v1/leads/${lead.id}/move`, { stage_id: stage("Lost").id, lost_reason: "Too expensive" }));
    expect(lost.status).toBe("lost");
    const history = await query(
      `SELECT to_stage_id, seconds_in_previous_stage FROM lead_stage_history WHERE lead_id = :id ORDER BY changed_at`,
      { id: lead.id },
    );
    expect(history).toHaveLength(4);
    expect(history.slice(1).every((h) => h.seconds_in_previous_stage !== null)).toBe(true);
    const moves = ok(await doctor.get(`/v1/leads/${lead.id}/timeline`)).filter((a) => a.type === "stage_change");
    expect(moves).toHaveLength(3);
    expect(moves[0].body).toBe("Won - Treatment Started → Lost");
  });

  it("won't move to a stage of another pipeline", async () => {
    const other = ok(await doctor.post("/v1/pipelines", { name: "Other" }));
    const otherStage = ok(await doctor.get(`/v1/pipelines/${other.id}`)).stages[0];
    expect((await doctor.post(`/v1/leads/${lead.id}/move`, { stage_id: otherStage.id })).statusCode).toBe(400);
  });
});

describe("assignment", () => {
  it("doctor assigns to staff; staff can only take leads themselves", async () => {
    const lead = ok(await doctor.post("/v1/leads", { full_name: "Assign Me", phone: phone() }));
    expect(ok(await doctor.post(`/v1/leads/${lead.id}/assign`, { owner_id: p.staff.user.id })).owner_id).toBe(p.staff.user.id);
    const steal = await staff.post(`/v1/leads/${lead.id}/assign`, { owner_id: p.doctor.user.id });
    expect(steal.statusCode).toBe(403);
    const tl = ok(await doctor.get(`/v1/leads/${lead.id}/timeline`));
    expect(tl.some((a) => a.type === "assignment")).toBe(true);
  });

  it("round-robins new leads between pipeline members", async () => {
    ok(await doctor.put(`/v1/pipelines/${pipeline.id}/members`, { user_ids: [p.staff.user.id, p.doctor.user.id] }));
    const owners = [];
    for (let i = 0; i < 4; i++) {
      owners.push(ok(await doctor.post("/v1/leads", { full_name: `RR ${i}`, phone: phone() })).owner_id);
    }
    expect(new Set(owners).size).toBe(2);
    expect(owners[0]).not.toBe(owners[1]);
    expect(owners[0]).toBe(owners[2]);
    ok(await doctor.put(`/v1/pipelines/${pipeline.id}/members`, { user_ids: [] }));
  });
});

describe("list and kanban", () => {
  it("searches by name and phone digits", async () => {
    const lead = ok(await doctor.post("/v1/leads", { full_name: "Zubin Searchable", phone: "9811122233" }));
    const byName = await doctor.get("/v1/leads?q=searchable");
    expect(byName.json().data.map((l) => l.id)).toEqual([lead.id]);
    const byPhone = await doctor.get("/v1/leads?q=11122233");
    expect(byPhone.json().data.map((l) => l.id)).toContain(lead.id);
  });

  it("filters by stage, owner, tag, source and custom field, with pagination", async () => {
    const vip = ok(await doctor.get("/v1/tags")).find((t) => t.name === "VIP");
    expect((await doctor.get(`/v1/leads?tag_id=${vip.id}`)).json().data.every((l) => l.tags.some((t) => t.name === "VIP"))).toBe(true);
    const implants = (await doctor.get("/v1/leads?cf[interest]=Implants")).json().data;
    expect(implants.map((l) => l.full_name)).toContain("Arjun Mehta");
    expect(implants.every((l) => l.custom_fields.interest.includes("Implants"))).toBe(true);
    const walkIns = (await doctor.get("/v1/leads?source=Walk-in&limit=2&page=1")).json();
    expect(walkIns.data.length).toBeLessThanOrEqual(2);
    expect(walkIns.meta.total).toBeGreaterThanOrEqual(walkIns.data.length);
    const unassigned = (await doctor.get("/v1/leads?owner_id=unassigned")).json().data;
    expect(unassigned.every((l) => l.owner_id === null)).toBe(true);
    expect((await doctor.get("/v1/leads?cf[preferred_time]=x")).statusCode).toBe(400); // not filterable
  });

  it("returns a kanban board with per-stage totals", async () => {
    const board = ok(await doctor.get(`/v1/leads?view=kanban&pipeline_id=${pipeline.id}&per_stage=2`));
    const first = board.stages.find((s) => s.name === "New Enquiry");
    expect(first.leads.length).toBeLessThanOrEqual(2);
    expect(first.total).toBeGreaterThan(2);
    expect((await doctor.get("/v1/leads?view=kanban")).statusCode).toBe(400);
  });
});

describe("timeline and follow-ups", () => {
  it("adds notes, schedules and completes follow-ups", async () => {
    const lead = ok(await staff.post("/v1/leads", { full_name: "Follow Up", phone: phone() }));
    ok(await staff.post(`/v1/leads/${lead.id}/activities`, { type: "call", body: "No answer" }));
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const fu = ok(await staff.post(`/v1/leads/${lead.id}/activities`, { type: "follow_up", body: "Call back", due_at: yesterday }));
    expect(ok(await staff.get(`/v1/leads/${lead.id}`)).next_follow_up_at).not.toBeNull();
    expect(ok(await staff.get("/v1/leads/follow-ups/due")).map((a) => a.id)).toContain(fu.id);
    expect((await staff.get("/v1/leads?follow_up=overdue")).json().data.map((l) => l.id)).toContain(lead.id);

    ok(await staff.put(`/v1/lead-activities/${fu.id}`, { completed: true }));
    expect(ok(await staff.get(`/v1/leads/${lead.id}`)).next_follow_up_at).toBeNull();
    expect((await staff.post(`/v1/leads/${lead.id}/activities`, { type: "follow_up" })).statusCode).toBe(400);
  });

  it("records which fields changed, without their values", async () => {
    const lead = ok(await doctor.post("/v1/leads", { full_name: "Edit Me", phone: phone() }));
    ok(await doctor.put(`/v1/leads/${lead.id}`, { full_name: "Edited", notes: "secret medical note" }));
    const updated = ok(await doctor.get(`/v1/leads/${lead.id}/timeline`)).find((a) => a.type === "updated");
    expect(updated.metadata.fields).toEqual(["full_name", "notes"]);
    expect(JSON.stringify(updated)).not.toContain("secret medical note");
  });
});

describe("bulk actions", () => {
  it("assigns, tags, moves (reporting failures) and deletes", async () => {
    const a = ok(await doctor.post("/v1/leads", { full_name: "Bulk A", phone: phone() }));
    const b = ok(await doctor.post("/v1/leads", { full_name: "Bulk B", phone: phone(), email: "b@example.com", custom_fields: { interest: ["Root Canal"] } }));
    const ids = [a.id, b.id];
    expect(ok(await doctor.post("/v1/leads/bulk", { action: "assign", lead_ids: ids, owner_id: p.staff.user.id })).done).toEqual(ids);
    ok(await doctor.post("/v1/leads/bulk", { action: "tag", lead_ids: ids, tags: ["Campaign Oct"] }));
    expect(ok(await doctor.get(`/v1/leads/${a.id}`)).tags.map((t) => t.name)).toContain("Campaign Oct");

    const gated = pipeline.stages.length; // index of the stage added in the stages test
    const target = ok(await doctor.get(`/v1/pipelines/${pipeline.id}`)).stages[gated];
    const moved = ok(await doctor.post("/v1/leads/bulk", { action: "move", lead_ids: ids, stage_id: target.id }));
    expect(moved.done).toEqual([b.id]);
    expect(moved.failed.map((f) => f.id)).toEqual([a.id]);

    expect((await staff.post("/v1/leads/bulk", { action: "delete", lead_ids: ids })).statusCode).toBe(403);
    expect(ok(await doctor.post("/v1/leads/bulk", { action: "delete", lead_ids: ids })).done).toEqual(ids);
    expect((await doctor.get(`/v1/leads/${a.id}`)).statusCode).toBe(404);
  });

  it("a pipeline with leads can only be archived", async () => {
    const res = await doctor.delete(`/v1/pipelines/${pipeline.id}`);
    expect(res.statusCode).toBe(409);
  });
});

describe("visibility", () => {
  it("users without leads.view_all only see their own leads", async () => {
    const mine = ok(await doctor.post("/v1/leads", { full_name: "Staff Own", phone: phone(), owner_id: p.staff.user.id }));
    const notMine = ok(await doctor.post("/v1/leads", { full_name: "Doctor Own", phone: phone(), owner_id: p.doctor.user.id }));
    const [role] = await query(
      `INSERT INTO roles (practice_id, key, name) SELECT practice_id, 'sales', 'Sales' FROM clinics WHERE id = :c RETURNING id`,
      { c: p.clinic.id },
    );
    for (const key of ["leads.view", "leads.edit"]) {
      await query(`INSERT INTO role_permissions (role_id, permission_key) VALUES (:r, :k)`, { r: role.id, k: key });
    }
    await query(`UPDATE users SET role_id = :r WHERE id = :u`, { r: role.id, u: p.staff.user.id });
    invalidatePermissions();
    const token = await login(app, { username: p.staff.user.username, password: "Staff@123", role: "staff" });
    const sales = api(app, token);
    const ids = (await sales.get("/v1/leads?limit=100")).json().data.map((l) => l.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(notMine.id);
    expect((await sales.get(`/v1/leads/${notMine.id}`)).statusCode).toBe(404);
  });
});
