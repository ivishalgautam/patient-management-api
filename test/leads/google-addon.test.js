import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import xlsx from "xlsx";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, multipart } from "../setup/factories.js";
import { sheetHttp } from "../../app/lib/leads/import-parse.js";
import { processImport, purgeImportRows } from "../../app/api/lead-import/service.js";
import { toNormalized } from "../../app/lib/integrations/providers/google-ads.js";

let app;
let A;
let B;
let doctor;
let pipeline;

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(400);
  return res.json().data;
};
const waitFor = (fn) => vi.waitFor(fn, { timeout: 15000, interval: 300 });

const upload = (token, filename, content, fields = {}) => {
  const body = multipart(fields, [{ field: "file", filename, contentType: "text/csv", content }]);
  return app.inject({
    method: "POST",
    url: "/v1/lead-imports/upload",
    payload: body.payload,
    headers: { ...body.headers, authorization: `Bearer ${token}` },
  });
};

beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  A = await setupPractice(app);
  B = await setupPractice(app);
  doctor = api(app, A.doctor.token);
  [pipeline] = ok(await doctor.get("/v1/pipelines"));
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app.close();
});

describe("practice add-ons", () => {
  it("are off by default and gate the Google providers", async () => {
    const [feature] = ok(await doctor.get("/v1/practice-features"));
    expect(feature).toMatchObject({ key: "google_leads", enabled: false, clinics: [] });
    const providers = ok(await doctor.get("/v1/integrations/providers"));
    expect(providers.find((p) => p.key === "google_ads_lead_form").enabled).toBe(false);
    expect((await upload(A.doctor.token, "a.csv", "Name,Phone\nX,9876500001\n")).statusCode).toBe(403);
  });

  it("only practice managers can switch them, per practice or per clinic", async () => {
    expect((await api(app, A.staff.token).put("/v1/practice-features/google_leads", { enabled: true })).statusCode).toBe(403);
    expect((await doctor.put("/v1/practice-features/unknown", { enabled: true })).statusCode).toBe(404);
    expect((await doctor.put("/v1/practice-features/google_leads", { enabled: true, clinic_id: B.clinic.id })).statusCode).toBe(404);

    const clinicOnly = ok(await doctor.put("/v1/practice-features/google_leads", { enabled: true, clinic_id: A.clinic.id }));
    expect(clinicOnly).toMatchObject({ enabled: false, clinics: [{ clinic_id: A.clinic.id, enabled: true }] });
    ok(await doctor.put("/v1/practice-features/google_leads", { clinic_id: A.clinic.id, reset: true }));

    const on = ok(await doctor.put("/v1/practice-features/google_leads", { enabled: true }));
    expect(on.enabled).toBe(true);
    // Another practice is unaffected.
    expect(ok(await api(app, B.doctor.token).get("/v1/practice-features"))[0].enabled).toBe(false);
  });
});

describe("Google Ads lead form webhook", () => {
  let hook;
  let path;
  const googleLead = (leadId, overrides = {}) => ({
    lead_id: leadId,
    api_version: "1.0",
    form_id: 4001,
    campaign_id: 5001,
    google_key: "shared-google-key",
    is_test: false,
    user_column_data: [
      { column_id: "FULL_NAME", column_name: "Full Name", string_value: "Gina Google" },
      { column_id: "PHONE_NUMBER", column_name: "User Phone", string_value: "+91 98111 22333" },
      { column_id: "EMAIL", column_name: "User Email", string_value: "gina@example.com" },
      { column_id: "SERVICE", column_name: "Which treatment?", string_value: "Implants" },
    ],
    ...overrides,
  });
  const leadsFor = (id) => query(`SELECT * FROM leads WHERE integration_id = :id ORDER BY created_at`, { id });

  it("normalizes Google's column data", () => {
    const n = toNormalized(
      googleLead("G0", {
        user_column_data: [
          { column_id: "FIRST_NAME", string_value: "Ann" },
          { column_id: "LAST_NAME", string_value: "Lee" },
          { column_id: "WORK_PHONE", string_value: "9800000000" },
          { column_id: "PHONE_NUMBER", string_value: "9811111111" },
        ],
      }),
    );
    expect(n).toMatchObject({
      providerLeadId: "G0",
      isTest: false,
      answers: { first_name: "Ann", last_name: "Lee", phone_number: "9811111111" },
    });
  });

  it("creates the integration with an encrypted shared key", async () => {
    hook = ok(
      await doctor.post("/v1/integrations", {
        provider_key: "google_ads_lead_form",
        name: "Google Ads – Implants",
        default_pipeline_id: pipeline.id,
        default_stage_id: pipeline.stages[0].id,
        google_key: "shared-google-key",
        field_mapping: { "Which treatment?": "cf:interest" },
      }),
    );
    expect(hook.webhook_url).toMatch(/\/webhooks\/google-ads\/.+/);
    expect(JSON.stringify(hook)).not.toContain("shared-google-key");
    path = new URL(hook.webhook_url).pathname;
    const [row] = await query(`SELECT secrets_encrypted FROM integrations WHERE id = :id`, { id: hook.id });
    expect(row.secrets_encrypted).not.toContain("shared-google-key");
  });

  it("rejects a wrong google_key without storing the payload", async () => {
    const res = await app.inject({ method: "POST", url: path, payload: googleLead("G1", { google_key: "nope-nope" }) });
    expect(res.statusCode).toBe(403);
    const events = await query(`SELECT status, payload_encrypted FROM integration_events WHERE integration_id = :id`, { id: hook.id });
    expect(events).toEqual([{ status: "error", payload_encrypted: null }]);
    expect(await leadsFor(hook.id)).toEqual([]);
  });

  it("turns a delivery into a lead and keeps the key out of the log", async () => {
    const res = await app.inject({ method: "POST", url: path, payload: googleLead("G2") });
    expect(res.statusCode).toBe(200);
    await waitFor(async () => expect((await leadsFor(hook.id)).length).toBe(1));
    const [lead] = await leadsFor(hook.id);
    expect(lead).toMatchObject({ full_name: "Gina Google", source: "Google", phone_normalized: "+919811122333" });
    const detail = ok(await doctor.get(`/v1/leads/${lead.id}`));
    expect(detail.custom_fields.interest).toEqual(["Implants"]);
    const [event] = await query(
      `SELECT payload_redacted FROM integration_events WHERE integration_id = :id AND provider_lead_id = 'G2'`,
      { id: hook.id },
    );
    expect(event.payload_redacted.google_key).toBe("[secret]");
    expect(JSON.stringify(event.payload_redacted)).not.toContain("gina@example.com");
  });

  it("dedupes repeat deliveries of the same lead id", async () => {
    expect((await app.inject({ method: "POST", url: path, payload: googleLead("G2") })).statusCode).toBe(200);
    await waitFor(async () => {
      const events = await query(
        `SELECT status FROM integration_events WHERE integration_id = :id AND provider_lead_id = 'G2' ORDER BY created_at`,
        { id: hook.id },
      );
      expect(events.map((e) => e.status)).toEqual(["processed", "duplicate"]);
    });
    expect((await leadsFor(hook.id)).length).toBe(1);
  });

  it("logs Google test leads without creating a lead, unless asked to keep them", async () => {
    await app.inject({ method: "POST", url: path, payload: googleLead("TEST1", { is_test: true, user_column_data: [{ column_id: "PHONE_NUMBER", string_value: "9822200001" }] }) });
    await waitFor(async () => {
      const [e] = await query(`SELECT status, error_message FROM integration_events WHERE provider_lead_id = 'TEST1'`);
      expect(e?.status).toBe("ignored");
      expect(e.error_message).toContain("connection works");
    });
    expect((await leadsFor(hook.id)).length).toBe(1);

    ok(await doctor.put(`/v1/integrations/${hook.id}`, { accept_test_leads: true }));
    await app.inject({ method: "POST", url: path, payload: googleLead("TEST2", { is_test: true, user_column_data: [{ column_id: "PHONE_NUMBER", string_value: "9822200002" }] }) });
    await waitFor(async () => expect((await leadsFor(hook.id)).length).toBe(2));
  });

  it("the key can be changed; the old one stops working", async () => {
    ok(await doctor.put(`/v1/integrations/${hook.id}`, { google_key: "brand-new-key" }));
    expect((await app.inject({ method: "POST", url: path, payload: googleLead("G3") })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: path, payload: googleLead("G3", { google_key: "brand-new-key" }) })).statusCode).toBe(200);
  });

  it("switching the add-on off stops deliveries", async () => {
    ok(await doctor.put("/v1/practice-features/google_leads", { enabled: false }));
    expect((await app.inject({ method: "POST", url: path, payload: googleLead("G4", { google_key: "brand-new-key" }) })).statusCode).toBe(404);
    ok(await doctor.put("/v1/practice-features/google_leads", { enabled: true }));
  });
});

describe("sheet / CSV import", () => {
  let draft;
  const csv = [
    "Patient Name,Mobile,E-mail,Treatment,Branch",
    "Asha Rao,9876511111,asha@example.com,Implants,Main",
    "Bina Das,9876522222,,\"Braces / Aligners, Implants\",Main",
    "No Contact,,,Cleaning / Scaling,Main",
    "Asha Again,98765 11111,,Implants,Main",
    "Bad Mail,,not-an-email,,Main",
    "=HYPERLINK(\"x\"),,,,",
  ].join("\n");
  const settings = () => ({
    mapping: { "Patient Name": "full_name", Mobile: "phone", "E-mail": "email", Treatment: "cf:interest", Branch: "ignore" },
    pipeline_id: pipeline.id,
    stage_id: pipeline.stages[0].id,
    dedupe_policy: "skip",
  });

  it("uploads a CSV into a draft with headers, a sample and a suggested mapping", async () => {
    const res = await upload(A.doctor.token, "leads.csv", csv);
    draft = ok(res);
    expect(res.statusCode).toBe(201);
    expect(draft).toMatchObject({ status: "draft", source_type: "file", source_name: "leads.csv", total_rows: 6 });
    expect(draft.headers).toEqual(["Patient Name", "Mobile", "E-mail", "Treatment", "Branch"]);
    expect(draft.sample[0]).toMatchObject({ "Patient Name": "Asha Rao", Mobile: "9876511111" });
    expect(draft.suggested_mapping).toEqual({
      "Patient Name": "full_name",
      Mobile: "phone",
      "E-mail": "email",
      Treatment: "ignore",
      Branch: "ignore",
    });
  });

  it("reads Excel files too (phone digits intact)", async () => {
    const sheet = xlsx.utils.aoa_to_sheet([["Name", "Phone"], ["Excel Person", 9876533333]]);
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, sheet, "Leads");
    const buffer = xlsx.write(book, { type: "buffer", bookType: "xlsx" });
    const x = ok(await upload(A.doctor.token, "leads.xlsx", buffer));
    expect(x.sample[0]).toEqual({ Name: "Excel Person", Phone: "9876533333" });
    ok(await doctor.post(`/v1/lead-imports/${x.id}/cancel`));
  });

  it("validates the mapping", async () => {
    const noContact = await doctor.post(`/v1/lead-imports/${draft.id}/dry-run`, { ...settings(), mapping: { "Patient Name": "full_name" } });
    expect(noContact.statusCode).toBe(400);
    const unknownColumn = await doctor.post(`/v1/lead-imports/${draft.id}/dry-run`, { ...settings(), mapping: { Nope: "phone" } });
    expect(unknownColumn.statusCode).toBe(400);
    const unknownField = await doctor.post(`/v1/lead-imports/${draft.id}/dry-run`, {
      ...settings(),
      mapping: { Mobile: "phone", Treatment: "cf:nope" },
    });
    expect(unknownField.statusCode).toBe(400);
  });

  it("dry-run reports what would happen without writing leads", async () => {
    // An existing lead with Bina's number.
    ok(await doctor.post("/v1/leads", { full_name: "Bina Existing", phone: "9876522222", force: true }));
    const before = await query(`SELECT count(*)::int AS n FROM leads`);
    const { summary, rows } = ok(await doctor.post(`/v1/lead-imports/${draft.id}/dry-run`, settings()));
    expect(summary).toMatchObject({ total: 6, created: 1, skipped: 2, error: 3 });
    expect(rows.find((r) => r.row_number === 2)).toMatchObject({ outcome: "created", lead: { full_name: "Asha Rao" } });
    expect(rows.find((r) => r.row_number === 3).outcome).toBe("skipped"); // existing lead
    expect(rows.find((r) => r.row_number === 5).outcome).toBe("skipped"); // same phone as row 2
    expect(rows.find((r) => r.row_number === 4).message).toContain("No phone number or email");
    expect(rows.find((r) => r.row_number === 6).message).toContain("isn't valid");

    const flagged = ok(await doctor.post(`/v1/lead-imports/${draft.id}/dry-run`, { ...settings(), dedupe_policy: "merge" }));
    expect(flagged.summary).toMatchObject({ created: 1, merged: 2 });
    const after = await query(`SELECT count(*)::int AS n FROM leads`);
    expect(after).toEqual(before);
  });

  it("runs in the background and records an outcome per row", async () => {
    const started = ok(await doctor.post(`/v1/lead-imports/${draft.id}/start`, settings()));
    expect(started.status).toBe("queued");
    await waitFor(async () => expect(ok(await doctor.get(`/v1/lead-imports/${draft.id}`)).status).toBe("completed"));
    const done = ok(await doctor.get(`/v1/lead-imports/${draft.id}`));
    expect(done.summary).toMatchObject({ created: 1, skipped: 2, error: 3, pending: 0 });
    expect(done.processed_rows).toBe(6);

    const [lead] = await query(`SELECT * FROM leads WHERE full_name = 'Asha Rao'`);
    expect(lead).toMatchObject({ source: "Import", sub_source: "leads.csv", stage_id: pipeline.stages[0].id });
    const detail = ok(await doctor.get(`/v1/leads/${lead.id}`));
    expect(detail.custom_fields.interest).toEqual(["Implants"]);
    const timeline = ok(await doctor.get(`/v1/leads/${lead.id}/timeline`));
    expect(timeline.some((a) => a.body === "Imported from leads.csv")).toBe(true);

    // Can't be started twice.
    expect((await doctor.post(`/v1/lead-imports/${draft.id}/start`, settings())).statusCode).toBe(409);
  });

  it("re-running the job doesn't import rows twice", async () => {
    await query(`UPDATE lead_imports SET status = 'running' WHERE id = :id`, { id: draft.id });
    await processImport({ importId: draft.id });
    const [{ n }] = await query(`SELECT count(*)::int AS n FROM leads WHERE full_name = 'Asha Rao'`);
    expect(n).toBe(1);
  });

  it("offers an error report CSV that can't inject formulas", async () => {
    const res = await doctor.get(`/v1/lead-imports/${draft.id}/errors.csv`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const lines = res.body.trim().split("\r\n");
    expect(lines[0]).toBe("Row,Result,Problem,Patient Name,Mobile,E-mail,Treatment,Branch");
    expect(lines).toHaveLength(4);
    expect(res.body).toContain("No phone number or email");
    expect(res.body).toContain(`"'=HYPERLINK(""x"")"`);
    const withSkipped = await doctor.get(`/v1/lead-imports/${draft.id}/errors.csv?include_skipped=true`);
    expect(withSkipped.body.trim().split("\r\n")).toHaveLength(6);
  });

  it("lists import history and rows by outcome", async () => {
    const res = await doctor.get("/v1/lead-imports");
    const history = ok(res);
    expect(res.json().meta.total).toBeGreaterThanOrEqual(2);
    expect(history.find((h) => h.id === draft.id)).toMatchObject({ status: "completed", summary: { created: 1 } });
    const errors = ok(await doctor.get(`/v1/lead-imports/${draft.id}/rows?status=error`));
    expect(errors.map((r) => r.row_number)).toEqual([4, 6, 7]);
  });

  it("imports a shared Google Sheet via its CSV export", async () => {
    const spy = vi.spyOn(sheetHttp, "get").mockResolvedValueOnce({
      status: 200,
      headers: { "content-type": "text/csv" },
      data: Buffer.from("Name,Phone\nSheet Person,9876544444\n"),
    });
    const sheetUrl = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=42";
    const sheet = ok(await doctor.post("/v1/lead-imports/sheet", { url: sheetUrl }));
    expect(spy.mock.calls[0][0]).toBe(
      "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=csv&gid=42",
    );
    expect(sheet).toMatchObject({ source_type: "google_sheet", total_rows: 1 });
    expect(sheet.source_name).not.toContain("1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789");
    ok(await doctor.post(`/v1/lead-imports/${sheet.id}/start`, { mapping: { Name: "full_name", Phone: "phone" } }));
    await waitFor(async () => expect(ok(await doctor.get(`/v1/lead-imports/${sheet.id}`)).status).toBe("completed"));
    expect((await query(`SELECT 1 FROM leads WHERE full_name = 'Sheet Person'`)).length).toBe(1);
  });

  it("refuses other hosts and private sheets", async () => {
    expect((await doctor.post("/v1/lead-imports/sheet", { url: "http://169.254.169.254/latest" })).statusCode).toBe(400);
    expect((await doctor.post("/v1/lead-imports/sheet", { url: "https://evil.example/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" })).statusCode).toBe(400);
    vi.spyOn(sheetHttp, "get").mockResolvedValueOnce({ status: 200, headers: { "content-type": "text/html" }, data: Buffer.from("<html>Sign in</html>") });
    const res = await doctor.post("/v1/lead-imports/sheet", { url: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit" });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("Anyone with the link");
  });

  it("is limited to the practice and to people allowed to import", async () => {
    expect((await api(app, B.doctor.token).get(`/v1/lead-imports/${draft.id}`)).statusCode).toBe(404);
    expect(ok(await api(app, B.doctor.token).get("/v1/lead-imports"))).toEqual([]);
    expect((await api(app, A.staff.token).get("/v1/lead-imports")).statusCode).toBe(403);
  });

  it("can cancel a draft and purges raw rows after the retention period", async () => {
    const d = ok(await upload(A.doctor.token, "later.csv", "Name,Phone\nLater,9876555555\n"));
    expect(ok(await doctor.post(`/v1/lead-imports/${d.id}/cancel`)).status).toBe("cancelled");
    expect((await doctor.post(`/v1/lead-imports/${d.id}/start`, { mapping: { Phone: "phone" } })).statusCode).toBe(409);

    await query(`UPDATE lead_imports SET created_at = now() - interval '40 days' WHERE id = :id`, { id: draft.id });
    await purgeImportRows();
    const rows = await query(`SELECT data, status, message FROM lead_import_rows WHERE import_id = :id`, { id: draft.id });
    expect(rows.every((r) => r.data === null && r.status !== "pending")).toBe(true);
  });
});
