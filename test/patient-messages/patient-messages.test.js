import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, createPatient } from "../setup/factories.js";
import { http } from "../../app/lib/whatsapp/cloud-api.js";
import { mailer } from "../../app/lib/mailer.js";
import { clinicToday } from "../../app/lib/booking-rules.js";
import { fillPlaceholders } from "../../app/api/patient-messages/service.js";

let app;
let A;
let B;
let doctor;
let today;
let template;
const whatsappSent = [];
const emailsSent = [];
const failEmailTo = new Set();

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(400);
  return res.json().data;
};
const monthsAgo = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};

async function patient(name, mobile, { email = null, dob = null } = {}) {
  const p = await createPatient(app, A.doctor.token, { fullname: name, mobile_number: mobile });
  await query(`UPDATE users SET email = :email, dob = :dob WHERE id = :id`, { id: p.user.id, email, dob });
  return p;
}
async function visit(p, date, status = "completed") {
  await query(
    `INSERT INTO bookings (id, practice_id, doctor_id, patient_id, clinic_id, date, slot, status, created_at, updated_at)
     SELECT gen_random_uuid(), c.practice_id, c.doctor_id, :patientId, c.id, :date, '09:00', :status, now(), now() FROM clinics c WHERE c.id = :clinicId`,
    { patientId: p.id, clinicId: A.clinic.id, date, status },
  );
}
const waitForDelivery = () =>
  vi.waitFor(async () => {
    const [{ n }] = await query(`SELECT count(*)::int AS n FROM patient_messages WHERE status = 'pending'`);
    expect(n).toBe(0);
  }, { timeout: 15000, interval: 200 });

beforeAll(async () => {
  await resetDb();
  app = await buildTestApp();
  A = await setupPractice(app);
  B = await setupPractice(app);
  doctor = api(app, A.doctor.token);
  today = await clinicToday();

  vi.spyOn(http, "request").mockImplementation(async ({ url, method, data }) => {
    const path = new URL(url).pathname.replace(/^\/v[\d.]+\//, "");
    if (method === "GET" && /^\d+$/.test(path)) return { data: { display_phone_number: "+91 98100 00000", verified_name: "Smile Dental" } };
    if (path.endsWith("/messages")) {
      whatsappSent.push(data);
      return { data: { messages: [{ id: `wamid.pm.${whatsappSent.length}` }] } };
    }
    throw new Error(`unexpected ${method} ${path}`);
  });
  vi.spyOn(mailer, "send").mockImplementation(async (mail) => {
    if (failEmailTo.has(mail.to)) throw new Error("Mailbox unavailable");
    emailsSent.push(mail);
  });

  ok(await doctor.put("/v1/whatsapp/settings", { phone_number_id: "5556667778889", waba_id: "998877665544", access_token: "good-token-xxxxxxxxxxxxxxxx" }));
  [template] = await query(
    `INSERT INTO whatsapp_templates (practice_id, name, language, category, status, components)
     SELECT practice_id, 'checkup_recall', 'en_US', 'UTILITY', 'APPROVED', :components::jsonb FROM clinics WHERE id = :clinicId RETURNING id`,
    { clinicId: A.clinic.id, components: JSON.stringify([{ type: "BODY", text: "Hi {{1}}, it's time for your check-up at {{2}}." }]) },
  );
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});

it("fills email placeholders and leaves unknown ones", () => {
  expect(fillPlaceholders("Hi {{first_name}} from {{clinic}} {{x}}", { first_name: "Asha", clinic: "Smile" })).toBe("Hi Asha from Smile {{x}}");
});

describe("settings", () => {
  it("starts with sensible defaults, doctor only", async () => {
    const s = ok(await doctor.get("/v1/patient-messages/settings"));
    expect(s.rules.recall).toMatchObject({ is_active: false, recall_months: 6 });
    expect(s.rules.birthday.email_subject).toContain("birthday");
    expect(s).toMatchObject({ email_configured: true, whatsapp: { connected: true, active: true } });
    expect((await api(app, A.staff.token).get("/v1/patient-messages/settings")).statusCode).toBe(403);
  });

  it("validates the template variables and needs a channel to switch on", async () => {
    const bad = await doctor.put("/v1/patient-messages/settings/recall", { is_active: true, whatsapp_template_id: template.id, variable_mapping: [{ source: "recipient_name" }] });
    expect(bad.statusCode).toBe(400);
    const none = await doctor.put("/v1/patient-messages/settings/recall", { is_active: true, email_subject: null, email_body: null });
    expect(none.statusCode).toBe(400);
    const rule = ok(
      await doctor.put("/v1/patient-messages/settings/recall", {
        is_active: true,
        recall_months: 6,
        whatsapp_template_id: template.id,
        variable_mapping: [{ source: "recipient_name" }, { source: "static", value: "Smile Clinic" }],
        email_subject: "Check-up time, {{first_name}}",
        email_body: "Hi {{first_name}}, it's been {{months}} months.",
      }),
    );
    expect(rule).toMatchObject({ is_active: true, template_name: "checkup_recall" });
    ok(await doctor.put("/v1/patient-messages/settings/birthday", { is_active: true, email_subject: "Happy birthday {{first_name}}", email_body: "Best wishes from {{clinic}}" }));
  });
});

describe("recall and birthday", () => {
  let due;
  it("finds patients due for recall and with a birthday today", async () => {
    due = await patient("ravi kumar", "9811100001", { email: "ravi@example.com" });
    await visit(due, monthsAgo(today, 6));
    const booked = await patient("Meena", "9811100002");
    await visit(booked, monthsAgo(today, 6));
    await visit(booked, today, "pending"); // already booked again: no reminder
    const recent = await patient("Sunil", "9811100003");
    await visit(recent, monthsAgo(today, 2));
    await patient("Kiran", "9811100004", { email: "kiran@example.com", dob: `${Number(today.slice(0, 4)) - 30}${today.slice(4)}` });
    await patient("Baby", "9811100005", { email: "baby@example.com", dob: today }); // a registration date typed as DOB

    const recall = ok(await doctor.get("/v1/patient-messages/settings/recall/preview"));
    expect(recall).toMatchObject({ count: 1, with_email: 1 });
    expect(recall.patients[0].name).toBe("ravi kumar");
    const birthday = ok(await doctor.get("/v1/patient-messages/settings/birthday/preview"));
    expect(birthday.patients.map((p) => p.name)).toEqual(["Kiran"]);
  });

  it("sends once by WhatsApp and email, never twice", async () => {
    const run = ok(await doctor.post("/v1/patient-messages/run-now"));
    expect(run.queued).toBe(3); // recall WhatsApp + recall email + birthday email
    await waitForDelivery();
    expect(whatsappSent).toHaveLength(1);
    expect(whatsappSent[0].template.components[0].parameters.map((p) => p.text)).toEqual(["Ravi", "Smile Clinic"]);
    expect(emailsSent.map((m) => m.subject).sort()).toEqual(["Check-up time, Ravi", "Happy birthday Kiran"]);
    expect(emailsSent.find((m) => m.to === "ravi@example.com").text).toBe("Hi Ravi, it's been 6 months.");
    expect(ok(await doctor.post("/v1/patient-messages/run-now")).queued).toBe(0);

    const log = await doctor.get("/v1/patient-messages/messages?kind=recall");
    expect(log.json().meta.total).toBe(2);
    expect(log.json().data.every((m) => m.status === "sent")).toBe(true);
    // the WhatsApp message shows in the inbox
    const [conv] = await query(`SELECT last_message_preview FROM whatsapp_conversations WHERE phone = '919811100001'`);
    expect(conv.last_message_preview).toContain("Hi Ravi");
  });
});

describe("bulk messages", () => {
  let broadcast;
  it("counts the audience and sends a broadcast", async () => {
    // booked or treated at the clinic
    expect(ok(await doctor.post("/v1/patient-messages/audience", { clinic_id: A.clinic.id }))).toMatchObject({ count: 3, with_email: 1 });
    // last visit in the past 3 months
    expect(ok(await doctor.post("/v1/patient-messages/audience", { last_visit_from: monthsAgo(today, 3) })).count).toBe(1);
    const count = ok(await doctor.post("/v1/patient-messages/audience", {}));
    expect(count.count).toBeGreaterThanOrEqual(6);
    expect(count.with_email).toBe(3);

    failEmailTo.add("kiran@example.com");
    broadcast = ok(
      await doctor.post("/v1/patient-messages/broadcasts", {
        name: "Diwali timings",
        audience: {},
        email_subject: "Diwali timings",
        email_body: "Dear {{first_name}}, we're closed on Diwali.",
      }),
    );
    expect(broadcast.status).toBe("draft");
    ok(await doctor.post(`/v1/patient-messages/broadcasts/${broadcast.id}/start`));
    await waitForDelivery();
    const done = ok(await doctor.get(`/v1/patient-messages/broadcasts/${broadcast.id}`));
    expect(done).toMatchObject({ status: "completed", total: 3, sent: 2, failed: 1 });
    expect((await doctor.post(`/v1/patient-messages/broadcasts/${broadcast.id}/start`)).statusCode).toBe(409);
  });

  it("retries failures", async () => {
    failEmailTo.clear();
    expect(ok(await doctor.post("/v1/patient-messages/messages/retry", { broadcast_id: broadcast.id })).retried).toBe(1);
    await waitForDelivery();
    expect(ok(await doctor.get(`/v1/patient-messages/broadcasts/${broadcast.id}`))).toMatchObject({ status: "completed", sent: 3, failed: 0 });
  });

  it("keeps practices apart", async () => {
    const other = api(app, B.doctor.token);
    expect((await other.get(`/v1/patient-messages/broadcasts/${broadcast.id}`)).statusCode).toBe(404);
    expect(ok(await other.get("/v1/patient-messages/broadcasts"))).toHaveLength(0);
    expect((await other.put("/v1/patient-messages/settings/recall", { is_active: false, whatsapp_template_id: template.id })).statusCode).toBe(404);
  });
});
