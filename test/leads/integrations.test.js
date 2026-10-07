import crypto from "crypto";
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api } from "../setup/factories.js";
import { graph } from "../../app/lib/integrations/providers/facebook-leads.js";
import { pullFacebook, purgeIntegrationPayloads, checkFacebookToken } from "../../app/jobs/integration-handlers.js";

let app;
let A;
let B;
let doctor;
let pipeline;
let integration;

// --- Graph API stub ---------------------------------------------------------
const fbLeads = new Map(); // leadgen id -> lead object
const graphCalls = [];
let tokenValid = true;
function stubGraph() {
  return vi.spyOn(graph, "request").mockImplementation(async ({ url, params, method }) => {
    graphCalls.push({ url, params, method });
    const path = new URL(url).pathname.replace(/^\/v[\d.]+/, "");
    if (path === "/oauth/access_token") {
      return { data: params.grant_type === "fb_exchange_token" ? { access_token: "LONG_USER", expires_in: 5184000 } : { access_token: "SHORT_USER" } };
    }
    if (path === "/me/accounts") {
      return { data: { data: [{ id: "PAGE1", name: "Smile Dental", access_token: "PAGE1_TOKEN" }] } };
    }
    if (path === "/PAGE1/leadgen_forms") return { data: { data: [{ id: "FORM1", name: "Implant Offer", status: "ACTIVE" }] } };
    if (path === "/PAGE1/subscribed_apps") return { data: { success: true } };
    if (path === "/debug_token") return { data: { data: { is_valid: tokenValid, expires_at: 0 } } };
    if (path === "/FORM1/leads") return { data: { data: [...fbLeads.values()] } };
    const lead = fbLeads.get(path.slice(1));
    if (lead) return { data: lead };
    const error = new Error("not found");
    error.response = { status: 400, data: { error: { message: `Unsupported get request ${path}`, code: 100 } } };
    throw error;
  });
}

const fbLead = (id, answers, createdTime = "2026-10-01T10:00:00+0000") => ({
  id,
  form_id: "FORM1",
  created_time: createdTime,
  field_data: Object.entries(answers).map(([name, v]) => ({ name, values: [v] })),
});

const signedPost = (payload, secret = "test-app-secret") => {
  const body = JSON.stringify(payload);
  const sig = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  return app.inject({
    method: "POST",
    url: "/v1/webhooks/facebook-leads",
    payload: body,
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
  });
};
const leadgenNotification = (leadgenId) => ({
  object: "page",
  entry: [{ id: "PAGE1", changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, page_id: "PAGE1", form_id: "FORM1" } }] }],
});

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(400);
  return res.json().data;
};

beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  A = await setupPractice(app);
  B = await setupPractice(app);
  doctor = api(app, A.doctor.token);
  [pipeline] = ok(await doctor.get("/v1/pipelines"));
  stubGraph();
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app.close();
});
afterEach(() => {
  graphCalls.length = 0;
});

describe("facebook connect", () => {
  let sessionId;

  it("starts OAuth with a signed state and the right scopes", async () => {
    const { url } = ok(await doctor.get("/v1/integrations/facebook/oauth/start"));
    const u = new URL(url);
    expect(u.searchParams.get("client_id")).toBe("test-app-id");
    expect(u.searchParams.get("redirect_uri")).toBe("http://api.test/v1/integrations/facebook/oauth/callback");
    expect(u.searchParams.get("scope")).toContain("leads_retrieval");
    const state = u.searchParams.get("state");
    const res = await app.inject({ url: `/v1/integrations/facebook/oauth/callback?code=abc&state=${encodeURIComponent(state)}` });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.pathname).toBe("/settings/integrations/facebook-leads/select-page");
    sessionId = location.searchParams.get("session");
    expect(graphCalls.some((c) => c.params?.grant_type === "fb_exchange_token")).toBe(true);
  });

  it("rejects a forged state", async () => {
    const res = await app.inject({ url: "/v1/integrations/facebook/oauth/callback?code=abc&state=eyJ4IjoxfQ.forged" });
    expect(res.headers.location).toContain("facebook_error=");
  });

  it("only the user who started the flow can use the session", async () => {
    const pages = ok(await doctor.get(`/v1/integrations/facebook/oauth/pages?session=${sessionId}`));
    expect(pages).toEqual([{ id: "PAGE1", name: "Smile Dental" }]);
    expect(JSON.stringify(pages)).not.toContain("PAGE1_TOKEN");
    expect((await api(app, B.doctor.token).get(`/v1/integrations/facebook/oauth/pages?session=${sessionId}`)).statusCode).toBe(404);
    expect((await api(app, A.staff.token).get(`/v1/integrations/facebook/oauth/pages?session=${sessionId}`)).statusCode).toBe(403);
  });

  it("lists the page's forms and finalizes the connection", async () => {
    const forms = ok(await doctor.get(`/v1/integrations/facebook/oauth/forms?session=${sessionId}&page_id=PAGE1`));
    expect(forms[0].id).toBe("FORM1");
    integration = ok(
      await doctor.post("/v1/integrations/facebook/oauth/finalize", {
        session: sessionId,
        page_id: "PAGE1",
        form_ids: ["FORM1"],
        forms: [{ id: "FORM1", name: "Implant Offer" }],
        default_pipeline_id: pipeline.id,
        default_stage_id: pipeline.stages[0].id,
        field_mapping: { "which_treatment_are_you_interested_in?": "cf:interest" },
      }),
    );
    expect(integration.status).toBe("active");
    expect(integration.has_secrets).toBe(true);
    expect(JSON.stringify(integration)).not.toContain("PAGE1_TOKEN");
    expect(graphCalls.some((c) => c.url.endsWith("/PAGE1/subscribed_apps") && c.params.subscribed_fields === "leadgen")).toBe(true);
    // The session is single-use.
    expect((await doctor.get(`/v1/integrations/facebook/oauth/pages?session=${sessionId}`)).statusCode).toBe(404);
  });
});

describe("facebook webhook", () => {
  it("answers Meta's verification handshake only with the right token", async () => {
    const good = await app.inject({ url: "/v1/webhooks/facebook-leads?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345" });
    expect(good.statusCode).toBe(200);
    expect(good.body).toBe("12345");
    const bad = await app.inject({ url: "/v1/webhooks/facebook-leads?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1" });
    expect(bad.statusCode).toBe(403);
  });

  it("ignores deliveries with a bad signature", async () => {
    const before = (await query(`SELECT count(*)::int AS n FROM integration_events`))[0].n;
    const res = await signedPost(leadgenNotification("L-BAD"), "wrong-secret");
    expect(res.statusCode).toBe(200);
    expect((await query(`SELECT count(*)::int AS n FROM integration_events`))[0].n).toBe(before);
  });

  it("queues the delivery, fetches the lead from Graph and creates it with mapped fields", async () => {
    fbLeads.set(
      "L1",
      fbLead("L1", {
        full_name: "Sana Khan",
        phone_number: "+919833300011",
        email: "sana@example.com",
        "which_treatment_are_you_interested_in?": "Implants",
        "Best day to visit": "Saturday",
      }),
    );
    expect((await signedPost(leadgenNotification("L1"))).statusCode).toBe(200);
    const lead = await vi.waitFor(
      async () => {
        const [row] = await query(`SELECT * FROM leads WHERE integration_id = :id`, { id: integration.id });
        expect(row).toBeTruthy();
        return row;
      },
      { timeout: 15000, interval: 300 },
    );
    expect(lead.full_name).toBe("Sana Khan");
    expect(lead.source).toBe("Facebook");
    expect(lead.sub_source).toBe("Facebook: Implant Offer");
    expect(lead.phone_normalized).toBe("+919833300011");
    expect(lead.notes).toBe("Best day to visit: Saturday");
    expect(new Date(lead.created_at).toISOString()).toBe("2026-10-01T10:00:00.000Z");
    const [cf] = await query(`SELECT value_json FROM lead_custom_field_values WHERE lead_id = :id`, { id: lead.id });
    expect(cf.value_json).toEqual(["Implants"]);
  });

  it("stores the payload redacted and encrypted, never in plain text", async () => {
    const [event] = await query(
      `SELECT payload_redacted, payload_encrypted, status FROM integration_events WHERE provider_lead_id = 'L1' ORDER BY created_at LIMIT 1`,
    );
    expect(event.status).toBe("processed");
    expect(event.payload_encrypted).toBeTruthy();
    expect(event.payload_encrypted).not.toContain("L1");
  });

  it("dedupes a redelivery and merges a repeat enquiry", async () => {
    await signedPost(leadgenNotification("L1"));
    fbLeads.set("L2", fbLead("L2", { full_name: "Sana K", phone_number: "9833300011" }));
    await signedPost(leadgenNotification("L2"));
    await vi.waitFor(
      async () => {
        const events = await query(`SELECT status FROM integration_events WHERE provider_lead_id IN ('L1', 'L2') ORDER BY created_at`);
        expect(events.map((e) => e.status)).toEqual(["processed", "duplicate", "duplicate"]);
      },
      { timeout: 15000, interval: 300 },
    );
    const leads = await query(`SELECT id FROM leads WHERE integration_id = :id`, { id: integration.id });
    expect(leads).toHaveLength(1);
  });

  it("logs Graph failures and replays the event on retry", async () => {
    await signedPost(leadgenNotification("L3")); // unknown to Graph -> error (not retryable)
    const event = await vi.waitFor(
      async () => {
        const [e] = await query(`SELECT * FROM integration_events WHERE provider_lead_id = 'L3'`);
        expect(e?.status).toBe("error");
        return e;
      },
      { timeout: 15000, interval: 300 },
    );
    expect(event.error_message).toContain("Unsupported get request");

    fbLeads.set("L3", fbLead("L3", { full_name: "Late Lead", email: "late@example.com" }));
    ok(await doctor.post(`/v1/integrations/${integration.id}/events/${event.id}/retry`));
    await vi.waitFor(
      async () => {
        const [e] = await query(`SELECT status, lead_id FROM integration_events WHERE id = :id`, { id: event.id });
        expect(e.status).toBe("processed");
        expect(e.lead_id).toBeTruthy();
      },
      { timeout: 15000, interval: 300 },
    );
    const log = ok(await doctor.get(`/v1/integrations/${integration.id}/events?status=processed`));
    expect(log.length).toBeGreaterThanOrEqual(2);
  });
});

describe("facebook pull sync and token status", () => {
  it("pulls only leads it hasn't seen", async () => {
    // Recent enough for the first-run 24h lookback.
    fbLeads.set("L4", fbLead("L4", { full_name: "Pulled Lead", phone_number: "9844400011" }, new Date().toISOString()));
    await pullFacebook({ integrationId: integration.id });
    const pulled = await query(`SELECT direction, status FROM integration_events WHERE provider_lead_id = 'L4'`);
    expect(pulled).toEqual([{ direction: "pull", status: "processed" }]);
    expect(await query(`SELECT 1 FROM integration_events WHERE provider_lead_id = 'L1' AND direction = 'pull'`)).toHaveLength(0);
    const [row] = await query(`SELECT last_synced_at FROM integrations WHERE id = :id`, { id: integration.id });
    expect(row.last_synced_at).not.toBeNull();
  });

  it("flags the integration for reconnect when the token is revoked", async () => {
    tokenValid = false;
    const [row] = await query(`SELECT * FROM integrations WHERE id = :id`, { id: integration.id });
    await checkFacebookToken(row);
    const status = ok(await doctor.get(`/v1/integrations/${integration.id}`));
    expect(status.status).toBe("needs_reauth");
    expect(status.last_error).toContain("Reconnect");
    tokenValid = true;
    await checkFacebookToken(row);
    expect(ok(await doctor.get(`/v1/integrations/${integration.id}`)).status).toBe("active");
  });
});

describe("custom webhook", () => {
  let hook;
  it("creates a webhook URL and turns JSON posts into leads", async () => {
    hook = ok(
      await doctor.post("/v1/integrations", {
        provider_key: "custom_webhook",
        name: "Website builder",
        default_pipeline_id: pipeline.id,
        default_stage_id: pipeline.stages[0].id,
        paths: { "$.contact.name": "full_name", "$.contact.mobile": "phone", "$.treatment": "interest" },
      }),
    );
    expect(hook.webhook_url).toMatch(/^http:\/\/api\.test\/v1\/webhooks\/custom\/.+/);
    const path = new URL(hook.webhook_url).pathname;
    const res = await app.inject({
      method: "POST",
      url: path,
      payload: { id: "W1", contact: { name: "Web Visitor", mobile: "9855500011" }, treatment: "Whitening" },
    });
    expect(res.statusCode).toBe(200);
    await vi.waitFor(
      async () => {
        const [lead] = await query(`SELECT full_name FROM leads WHERE integration_id = :id`, { id: hook.id });
        expect(lead?.full_name).toBe("Web Visitor");
      },
      { timeout: 15000, interval: 300 },
    );
  });

  it("rotating the token retires the old URL", async () => {
    const oldPath = new URL(hook.webhook_url).pathname;
    const rotated = ok(await doctor.post(`/v1/integrations/${hook.id}/rotate-token`));
    expect(rotated.webhook_url).not.toBe(hook.webhook_url);
    expect((await app.inject({ method: "POST", url: oldPath, payload: {} })).statusCode).toBe(404);
  });

  it("Google Ads webhooks need the add-on switched on", async () => {
    const res = await doctor.post("/v1/integrations", {
      provider_key: "google_ads_lead_form",
      name: "Google",
      default_pipeline_id: pipeline.id,
      default_stage_id: pipeline.stages[0].id,
      google_key: "supersecretkey",
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("housekeeping and access", () => {
  it("purges raw payloads after the retention period", async () => {
    await query(`UPDATE integration_events SET created_at = now() - interval '40 days' WHERE provider_lead_id = 'L1'`);
    await purgeIntegrationPayloads();
    const rows = await query(`SELECT payload_encrypted, payload_redacted FROM integration_events WHERE provider_lead_id = 'L1'`);
    expect(rows.every((r) => r.payload_encrypted === null && r.payload_redacted !== null)).toBe(true);
  });

  it("staff can't manage integrations; other practices can't see them", async () => {
    expect((await api(app, A.staff.token).get("/v1/integrations")).statusCode).toBe(403);
    expect((await api(app, B.doctor.token).get(`/v1/integrations/${integration.id}`)).statusCode).toBe(404);
    expect(ok(await api(app, B.doctor.token).get("/v1/integrations"))).toEqual([]);
  });

  it("disconnecting wipes the stored tokens", async () => {
    ok(await doctor.delete(`/v1/integrations/${integration.id}`));
    const [row] = await query(`SELECT status, secrets_encrypted FROM integrations WHERE id = :id`, { id: integration.id });
    expect(row).toEqual({ status: "disabled", secrets_encrypted: null });
  });
});
