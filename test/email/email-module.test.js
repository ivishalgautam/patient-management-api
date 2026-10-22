import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api } from "../setup/factories.js";
import { imap, smtp } from "../../app/lib/email/transport.js";
import { compileBlocksToHtml, fill } from "../../app/lib/email/blocks.js";
import { dispatchScheduled } from "../../app/api/email/campaigns.service.js";

let app;
let A;
let B;
let doctor;
let staff;
let account;
let template;
let pipeline;
const sent = [];
const failTo = new Set();
let inbox = []; // { uid, source }
let msgSeq = 0;

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(400);
  return res.json().data;
};
const waitFor = (fn) => vi.waitFor(fn, { timeout: 15000, interval: 200 });
const waitSent = () =>
  waitFor(async () => {
    const [{ n }] = await query(`SELECT count(*)::int AS n FROM email_messages WHERE status = 'queued'`);
    expect(n).toBe(0);
  });
const rfc822 = ({ from, to, subject, body, messageId, inReplyTo }) =>
  [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    `Date: ${new Date().toUTCString()}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

beforeAll(async () => {
  await resetDb();
  app = await buildTestApp();
  A = await setupPractice(app);
  B = await setupPractice(app);
  doctor = api(app, A.doctor.token);
  staff = api(app, A.staff.token);
  [pipeline] = ok(await doctor.get("/v1/pipelines"));

  vi.spyOn(smtp, "createTransport").mockImplementation((options) => ({
    verify: async () => {
      if (options.auth.pass === "wrong") throw Object.assign(new Error("Invalid login"), { responseCode: 535 });
      return true;
    },
    sendMail: async (mail) => {
      const to = [].concat(mail.to)[0];
      if (failTo.has(to)) throw Object.assign(new Error("Recipient rejected"), { responseCode: 550 });
      const messageId = `<out-${++msgSeq}@clinic.test>`;
      sent.push({ options, mail, messageId });
      return { messageId };
    },
  }));
  vi.spyOn(imap, "connect").mockImplementation(async (options) => {
    if (options.auth.pass === "wrong") throw Object.assign(new Error("Auth failed"), { authenticationFailed: true });
    return {
      mailbox: { uidValidity: 7 },
      getMailboxLock: async () => ({ release: () => {} }),
      async *fetch(range) {
        const from = range.uid ? Number(String(range.uid).split(":")[0]) : 0;
        for (const m of inbox.filter((x) => x.uid >= from)) yield { uid: m.uid, source: Buffer.from(m.source) };
      },
      logout: async () => {},
    };
  });
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});

describe("blocks", () => {
  it("compiles blocks to safe HTML and fills variables escaped", () => {
    const html = compileBlocksToHtml([
      { id: "1", type: "paragraph", text: "<b>Hi</b> {{first_name}}" },
      { id: "2", type: "button", text: "Go", url: "javascript:alert(1)" },
    ]);
    expect(html).toContain("&lt;b&gt;Hi&lt;/b&gt; {{first_name}}");
    expect(html).not.toContain("javascript:");
    expect(fill(html, { first_name: "<Asha>" }, { html: true })).toContain("&lt;Asha&gt;");
  });
});

describe("accounts and settings", () => {
  const input = {
    provider: "gmail",
    email_address: "smile.clinic@gmail.com",
    display_name: "Smile Dental",
    smtp_host: "smtp.gmail.com",
    smtp_port: 465,
    smtp_secure: true,
    imap_host: "imap.gmail.com",
    imap_port: 993,
    imap_secure: true,
    password: "app-pass",
  };

  it("checks SMTP and IMAP logins before saving", async () => {
    const bad = await doctor.post("/v1/email/accounts", { ...input, password: "wrong" });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ code: "EMAIL_AUTH_FAILED" });
    account = ok(await doctor.post("/v1/email/accounts", input));
    expect(account).toMatchObject({ is_default: true, status: "connected", has_password: true });
    expect(JSON.stringify(account)).not.toContain("app-pass");
    expect((await doctor.post("/v1/email/accounts", input)).statusCode).toBe(409);
  });

  it("supports several accounts, a default and staff read-only access", async () => {
    const second = ok(await doctor.post("/v1/email/accounts", { ...input, email_address: "billing@smile.test", imap_host: null, imap_port: null }));
    expect(second.is_default).toBe(false);
    ok(await doctor.post(`/v1/email/accounts/${second.id}/default`));
    expect(ok(await doctor.get("/v1/email/accounts")).find((a) => a.is_default).id).toBe(second.id);
    ok(await doctor.post(`/v1/email/accounts/${account.id}/default`));
    ok(await doctor.post(`/v1/email/accounts/${account.id}/test`));
    expect(ok(await staff.get("/v1/email/accounts"))).toHaveLength(2);
    expect((await staff.post("/v1/email/accounts", { ...input, email_address: "x@y.test" })).statusCode).toBe(403);
    ok(await doctor.delete(`/v1/email/accounts/${second.id}`));
  });

  it("saves module settings and can switch email off", async () => {
    ok(await doctor.put("/v1/email/settings", { is_enabled: false, default_from_name: "Smile Clinic", signature: "Smile Dental, MG Road" }));
    const res = await staff.get("/v1/email/messages");
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("EMAIL_DISABLED");
    ok(await doctor.put("/v1/email/settings", { is_enabled: true, default_from_name: "Smile Clinic", signature: "Smile Dental, MG Road" }));
  });
});

describe("templates", () => {
  it("builds from blocks, previews with a lead and rejects scripts", async () => {
    template = ok(
      await doctor.post("/v1/email/templates", {
        name: "Welcome",
        subject: "Welcome to {{clinic}}, {{first_name}}",
        category: "welcome",
        content_blocks: [
          { id: "1", type: "title", text: "Hi {{first_name}}" },
          { id: "2", type: "paragraph", text: "Thanks for contacting us about {{pipeline}}." },
          { id: "3", type: "button", text: "Book now", url: "https://smile.test/book" },
        ],
      }),
    );
    expect(template.body_html).toContain("https://smile.test/book");
    expect(template.body_text).toContain("Book now: https://smile.test/book");
    const lead = ok(await doctor.post("/v1/leads", { full_name: "ravi kumar", phone: "9811100009", source: "Walk-in" }));
    const preview = ok(await doctor.get(`/v1/email/templates/${template.id}/preview?lead_id=${lead.id}`));
    expect(preview.subject).toMatch(/^Welcome to .+, Ravi$/);
    expect((await doctor.post("/v1/email/templates", { name: "X", subject: "Y", builder_type: "html", body_html: "<script>x</script>" })).statusCode).toBe(400);
    expect(ok(await doctor.post(`/v1/email/templates/${template.id}/duplicate`)).name).toBe("Welcome (copy)");
  });
});

describe("mailbox", () => {
  let lead;
  let outgoing;

  it("sends a composed email linked to the lead, with the signature", async () => {
    lead = ok(await doctor.post("/v1/leads", { full_name: "Meena Shah", phone: "9811100010", email: "meena@example.com", source: "Website" }));
    outgoing = ok(await staff.post("/v1/email/messages", { to: ["meena@example.com"], subject: "Your visit, {{first_name}}", body_text: "See you on Monday." }));
    expect(outgoing).toMatchObject({ status: "queued", lead_id: lead.id, subject: "Your visit, Meena" });
    await waitSent();
    const last = sent.at(-1);
    expect(last.mail.from).toBe('"Smile Dental" <smile.clinic@gmail.com>');
    expect(last.mail.text).toContain("Smile Dental, MG Road");
    const list = await staff.get(`/v1/email/messages?folder=sent&lead_id=${lead.id}`);
    expect(list.json().data[0]).toMatchObject({ status: "sent" });
  });

  it("records failures and retries them", async () => {
    failTo.add("bounce@example.com");
    const m = ok(await staff.post("/v1/email/messages", { to: ["bounce@example.com"], template_id: template.id }));
    await waitSent();
    const failed = await staff.get("/v1/email/messages?folder=failed");
    expect(failed.json().data.map((x) => x.id)).toContain(m.id);
    failTo.clear();
    ok(await staff.post(`/v1/email/messages/${m.id}/retry`));
    await waitSent();
    expect(ok(await staff.get(`/v1/email/messages/${m.id}`)).status).toBe("sent");
  });

  it("syncs replies into the same thread and links them to the lead", async () => {
    const [{ provider_message_id: sentId }] = await query(`SELECT provider_message_id FROM email_messages WHERE id = :id`, { id: outgoing.id });
    inbox = [
      { uid: 1, source: rfc822({ from: "Meena Shah <meena@example.com>", to: "smile.clinic@gmail.com", subject: "Re: Your visit, Meena", body: "Monday works!", messageId: "<in-1@mail.test>", inReplyTo: sentId }) },
      { uid: 2, source: rfc822({ from: "new.person@example.com", to: "smile.clinic@gmail.com", subject: "Braces cost?", body: "How much are braces?", messageId: "<in-2@mail.test>" }) },
    ];
    expect(ok(await staff.post("/v1/email/accounts/sync", {})).fetched).toBe(2);
    expect(ok(await staff.post("/v1/email/accounts/sync", {})).fetched).toBe(0); // nothing new since uid 2
    const res = await staff.get("/v1/email/messages?folder=inbox");
    expect(res.json().meta.counts.unread).toBe(2);
    const reply = res.json().data.find((m) => m.subject.startsWith("Re:"));
    expect(reply).toMatchObject({ lead_id: lead.id, thread_id: outgoing.thread_id, is_read: false });
    const opened = ok(await staff.get(`/v1/email/messages/${reply.id}`));
    expect(opened.thread.map((m) => m.direction)).toEqual(["outbound", "inbound"]);
    expect(opened.is_read).toBe(true);
  });

  it("replies in the thread with In-Reply-To", async () => {
    const [inbound] = await query(`SELECT id FROM email_messages WHERE provider_message_id = '<in-2@mail.test>'`);
    ok(await staff.post(`/v1/email/messages/${inbound.id}/reply`, { body_text: "Braces start at ₹35,000." }));
    await waitSent();
    expect(sent.at(-1).mail).toMatchObject({ subject: "Re: Braces cost?", inReplyTo: "<in-2@mail.test>", to: ["new.person@example.com"] });
  });

  it("moves to trash and deletes for good from there", async () => {
    const [inbound] = await query(`SELECT id FROM email_messages WHERE provider_message_id = '<in-2@mail.test>'`);
    ok(await staff.delete(`/v1/email/messages/${inbound.id}`));
    expect(ok(await staff.get(`/v1/email/messages/${inbound.id}`)).folder).toBe("trash");
    ok(await staff.delete(`/v1/email/messages/${inbound.id}`));
    expect((await staff.get(`/v1/email/messages/${inbound.id}`)).statusCode).toBe(404);
  });
});

describe("campaigns", () => {
  it("sends to leads in a pipeline", async () => {
    const preview = ok(await doctor.post("/v1/email/campaigns/audience", { audience_type: "leads", audience: { pipeline_id: pipeline.id, status: "open" } }));
    expect(preview.count).toBe(1); // only Meena has an email
    const c = ok(await doctor.post("/v1/email/campaigns", { name: "Welcome all", template_id: template.id, audience_type: "leads", audience: { pipeline_id: pipeline.id } }));
    ok(await doctor.post(`/v1/email/campaigns/${c.id}/send-now`));
    await waitFor(async () => expect(ok(await doctor.get(`/v1/email/campaigns/${c.id}`))).toMatchObject({ status: "sent", sent: 1, failed: 0 }));
    expect(sent.at(-1).mail.subject).toMatch(/, Meena$/);
    expect((await doctor.post(`/v1/email/campaigns/${c.id}/send-now`)).statusCode).toBe(409);
  });

  it("takes an uploaded list and runs on schedule", async () => {
    const c = ok(await doctor.post("/v1/email/campaigns", { name: "Camp", template_id: template.id, audience_type: "upload" }));
    const up = ok(
      await doctor.post(`/v1/email/campaigns/${c.id}/recipients`, {
        recipients: [{ email: "a@x.test", name: "A" }, { email: "b@x.test" }, { email: "A@x.test" }, { email: "not-an-email" }],
      }),
    );
    expect(up).toMatchObject({ added: 2, invalid: 1, duplicates: 1 });
    expect((await doctor.post(`/v1/email/campaigns/${c.id}/schedule`, { scheduled_at: new Date(Date.now() - 1000).toISOString() })).statusCode).toBe(400);
    ok(await doctor.post(`/v1/email/campaigns/${c.id}/schedule`, { scheduled_at: new Date(Date.now() + 3_600_000).toISOString() }));
    await query(`UPDATE email_campaigns SET scheduled_at = now() - interval '1 minute' WHERE id = :id`, { id: c.id });
    await dispatchScheduled();
    await waitFor(async () => expect(ok(await doctor.get(`/v1/email/campaigns/${c.id}`))).toMatchObject({ status: "sent", sent: 2 }));
    expect(ok(await doctor.get(`/v1/email/campaigns/${c.id}/recipients`)).every((r) => r.status === "sent")).toBe(true);
  });
});

describe("automation", () => {
  it("emails new leads and leads reaching a stage, once per event", async () => {
    ok(await doctor.post("/v1/email/automation", { name: "Welcome", trigger_type: "lead_created", template_id: template.id }));
    const stage = pipeline.stages[1];
    ok(await doctor.post("/v1/email/automation", { name: "Booked", trigger_type: "stage_reached", stage_id: stage.id, template_id: template.id }));
    const before = sent.length;
    const lead = ok(await doctor.post("/v1/leads", { full_name: "Kiran Rao", phone: "9811100011", email: "kiran@example.com", source: "Website" }));
    await waitFor(() => expect(sent.length).toBe(before + 1));
    expect(sent.at(-1).mail.to).toEqual(["kiran@example.com"]);
    ok(await doctor.post(`/v1/leads/${lead.id}/move`, { stage_id: stage.id }));
    await waitFor(() => expect(sent.length).toBe(before + 2));
    const runs = ok(await doctor.get("/v1/email/automation/runs"));
    expect(runs.filter((r) => r.lead_id === lead.id).map((r) => r.status)).toEqual(["sent", "sent"]);
  });

  it("notes leads without an email instead of sending", async () => {
    const lead = ok(await doctor.post("/v1/leads", { full_name: "No Mail", phone: "9811100012", source: "Walk-in" }));
    await waitFor(async () => {
      const [run] = await query(`SELECT status, error_message FROM email_automation_runs WHERE lead_id = :id`, { id: lead.id });
      expect(run).toMatchObject({ status: "skipped", error_message: "The lead has no email address." });
    });
  });
});

describe("tenancy", () => {
  it("keeps practices apart", async () => {
    const other = api(app, B.doctor.token);
    const [m] = await query(`SELECT id FROM email_messages LIMIT 1`);
    expect((await other.get(`/v1/email/messages/${m.id}`)).statusCode).toBe(404);
    expect((await other.post(`/v1/email/accounts/${account.id}/test`)).statusCode).toBe(404);
    expect(ok(await other.get("/v1/email/templates"))).toHaveLength(0);
    const res = await other.post("/v1/email/messages", { to: ["x@y.test"], subject: "s", body_text: "b" });
    expect(res.json().code).toBe("EMAIL_NO_ACCOUNT");
  });
});
