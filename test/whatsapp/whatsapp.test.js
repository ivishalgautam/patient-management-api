import crypto from "crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api } from "../setup/factories.js";
import { http } from "../../app/lib/whatsapp/cloud-api.js";

let app;
let A;
let B;
let doctor;
let staff;
let pipeline;

// --- Graph API stub --------------------------------------------------------
const sent = [];
const failNext = new Map(); // phone -> Meta error code (one-shot)
let wamidSeq = 0;
let remoteTemplates = [];
function stubGraph() {
  return vi.spyOn(http, "request").mockImplementation(async ({ url, method, data, headers }) => {
    const path = new URL(url).pathname.replace(/^\/v[\d.]+\//, "");
    const fail = (code, message = "Meta error", status = 400) => {
      const error = new Error(message);
      error.response = { status, data: { error: { message, code } } };
      throw error;
    };
    if (headers.Authorization === "Bearer bad-token-xxxxxxxxxxxxxxxxxxxx") fail(190, "Invalid OAuth access token", 401);
    if (method === "GET" && /^\d+$/.test(path)) return { data: { display_phone_number: "+91 98100 00000", verified_name: "Smile Dental" } };
    if (path.endsWith("/messages")) {
      if (failNext.has(data.to)) {
        const code = failNext.get(data.to);
        failNext.delete(data.to);
        fail(code, code === 131049 ? "Message not delivered to maintain healthy ecosystem engagement" : "Recipient not on WhatsApp");
      }
      sent.push(data);
      return { data: { messages: [{ id: `wamid.${++wamidSeq}` }] } };
    }
    if (path.endsWith("/message_templates") && method === "POST") return { data: { id: `tmpl-${data.name}`, status: "PENDING", category: data.category } };
    if (path.endsWith("/message_templates") && method === "GET") return { data: { data: remoteTemplates } };
    fail(100, `Unsupported ${method} ${path}`);
  });
}

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(400);
  return res.json().data;
};
const signed = (payload, secret = "test-wa-secret") => {
  const body = JSON.stringify(payload);
  return app.inject({
    method: "POST",
    url: "/v1/webhooks/whatsapp",
    payload: body,
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`,
    },
  });
};
const PHONE_ID = "1112223334445";
const inbound = (from, text, { id = `wamid.in.${crypto.randomUUID()}`, name = "Ravi Kumar", phoneId = PHONE_ID } = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: phoneId },
            contacts: [{ wa_id: from, profile: { name } }],
            messages: [{ id, from, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
          },
        },
      ],
    },
  ],
});
const statusEvent = (wamid, status, errors) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA1", changes: [{ field: "messages", value: { metadata: { phone_number_id: PHONE_ID }, statuses: [{ id: wamid, status, ...(errors ? { errors } : {}) }] } }] }],
});

beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  A = await setupPractice(app);
  B = await setupPractice(app);
  doctor = api(app, A.doctor.token);
  staff = api(app, A.staff.token);
  [pipeline] = ok(await doctor.get("/v1/pipelines"));
  stubGraph();
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app.close();
});

describe("settings", () => {
  it("only managers connect a number; bad credentials are refused", async () => {
    const input = { phone_number_id: PHONE_ID, waba_id: "998877665544", access_token: "good-token-xxxxxxxxxxxxxxxxxxxx" };
    expect((await staff.put("/v1/whatsapp/settings", input)).statusCode).toBe(403);
    const bad = await doctor.put("/v1/whatsapp/settings", { ...input, access_token: "bad-token-xxxxxxxxxxxxxxxxxxxx" });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).toContain("Invalid OAuth access token");
    expect(await query(`SELECT 1 FROM whatsapp_accounts`)).toHaveLength(0);
  });

  it("connects with the token encrypted and never returned", async () => {
    const settings = ok(
      await doctor.put("/v1/whatsapp/settings", {
        phone_number_id: PHONE_ID,
        waba_id: "998877665544",
        access_token: "good-token-xxxxxxxxxxxxxxxxxxxx",
        default_pipeline_id: pipeline.id,
        default_stage_id: pipeline.stages[0].id,
      }),
    );
    expect(settings.account).toMatchObject({ display_phone_number: "+91 98100 00000", verified_name: "Smile Dental", has_access_token: true });
    expect(settings.webhook_url).toBe("http://api.test/v1/webhooks/whatsapp");
    expect(JSON.stringify(settings)).not.toContain("good-token");
    const [row] = await query(`SELECT access_token_encrypted FROM whatsapp_accounts`);
    expect(row.access_token_encrypted).not.toContain("good-token");
    // Saving again without a token keeps the stored one.
    ok(await doctor.put("/v1/whatsapp/settings", { phone_number_id: PHONE_ID, waba_id: "998877665544", create_leads_from_inbound: true, default_pipeline_id: pipeline.id, default_stage_id: pipeline.stages[0].id }));
  });

  it("a number can belong to one practice only", async () => {
    const res = await api(app, B.doctor.token).put("/v1/whatsapp/settings", {
      phone_number_id: PHONE_ID,
      waba_id: "1",
      access_token: "good-token-xxxxxxxxxxxxxxxxxxxx",
    });
    expect([400, 409]).toContain(res.statusCode);
  });
});

describe("templates", () => {
  it("submits a template to Meta as pending", async () => {
    const t = ok(
      await doctor.post("/v1/whatsapp/templates", {
        name: "implant_offer",
        category: "MARKETING",
        language: "en_US",
        components: [{ type: "BODY", text: "Hi {{1}}, implants are 20% off this month.", example: { body_text: [["Asha"]] } }],
      }),
    );
    expect(t).toMatchObject({ status: "PENDING", meta_template_id: "tmpl-implant_offer", category: "MARKETING" });
    expect((await doctor.post("/v1/whatsapp/templates", { name: "Bad Name", category: "MARKETING", components: [{ type: "BODY", text: "x" }] })).statusCode).toBe(400);
  });

  it("syncs templates and their review status from Meta", async () => {
    remoteTemplates = [
      { id: "tmpl-implant_offer", name: "implant_offer", category: "MARKETING", language: "en_US", status: "APPROVED", components: [{ type: "BODY", text: "Hi {{1}}, implants are 20% off this month." }] },
      { id: "tmpl-recall", name: "recall_reminder", category: "UTILITY", language: "en_US", status: "APPROVED", components: [{ type: "BODY", text: "Time for your dental check-up." }] },
      { id: "tmpl-rej", name: "rejected_one", category: "MARKETING", language: "en_US", status: "REJECTED", rejected_reason: "INVALID_FORMAT", components: [{ type: "BODY", text: "x" }] },
    ];
    expect(ok(await doctor.post("/v1/whatsapp/templates/sync")).synced).toBe(3);
    const approved = ok(await doctor.get("/v1/whatsapp/templates?status=APPROVED"));
    expect(approved.map((t) => t.name).sort()).toEqual(["implant_offer", "recall_reminder"]);
    const [rej] = ok(await doctor.get("/v1/whatsapp/templates?status=REJECTED"));
    expect(rej.rejection_reason).toBe("INVALID_FORMAT");
  });

  it("deletes and restores locally", async () => {
    const [rej] = ok(await doctor.get("/v1/whatsapp/templates?status=REJECTED"));
    ok(await doctor.delete(`/v1/whatsapp/templates/${rej.id}`));
    expect(ok(await doctor.get("/v1/whatsapp/templates?deleted=true")).map((t) => t.id)).toContain(rej.id);
    ok(await doctor.post(`/v1/whatsapp/templates/${rej.id}/restore`));
    expect(ok(await doctor.get("/v1/whatsapp/templates?deleted=true"))).toEqual([]);
  });
});

describe("webhook", () => {
  it("answers Meta's verification handshake", async () => {
    const good = await app.inject({ url: "/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-wa-verify&hub.challenge=42" });
    expect(good.statusCode).toBe(200);
    expect(good.body).toBe("42");
    expect((await app.inject({ url: "/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42" })).statusCode).toBe(403);
  });

  it("rejects unsigned or wrongly signed deliveries", async () => {
    const unsigned = await app.inject({ method: "POST", url: "/v1/webhooks/whatsapp", payload: inbound("919811100001", "hello") });
    expect(unsigned.statusCode).toBe(401);
    expect((await signed(inbound("919811100001", "hello"), "wrong-secret")).statusCode).toBe(401);
    expect(await query(`SELECT 1 FROM whatsapp_messages`)).toHaveLength(0);
  });

  it("a message from a new number creates a WhatsApp lead and an unread conversation", async () => {
    const delivery = inbound("919811100001", "Do you do braces?", { id: "wamid.in.1" });
    expect((await signed(delivery)).statusCode).toBe(200);
    const [lead] = await query(`SELECT full_name, source, phone_normalized, pipeline_id FROM leads WHERE phone_normalized = '+919811100001'`);
    expect(lead).toMatchObject({ full_name: "Ravi Kumar", source: "WhatsApp", pipeline_id: pipeline.id });
    const [conversation] = ok(await doctor.get("/v1/whatsapp/conversations"));
    expect(conversation).toMatchObject({ phone: "919811100001", lead_name: "Ravi Kumar", unread_count: 1, within_window: true });
    expect(conversation.last_message_preview).toBe("Do you do braces?");

    // Meta redelivers: nothing doubles.
    expect((await signed(delivery)).statusCode).toBe(200);
    expect(await query(`SELECT 1 FROM whatsapp_messages WHERE wamid = 'wamid.in.1'`)).toHaveLength(1);
    expect(await query(`SELECT 1 FROM leads WHERE phone_normalized = '+919811100001'`)).toHaveLength(1);
  });

  it("a message from an existing lead's number joins that lead", async () => {
    const lead = ok(await doctor.post("/v1/leads", { full_name: "Existing Patient Lead", phone: "9811100002", force: true }));
    ok(await signed(inbound("919811100002", "Hi, it's me again", { name: "Someone" })));
    const [conversation] = await query(`SELECT lead_id FROM whatsapp_conversations WHERE phone = '919811100002'`);
    expect(conversation.lead_id).toBe(lead.id);
    expect(await query(`SELECT 1 FROM leads WHERE phone_normalized = '+919811100002'`)).toHaveLength(1);
  });

  it("ignores numbers that aren't connected", async () => {
    expect((await signed(inbound("919811100009", "hello", { phoneId: "000" }))).statusCode).toBe(200);
    expect(await query(`SELECT 1 FROM whatsapp_conversations WHERE phone = '919811100009'`)).toHaveLength(0);
  });

  it("updates template review status", async () => {
    const before = ok(await doctor.get("/v1/whatsapp/templates?status=REJECTED"));
    expect(before).toHaveLength(1);
    ok(
      await signed({
        entry: [{ id: "998877665544", changes: [{ field: "message_template_status_update", value: { event: "APPROVED", message_template_id: "tmpl-rej", reason: "NONE" } }] }],
      }),
    );
    expect(ok(await doctor.get("/v1/whatsapp/templates?status=REJECTED"))).toHaveLength(0);
  });
});

describe("inbox", () => {
  let conversation;
  let approved;

  beforeAll(async () => {
    [conversation] = ok(await doctor.get("/v1/whatsapp/conversations?q=ravi"));
    approved = ok(await doctor.get("/v1/whatsapp/templates?status=APPROVED")).find((t) => t.name === "implant_offer");
  });

  it("opening a thread marks it read", async () => {
    const messages = ok(await staff.get(`/v1/whatsapp/conversations/${conversation.id}/messages`));
    expect(messages.map((m) => [m.direction, m.body])).toEqual([["in", "Do you do braces?"]]);
    expect(ok(await doctor.get(`/v1/whatsapp/conversations/${conversation.id}`)).unread_count).toBe(0);
    ok(await staff.patch(`/v1/whatsapp/conversations/${conversation.id}/unread`));
    expect(ok(await doctor.get(`/v1/whatsapp/conversations/${conversation.id}`)).unread_count).toBe(1);
  });

  it("free text inside the 24-hour window", async () => {
    const message = ok(await staff.post(`/v1/whatsapp/conversations/${conversation.id}/messages`, { text: "Yes! Aligners and braces." }));
    expect(message).toMatchObject({ direction: "out", type: "text", status: "sent" });
    expect(sent.at(-1)).toMatchObject({ to: "919811100001", type: "text", text: { body: "Yes! Aligners and braces." } });
  });

  it("outside the window only an approved template can be sent", async () => {
    await query(`UPDATE whatsapp_conversations SET last_customer_message_at = now() - interval '2 days' WHERE id = :id`, { id: conversation.id });
    const text = await staff.post(`/v1/whatsapp/conversations/${conversation.id}/messages`, { text: "Hello again" });
    expect(text.statusCode).toBe(400);
    expect(text.json().code).toBe("WHATSAPP_WINDOW_CLOSED");
    const [pending] = ok(await doctor.get("/v1/whatsapp/templates?status=PENDING"));
    if (pending) expect((await staff.post(`/v1/whatsapp/conversations/${conversation.id}/messages`, { template_id: pending.id })).statusCode).toBe(400);

    const message = ok(await staff.post(`/v1/whatsapp/conversations/${conversation.id}/messages`, { template_id: approved.id, variables: { body: ["Ravi"] } }));
    expect(message).toMatchObject({ type: "template", template_name: "implant_offer", body: "Hi Ravi, implants are 20% off this month." });
    expect(sent.at(-1).template).toMatchObject({ name: "implant_offer", components: [{ type: "body", parameters: [{ type: "text", text: "Ravi" }] }] });
  });

  it("starts a conversation with a lead from a template", async () => {
    const lead = ok(await doctor.post("/v1/leads", { full_name: "Neha Template", phone: "9811100003", force: true }));
    const { conversation: started } = ok(await staff.post("/v1/whatsapp/conversations/start", { lead_id: lead.id, template_id: approved.id, variables: { body: ["Neha"] } }));
    expect(started).toMatchObject({ phone: "919811100003", lead_id: lead.id, within_window: false });
    expect(ok(await staff.get(`/v1/whatsapp/leads/${lead.id}/conversation`)).id).toBe(started.id);
  });

  it("delivery and read receipts only move forward", async () => {
    const [last] = await query(`SELECT wamid FROM whatsapp_messages WHERE direction = 'out' ORDER BY created_at DESC LIMIT 1`);
    ok(await signed(statusEvent(last.wamid, "read")));
    ok(await signed(statusEvent(last.wamid, "delivered")));
    const [row] = await query(`SELECT status FROM whatsapp_messages WHERE wamid = :w`, { w: last.wamid });
    expect(row.status).toBe("read");
  });

  it("is practice-scoped; staff can't delete chats", async () => {
    expect((await api(app, B.doctor.token).get(`/v1/whatsapp/conversations/${conversation.id}`)).statusCode).toBe(404);
    expect(ok(await api(app, B.doctor.token).get("/v1/whatsapp/conversations"))).toEqual([]);
    expect((await staff.delete(`/v1/whatsapp/conversations/${conversation.id}`)).statusCode).toBe(403);
  });
});

describe("campaigns", () => {
  let template;
  let campaign;

  beforeAll(async () => {
    template = ok(await doctor.get("/v1/whatsapp/templates?status=APPROVED")).find((t) => t.name === "implant_offer");
    // Audience: open leads with phones in the default pipeline.
    ok(await doctor.post("/v1/leads", { full_name: "Campaign Limited", phone: "9811100004", force: true }));
    ok(await doctor.post("/v1/leads", { full_name: "No Phone", email: "nophone@example.com", force: true }));
  });

  it("is for managers and checks the variable mapping", async () => {
    expect((await staff.get("/v1/whatsapp/campaigns")).statusCode).toBe(403);
    const missing = await doctor.post("/v1/whatsapp/campaigns", { name: "Offer", template_id: template.id, audience_filter: { pipeline_id: pipeline.id } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().message).toContain("1 variable");
  });

  it("collects one recipient per phone from the pipeline", async () => {
    campaign = ok(
      await doctor.post("/v1/whatsapp/campaigns", {
        name: "Implant month",
        template_id: template.id,
        audience_filter: { pipeline_id: pipeline.id },
        variable_mapping: [{ source: "recipient_name" }],
      }),
    );
    const leadsWithPhones = await query(
      `SELECT count(DISTINCT phone_normalized)::int AS n FROM leads WHERE practice_id = (SELECT practice_id FROM pipelines WHERE id = :p) AND pipeline_id = :p AND phone_normalized IS NOT NULL AND status = 'open' AND deleted_at IS NULL`,
      { p: pipeline.id },
    );
    expect(campaign.total_recipients).toBe(leadsWithPhones[0].n);
    expect(campaign.total_recipients).toBeGreaterThanOrEqual(4);
  });

  it("sends in the background and counts results", async () => {
    failNext.set("919811100004", 131049);
    const started = ok(await doctor.post(`/v1/whatsapp/campaigns/${campaign.id}/start`));
    expect(started.status).toBe("SENDING");
    await vi.waitFor(async () => expect(ok(await doctor.get(`/v1/whatsapp/campaigns/${campaign.id}`)).status).toBe("COMPLETED"), { timeout: 15000, interval: 300 });
    const detail = ok(await doctor.get(`/v1/whatsapp/campaigns/${campaign.id}`));
    expect(detail.sent_count).toBe(campaign.total_recipients - 1);
    expect(detail.failed_count).toBe(1);
    expect(detail.limited_by_meta_count).toBe(1);
    const ravi = detail.recipients.find((r) => r.phone === "919811100001");
    expect(sent.find((m) => m.to === "919811100001" && m.template?.components?.[0]?.parameters?.[0]?.text === "Ravi Kumar")).toBeTruthy();
    expect(ravi.status).toBe("sent");
    expect((await doctor.post(`/v1/whatsapp/campaigns/${campaign.id}/start`)).statusCode).toBe(409);
  });

  it("tracks delivered, read and replied", async () => {
    const [r] = await query(`SELECT wamid FROM whatsapp_campaign_recipients WHERE campaign_id = :id AND phone = '919811100001'`, { id: campaign.id });
    ok(await signed(statusEvent(r.wamid, "delivered")));
    ok(await signed(statusEvent(r.wamid, "read")));
    ok(await signed(statusEvent(r.wamid, "read")));
    ok(await signed(inbound("919811100001", "Interested!")));
    const detail = ok(await doctor.get(`/v1/whatsapp/campaigns/${campaign.id}`));
    expect(detail).toMatchObject({ delivered_count: 1, read_count: 1, replied_count: 1 });
    expect(detail.recipients.find((x) => x.phone === "919811100001").status).toBe("replied");
  });

  it("retries failures", async () => {
    const res = ok(await doctor.post(`/v1/whatsapp/campaigns/${campaign.id}/retry`));
    expect(res.retrying).toBe(1);
    await vi.waitFor(async () => expect(ok(await doctor.get(`/v1/whatsapp/campaigns/${campaign.id}`)).status).toBe("COMPLETED"), { timeout: 15000, interval: 300 });
    const detail = ok(await doctor.get(`/v1/whatsapp/campaigns/${campaign.id}`));
    expect(detail).toMatchObject({ failed_count: 0, sent_count: campaign.total_recipients });
    expect((await doctor.post(`/v1/whatsapp/campaigns/${campaign.id}/retry`)).statusCode).toBe(400);
  });

  it("other practices can't see it", async () => {
    expect((await api(app, B.doctor.token).get(`/v1/whatsapp/campaigns/${campaign.id}`)).statusCode).toBe(404);
  });
});
