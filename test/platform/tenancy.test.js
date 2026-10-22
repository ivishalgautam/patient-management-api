import { beforeAll, afterAll, describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { buildApp } from "../../app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, createPatient, api, login, multipart } from "../setup/factories.js";
import { TENANT_MAP } from "../../app/lib/tenant-map.js";

// Routes outside the authenticated /v1 tree (public, auth, uploads, health).
const UNSCOPED = [
  /^OPTIONS /,
  /^GET \/health$/,
  /^GET \/public\/\*$/,
  /^\w+ \/v1\/auth\//,
  /^\w+ \/v1\/upload/,
  /^GET \/v1\/(banners|procedures|services)$/,
  /^GET \/v1\/services\/getByProcedureId\/:id$/,
  /^\w+ \/v1\/public\//,
  /^\w+ \/v1\/webhooks\//,
  /^GET \/v1\/integrations\/facebook\/oauth\/callback$/,
];
const MULTIPART = new Set([
  "POST /v1/documents",
  "PUT /v1/documents/:id",
  "POST /v1/x-rays",
  "POST /v1/comprehensive-examinations/multiPart",
  "PUT /v1/comprehensive-examinations/multiPart/:id",
]);

let app;
const routes = [];
let A; // victim practice
let B; // attacker practice
const ids = {};

const one = async (sql, params) => (await query(sql, params))[0];

beforeAll(async () => {
  app = await buildApp({
    logger: false,
    onRoute: (r) => {
      for (const m of [].concat(r.method)) if (m !== "HEAD") routes.push(`${m} ${r.url}`);
    },
  });
  await app.ready();
  await resetDb();

  A = await setupPractice(app);
  B = await setupPractice(app);
  const asA = api(app, A.doctor.token);

  // One row of every practice-owned resource in practice A.
  await asA.post("/v1/treatments", {
    clinic_id: A.clinic.id,
    patient_id: A.patient.id,
    service_id: A.service.id,
  });
  ids.treatment = (await one(`SELECT id FROM treatments WHERE patient_id = :p`, { p: A.patient.id })).id;
  const planRes = await asA.post("/v1/treatment-plans", {
    treatment_id: ids.treatment,
    patient_id: A.patient.id,
    total_cost: 5000,
    notes: [],
    affected_tooths: [],
  });
  if (planRes.statusCode !== 200) throw new Error(`plan fixture: ${planRes.body}`);
  const payRes = await asA.post("/v1/treatment-payments", {
    treatment_id: ids.treatment,
    clinic_id: A.clinic.id,
    payment_type: "installment",
    payment_method: "cash",
    amount_paid: 100,
  });
  if (payRes.statusCode !== 200) throw new Error(`payment fixture: ${payRes.body}`);
  await asA.post("/v1/treatment-visits", { treatment_id: ids.treatment, visit_notes: [{ n: 1 }] });
  await asA.post("/v1/treatment-prescriptions", {
    treatment_id: ids.treatment,
    data: [{ medicine_name: "x", dosage: "1", tablet_amount: 1, frequency: "morning", duration: 1 }],
  });
  await asA.post("/v1/investigations", {
    treatment_id: ids.treatment,
    temperature: 98,
    weight: 60,
    blood_pressure: 120,
    oxygen_saturation: 98,
  });
  await asA.post("/v1/notes", { patient_id: A.patient.id, notes: "n", affected_tooths: "11" });
  await asA.post("/v1/ledgers", {
    clinic_id: A.clinic.id,
    patient_id: A.patient.id,
    reference_type: "adjustment",
    entry_type: "credit",
    amount: 10,
  });
  await asA.post("/v1/comprehensive-examinations", {
    patient_id: A.patient.id,
    chief_complaint: "c",
    medical_history: "m",
    dental_history: "d",
    examination: "e",
    affected_tooths: [{ tooth: "11", color: "#000" }],
    gallery: [],
  });
  await asA.post("/v1/block-slots", {
    clinic_id: A.clinic.id,
    type: "date",
    date: "2030-01-02",
    slots: [],
  });
  await asA.post("/v1/bookings", {
    clinic_id: A.clinic.id,
    patient_id: A.patient.id,
    date: "2030-01-03",
    slot: "09:00:00",
  });

  const pick = async (resource, sql) => (ids[resource] = (await one(sql, { p: A.patient.id }))?.id);
  await pick("treatment_plan", `SELECT id FROM treatment_plans WHERE patient_id = :p`);
  await pick("treatment_payment", `SELECT id FROM treatment_payments LIMIT 1`);
  await pick("treatment_visit", `SELECT id FROM treatment_visits LIMIT 1`);
  await pick("treatment_prescription", `SELECT id FROM treatment_prescriptions LIMIT 1`);
  await pick("investigation", `SELECT id FROM investigations LIMIT 1`);
  await pick("note", `SELECT id FROM notes WHERE patient_id = :p`);
  await pick("ledger", `SELECT id FROM ledgers WHERE patient_id = :p`);
  await pick("examination", `SELECT id FROM comprehensive_examinations WHERE patient_id = :p`);
  await pick("booking", `SELECT id FROM bookings WHERE patient_id = :p`);
  await pick("clinic_patient", `SELECT id FROM clinic_patient_mappings WHERE patient_id = :p`);
  ids.blocked_slot = (await one(`SELECT id FROM blocked_slots WHERE clinic_id = :c`, { c: A.clinic.id })).id;
  ids.slot = (await one(`SELECT id FROM slots WHERE clinic_id = :c`, { c: A.clinic.id })).id;
  ids.clinic_staff = (await one(`SELECT id FROM clinic_staff_mappings WHERE clinic_id = :c`, { c: A.clinic.id })).id;
  // Rows without a working create endpoint today are inserted directly.
  ids.document = (
    await one(
      `INSERT INTO documents (id, patient_id, title, documents, added_by, created_at, updated_at)
       VALUES (gen_random_uuid(), :p, 't', '{}', :u, now(), now()) RETURNING id`,
      { p: A.patient.id, u: A.doctor.user.id },
    )
  ).id;
  ids.xray = (
    await one(
      `INSERT INTO xrays (id, treatment_id, title, files, added_by, created_at, updated_at)
       VALUES (gen_random_uuid(), :t, 't', '{}', :u, now(), now()) RETURNING id`,
      { t: ids.treatment, u: A.doctor.user.id },
    )
  ).id;
  ids.treatment_history = (
    await one(
      `INSERT INTO treatment_histories (id, treatment_id, content, files, added_by, created_at, updated_at)
       VALUES (gen_random_uuid(), :t, 'c', '{}', :u, now(), now()) RETURNING id`,
      { t: ids.treatment, u: A.doctor.user.id },
    )
  ).id;
  ids.doctor_service = (
    await one(
      `INSERT INTO doctor_service_mappings (id, doctor_id, service_id, created_at, updated_at)
       VALUES (gen_random_uuid(), :d, :s, now(), now()) RETURNING id`,
      { d: A.doctor.doctor.id, s: A.service.id },
    )
  ).id;
  // Leads configuration rows (defaults are created on first read).
  const pipelinesRes = await asA.get("/v1/pipelines");
  const [pipeline] = pipelinesRes.json().data;
  ids.pipeline = pipeline.id;
  ids.pipeline_stage = pipeline.stages[0].id;
  ids.custom_field = (await asA.get("/v1/custom-fields")).json().data[0].id;
  ids.tag = (await asA.post("/v1/tags", { name: "Fixture" })).json().data.id;
  ids.lead = (await asA.post("/v1/leads", { full_name: "Fixture Lead", phone: "9800000001" })).json().data.id;
  ids.lead_activity = (
    await asA.post(`/v1/leads/${ids.lead}/activities`, { type: "note", body: "x" })
  ).json().data.id;
  const formRes = await asA.post("/v1/forms", {
    name: "Fixture form",
    pipeline_id: ids.pipeline,
    stage_id: ids.pipeline_stage,
    fields: [
      { source: "core", core_key: "full_name" },
      { source: "core", core_key: "phone" },
    ],
  });
  ids.form = formRes.json().data.id;
  ids.integration = (
    await asA.post("/v1/integrations", {
      provider_key: "custom_webhook",
      name: "Fixture hook",
      default_pipeline_id: ids.pipeline,
      default_stage_id: ids.pipeline_stage,
    })
  ).json().data.id;
  // WhatsApp records (no Meta account needed for access checks).
  const practiceOf = `(SELECT practice_id FROM clinics WHERE id = :c)`;
  ids.whatsapp_template = (
    await one(
      `INSERT INTO whatsapp_templates (practice_id, name, category, status, components)
       VALUES (${practiceOf}, 'fixture_tpl', 'UTILITY', 'APPROVED', '[{"type":"BODY","text":"hi"}]') RETURNING id`,
      { c: A.clinic.id },
    )
  ).id;
  ids.whatsapp_conversation = (
    await one(`INSERT INTO whatsapp_conversations (practice_id, phone) VALUES (${practiceOf}, '919800000001') RETURNING id`, {
      c: A.clinic.id,
    })
  ).id;
  ids.whatsapp_campaign = (
    await one(
      `INSERT INTO whatsapp_campaigns (practice_id, name, template_id) VALUES (${practiceOf}, 'Fixture', :t) RETURNING id`,
      { c: A.clinic.id, t: ids.whatsapp_template },
    )
  ).id;
  // Accounts, chair board and patient messages records.
  const insert = async (sql, extra = {}) => (await one(sql, { c: A.clinic.id, ...extra })).id;
  ids.expense_category = await insert(`INSERT INTO expense_categories (practice_id, name) VALUES (${practiceOf}, 'Fixture') RETURNING id`);
  ids.expense = await insert(
    `INSERT INTO expenses (practice_id, clinic_id, category_id, expense_date, amount) VALUES (${practiceOf}, :c, :cat, current_date, 10) RETURNING id`,
    { cat: ids.expense_category },
  );
  ids.cash_entry = await insert(
    `INSERT INTO cash_entries (practice_id, clinic_id, entry_date, type, amount) VALUES (${practiceOf}, :c, current_date, 'cash_in', 10) RETURNING id`,
  );
  ids.invoice = await insert(
    `INSERT INTO invoices (practice_id, clinic_id, patient_id, number, issue_date, subtotal, total)
     VALUES (${practiceOf}, :c, :p, 'INV-FIXTURE', current_date, 10, 10) RETURNING id`,
    { p: A.patient.id },
  );
  ids.chair = await insert(`INSERT INTO chairs (practice_id, clinic_id, name) VALUES (${practiceOf}, :c, 'Fixture') RETURNING id`);
  ids.supplier = await insert(`INSERT INTO suppliers (practice_id, name) VALUES (${practiceOf}, 'Fixture') RETURNING id`);
  ids.inventory_item = await insert(`INSERT INTO inventory_items (practice_id, clinic_id, name) VALUES (${practiceOf}, :c, 'Fixture') RETURNING id`);
  ids.lab = await insert(`INSERT INTO labs (practice_id, name) VALUES (${practiceOf}, 'Fixture') RETURNING id`);
  ids.lab_order = await insert(
    `INSERT INTO lab_orders (practice_id, clinic_id, lab_id, patient_id, number, work_type) VALUES (${practiceOf}, :c, :l, :p, 'LAB-FIXTURE', 'Crown') RETURNING id`,
    { l: ids.lab, p: A.patient.id },
  );
  ids.email_account = await insert(
    `INSERT INTO email_accounts (practice_id, email_address, smtp_host, smtp_port, credentials_encrypted) VALUES (${practiceOf}, 'fx@clinic.test', 'smtp.test', 587, 'x') RETURNING id`,
  );
  ids.email_template = await insert(`INSERT INTO email_templates (practice_id, name, subject) VALUES (${practiceOf}, 'Fixture', 'Hi') RETURNING id`);
  ids.email_message = await insert(
    `INSERT INTO email_messages (practice_id, direction, folder, status, from_address) VALUES (${practiceOf}, 'inbound', 'inbox', 'received', 'a@b.test') RETURNING id`,
  );
  ids.email_campaign = await insert(
    `INSERT INTO email_campaigns (practice_id, name, template_id, audience_type) VALUES (${practiceOf}, 'Fixture', :t, 'upload') RETURNING id`,
    { t: ids.email_template },
  );
  ids.email_automation_rule = await insert(
    `INSERT INTO email_automation_rules (practice_id, name, trigger_type, template_id) VALUES (${practiceOf}, 'Fixture', 'lead_created', :t) RETURNING id`,
    { t: ids.email_template },
  );
  ids.patient_broadcast = await insert(`INSERT INTO patient_broadcasts (practice_id, name) VALUES (${practiceOf}, 'Fixture') RETURNING id`);
  Object.assign(ids, {
    clinic: A.clinic.id,
    patient: A.patient.id,
    doctor: A.doctor.doctor.id,
    staff: A.staff.staffId,
    user: A.staff.user.id,
  });
  for (const [k, v] of Object.entries(ids)) if (!v) throw new Error(`fixture missing ${k}`);
});
afterAll(() => app.close());

function buildRequest(key, checks) {
  const [method, path] = key.split(" ");
  let url = path;
  const body = {};
  const qs = new URLSearchParams();
  for (const [resource, source] of checks) {
    const [where, field] = source.split(".");
    if (where === "params") url = url.replace(`:${field}`, ids[resource]);
    if (where === "body") body[field] = ids[resource];
    if (where === "query") qs.set(field, ids[resource]);
  }
  url = url.replace(/:(\w+)/g, () => ids.clinic); // any other param
  if (qs.size) url += `?${qs}`;
  return { method, url, body };
}

describe("tenant map", () => {
  it("covers every authenticated route", () => {
    const authenticated = routes.filter((r) => !UNSCOPED.some((re) => re.test(r)));
    const missing = authenticated.filter((r) => !(r in TENANT_MAP));
    expect(missing).toEqual([]);
  });

  it("has no entries for routes that don't exist", () => {
    const stale = Object.keys(TENANT_MAP).filter((k) => !routes.includes(k));
    expect(stale).toEqual([]);
  });
});

describe("cross-practice access", () => {
  const scopedRoutes = Object.entries(TENANT_MAP).filter(([, rule]) => Array.isArray(rule));

  it.each(scopedRoutes)("%s returns 404 for another practice's ids", async (key, checks) => {
    const { method, url, body } = buildRequest(key, checks);
    let res;
    if (MULTIPART.has(key)) {
      const form = multipart(body, [
        { field: "file", filename: "a.png", contentType: "image/png", content: "x" },
      ]);
      res = await app.inject({
        method,
        url,
        payload: form.payload,
        headers: { ...form.headers, authorization: `Bearer ${B.doctor.token}` },
      });
    } else {
      res = await api(app, B.doctor.token)[method.toLowerCase()](
        url,
        method === "GET" || method === "DELETE" ? undefined : body,
      );
    }
    expect(res.statusCode, `${key} -> ${res.body.slice(0, 120)}`).toBe(404);
  });

  it("admin-only routes are refused for doctors", async () => {
    const res = await api(app, B.doctor.token).get("/v1/reports");
    expect(res.statusCode).toBe(403);
  });

  it("the owning practice still has access", async () => {
    const asA = api(app, A.doctor.token);
    expect((await asA.get(`/v1/treatments/${ids.treatment}`)).statusCode).toBe(200);
    expect((await asA.get(`/v1/notes/getByPatientId/${A.patient.id}`)).statusCode).toBe(200);
    expect((await api(app, A.staff.token).get(`/v1/bookings/getByClinicId/${A.clinic.id}`)).statusCode).toBe(200);
  });

  it("platform admins are not practice-scoped", async () => {
    expect((await api(app, A.admin.token).get(`/v1/treatments/${ids.treatment}`)).statusCode).toBe(200);
  });
});

describe("lists only show the caller's practice", () => {
  const contains = (res, id) => res.body.includes(id);

  it.each([
    ["/v1/patients?page=1&limit=100", () => A.patient.id],
    ["/v1/users?page=1&limit=100", () => A.staff.user.id],
    ["/v1/ledgers?page=1&limit=100", () => ids.ledger],
    ["/v1/treatment-visits?page=1&limit=100", () => ids.treatment_visit],
  ])("%s", async (url, id) => {
    const asB = await api(app, B.doctor.token).get(url);
    expect(asB.statusCode).toBe(200);
    expect(contains(asB, id())).toBe(false);
    const asA = await api(app, A.doctor.token).get(url);
    expect(contains(asA, id())).toBe(true);
  });

  it("staff see only their practice's bookings", async () => {
    const res = await api(app, B.staff.token).get("/v1/bookings?page=1&limit=100");
    expect(res.statusCode).toBe(200);
    expect(contains(res, ids.booking)).toBe(false);
  });
});

describe("patients only see their own records", () => {
  it("blocks another patient's treatment in the same practice", async () => {
    const other = await createPatient(app, A.doctor.token);
    const username = (await one(`SELECT username FROM users WHERE id = :id`, { id: other.user.id })).username;
    await query(`UPDATE users SET password = :pw WHERE id = :id`, {
      pw: bcrypt.hashSync("Pat@1234", 4),
      id: other.user.id,
    });
    const token = await login(app, { username, password: "Pat@1234" });
    const asOther = api(app, token);
    expect((await asOther.get(`/v1/treatments/${ids.treatment}`)).statusCode).toBe(404);
    expect((await asOther.get(`/v1/users/${A.patient.user.id}`)).statusCode).toBe(404);
    expect((await asOther.get(`/v1/users/${other.user.id}`)).statusCode).toBe(200);
  });
});

describe("new rows get the creator's practice", () => {
  it("patients, clinics and bookings created by B belong to B", async () => {
    const pat = await createPatient(app, B.doctor.token);
    const rows = await query(
      `SELECT (SELECT practice_id FROM patients WHERE id = :p) AS patient,
              (SELECT practice_id FROM users WHERE id = :u) AS usr,
              (SELECT practice_id FROM clinics WHERE id = :c) AS clinic,
              (SELECT practice_id FROM doctors WHERE id = :d) AS doctor`,
      { p: pat.id, u: pat.user.id, c: B.clinic.id, d: B.doctor.doctor.id },
    );
    const { patient, usr, clinic, doctor } = rows[0];
    expect(new Set([patient, usr, clinic, doctor]).size).toBe(1);
    expect(doctor).not.toBe(
      (await one(`SELECT practice_id FROM doctors WHERE id = :d`, { d: A.doctor.doctor.id })).practice_id,
    );
  });
});
