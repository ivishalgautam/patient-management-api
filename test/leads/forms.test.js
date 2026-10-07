import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api } from "../setup/factories.js";
import { issueRenderToken } from "../../app/lib/leads/form-spam.js";

let app;
let A;
let B;
let doctor;
let pipeline;
let interest;
let form;

beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  A = await setupPractice(app);
  B = await setupPractice(app);
  doctor = api(app, A.doctor.token);
  [pipeline] = (await doctor.get("/v1/pipelines")).json().data;
  interest = (await doctor.get("/v1/custom-fields")).json().data.find((f) => f.key === "interest");
});
afterAll(() => app.close());

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(300);
  return res.json().data;
};

const formBody = (overrides = {}) => ({
  name: "Implant Enquiry",
  pipeline_id: pipeline.id,
  stage_id: pipeline.stages[0].id,
  clinic_id: A.clinic.id,
  settings: { thank_you_message: "Thanks!", spam: { min_seconds: 3 } },
  fields: [
    { source: "core", core_key: "full_name" },
    { source: "core", core_key: "phone", is_required: true, width: "half" },
    { source: "core", core_key: "email", width: "half" },
    { source: "custom", custom_field_id: interest.id, is_required: true },
    { source: "core", core_key: "notes" },
  ],
  ...overrides,
});

// A token issued 10 seconds ago, as if the visitor took time to fill it in.
const oldToken = (formId) => issueRenderToken(formId, Date.now() - 10_000);
const submit = (slug, payload, ip = "203.0.113.7") =>
  app.inject({
    method: "POST",
    url: `/v1/public/forms/${slug}/submissions`,
    payload,
    headers: { "x-forwarded-for": ip },
    remoteAddress: ip,
  });

describe("form builder", () => {
  it("creates a form with fields, share link and embed code", async () => {
    form = ok(await doctor.post("/v1/forms", formBody()));
    expect(form.slug).toMatch(/^implant-enquiry-[0-9a-f]{6}$/);
    expect(form.share_url).toContain(`/f/${form.slug}`);
    expect(form.embed_code).toContain("<iframe");
    expect(form.fields.map((f) => f.core_key ?? "custom")).toEqual(["full_name", "phone", "email", "custom", "notes"]);
    expect(form.fields[0].is_required).toBe(true);
  });

  it("requires a name field and a phone or email field", async () => {
    const res = await doctor.post("/v1/forms", formBody({ name: "Bad", fields: [{ source: "core", core_key: "notes" }] }));
    expect(res.statusCode).toBe(400);
  });

  it("rejects a stage from another pipeline and duplicate fields", async () => {
    const other = ok(await doctor.post("/v1/pipelines", { name: "Other" }));
    const otherStage = ok(await doctor.get(`/v1/pipelines/${other.id}`)).stages[0];
    expect((await doctor.post("/v1/forms", formBody({ name: "X1", stage_id: otherStage.id }))).statusCode).toBe(400);
    const dupFields = formBody({ name: "X2" });
    dupFields.fields.push({ source: "core", core_key: "phone" });
    expect((await doctor.post("/v1/forms", dupFields)).statusCode).toBe(400);
  });

  it("staff can view forms but not edit them; other practices can't see them", async () => {
    expect((await api(app, A.staff.token).get(`/v1/forms/${form.id}`)).statusCode).toBe(200);
    expect((await api(app, A.staff.token).put(`/v1/forms/${form.id}`, formBody())).statusCode).toBe(403);
    expect((await api(app, B.doctor.token).get(`/v1/forms/${form.id}`)).statusCode).toBe(404);
  });
});

describe("public form", () => {
  it("serves the definition with a render token and no internal ids of other tables", async () => {
    const def = ok(await app.inject({ url: `/v1/public/forms/${form.slug}` }));
    expect(def.title).toBe("Implant Enquiry");
    expect(def.token).toBeTruthy();
    expect(def.honeypot_field).toBe("_hp");
    const field = def.fields.find((f) => f.key === "interest");
    expect(field.type).toBe("multi_select");
    expect(field.options).toContain("Implants");
    expect(JSON.stringify(def)).not.toContain(pipeline.id);
  });

  it("creates a lead in the form's pipeline/stage with source Website", async () => {
    const res = await submit(form.slug, {
      _token: oldToken(form.id),
      values: {
        full_name: "Meera <b>Nair</b>",
        phone: "98111 22233",
        email: "meera@example.com",
        interest: ["Implants"],
        notes: "Missing tooth, need an implant",
      },
    });
    expect(ok(res).message).toBe("Thanks!");
    const [lead] = await query(
      `SELECT l.*, (SELECT value_json FROM lead_custom_field_values v WHERE v.lead_id = l.id) AS interest
         FROM leads l WHERE l.form_id = :f`,
      { f: form.id },
    );
    expect(lead.full_name).toBe("Meera Nair");
    expect(lead.source).toBe("Website");
    expect(lead.sub_source).toBe("Implant Enquiry");
    expect(lead.stage_id).toBe(pipeline.stages[0].id);
    expect(lead.clinic_id).toBe(A.clinic.id);
    expect(lead.interest).toEqual(["Implants"]);
    const [sub] = await query(`SELECT status, ip_hash FROM form_submissions WHERE form_id = :f`, { f: form.id });
    expect(sub.status).toBe("accepted");
    expect(sub.ip_hash).not.toContain("203.0.113.7");
  });

  it("merges a repeat enquiry into the existing open lead", async () => {
    await submit(form.slug, {
      _token: oldToken(form.id),
      values: { full_name: "Meera N", phone: "+91 98111-22233", interest: ["Whitening"] },
    });
    const leads = await query(`SELECT id FROM leads WHERE form_id = :f`, { f: form.id });
    expect(leads).toHaveLength(1);
    const tl = await query(`SELECT type FROM lead_activities WHERE lead_id = :id`, { id: leads[0].id });
    expect(tl.filter((a) => a.type === "form_submission")).toHaveLength(2);
  });

  it("reports field errors to the visitor", async () => {
    const res = await submit(form.slug, { _token: oldToken(form.id), values: { full_name: "No Phone", interest: [] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("INVALID_FIELDS");
    expect(Object.keys(res.json().details.errors).sort()).toEqual(["interest", "phone"]);
  });

  it("silently drops honeypot hits, instant posts and forged tokens", async () => {
    const before = (await query(`SELECT count(*)::int AS n FROM leads`))[0].n;
    const values = { full_name: "Bot", phone: "9800012345", interest: ["Implants"] };
    expect((await submit(form.slug, { _hp: "http://spam", _token: oldToken(form.id), values })).statusCode).toBe(200);
    expect((await submit(form.slug, { _token: issueRenderToken(form.id), values })).statusCode).toBe(200);
    expect((await submit(form.slug, { _token: "abc.def", values })).statusCode).toBe(200);
    expect((await submit(form.slug, { values })).statusCode).toBe(200);
    expect((await query(`SELECT count(*)::int AS n FROM leads`))[0].n).toBe(before);
    const spam = await query(`SELECT error FROM form_submissions WHERE status = 'spam' ORDER BY created_at`);
    expect(spam.map((s) => s.error)).toEqual(["honeypot filled", "submitted too fast", "bad signature", "missing token"]);
  });

  it("rate-limits one visitor per form", async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await submit(form.slug, { values: {} }, "198.51.100.9")).statusCode);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  it("is unavailable once deactivated or deleted", async () => {
    const temp = ok(await doctor.post("/v1/forms", formBody({ name: "Temp form", is_active: false })));
    expect((await app.inject({ url: `/v1/public/forms/${temp.slug}` })).statusCode).toBe(404);
    ok(await doctor.delete(`/v1/forms/${temp.id}`));
    expect((await doctor.get(`/v1/forms/${temp.id}`)).statusCode).toBe(404);
  });

  it("assigns form leads to a fixed owner when configured", async () => {
    const fixed = ok(
      await doctor.post("/v1/forms", formBody({ name: "Fixed owner", assignment: "fixed", fixed_owner_id: A.staff.user.id })),
    );
    await submit(fixed.slug, {
      _token: oldToken(fixed.id),
      values: { full_name: "Owner Test", phone: "9822233344", interest: ["Root Canal"] },
    });
    const [lead] = await query(`SELECT owner_id FROM leads WHERE form_id = :f`, { f: fixed.id });
    expect(lead.owner_id).toBe(A.staff.user.id);
  });

  it("lists submissions for the form owner", async () => {
    const res = await doctor.get(`/v1/forms/${form.id}/submissions`);
    expect(res.json().meta.total).toBeGreaterThan(3);
  });
});

describe("turnstile", () => {
  it("is ignored unless the server has Turnstile keys", async () => {
    const t = ok(await doctor.post("/v1/forms", formBody({ name: "Turnstile", settings: { spam: { turnstile: true } } })));
    const def = ok(await app.inject({ url: `/v1/public/forms/${t.slug}` }));
    expect(def.turnstile_site_key).toBeNull();
  });
});
