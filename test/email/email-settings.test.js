import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api } from "../setup/factories.js";
import { mailer, smtp } from "../../app/lib/mailer.js";

let app;
let A;
let B;
let doctor;
const verified = [];
const sent = [];
let failSend = false;

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(400);
  return res.json().data;
};
const account = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  username: "smile.clinic@gmail.com",
  password: "app-password-1234",
  from_name: "Smile Dental",
  reply_to: "frontdesk@smile.test",
};

beforeAll(async () => {
  await resetDb();
  app = await buildTestApp();
  A = await setupPractice(app);
  B = await setupPractice(app);
  doctor = api(app, A.doctor.token);
  vi.spyOn(smtp, "createTransport").mockImplementation((options) => ({
    verify: async () => {
      verified.push(options);
      if (options.auth.pass === "wrong") throw Object.assign(new Error("Invalid login"), { responseCode: 535 });
      return true;
    },
    sendMail: async (mail) => {
      if (failSend) throw Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" });
      sent.push({ options, mail });
      return { messageId: "<1@test>" };
    },
  }));
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});

describe("email settings", () => {
  it("starts empty with provider presets and the server fallback", async () => {
    const s = ok(await doctor.get("/v1/email/settings"));
    expect(s.settings).toBeNull();
    expect(s.presets.find((p) => p.key === "gmail")).toMatchObject({ host: "smtp.gmail.com", port: 465, secure: true });
    expect(s.server_fallback).toEqual({ from_email: "clinic@test.dev" });
    expect((await api(app, A.staff.token).get("/v1/email/settings")).statusCode).toBe(403);
  });

  it("checks the login before saving", async () => {
    const res = await doctor.put("/v1/email/settings", { ...account, password: "wrong" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "EMAIL_SMTP_FAILED" });
    expect(res.json().message).toContain("app password");
    expect(await query(`SELECT 1 FROM email_settings`)).toHaveLength(0);
    expect((await doctor.put("/v1/email/settings", { ...account, password: undefined })).statusCode).toBe(400);
  });

  it("saves with the password encrypted and never returned", async () => {
    const s = ok(await doctor.put("/v1/email/settings", account));
    expect(s.settings).toMatchObject({ host: "smtp.gmail.com", from_email: "smile.clinic@gmail.com", from_name: "Smile Dental", has_password: true });
    expect(JSON.stringify(s)).not.toContain("app-password-1234");
    const [row] = await query(`SELECT password_encrypted FROM email_settings`);
    expect(row.password_encrypted).not.toContain("app-password-1234");
    // saving again without a password keeps the stored one
    ok(await doctor.put("/v1/email/settings", { ...account, password: "", from_name: "Smile Dental Clinic" }));
    expect(verified.at(-1).auth.pass).toBe("app-password-1234");
  });

  it("sends a test email from the practice's own account", async () => {
    const res = ok(await doctor.post("/v1/email/test", { to: "doctor@smile.test" }));
    expect(res.sent_to).toBe("doctor@smile.test");
    const last = sent.at(-1);
    expect(last.options).toMatchObject({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: "smile.clinic@gmail.com" } });
    expect(last.mail).toMatchObject({ from: '"Smile Dental Clinic" <smile.clinic@gmail.com>', replyTo: "frontdesk@smile.test", to: "doctor@smile.test" });
  });

  it("records why a test failed", async () => {
    failSend = true;
    const res = await doctor.post("/v1/email/test", { to: "doctor@smile.test" });
    failSend = false;
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("Couldn't reach the mail server");
    expect(ok(await doctor.get("/v1/email/settings")).settings.last_error).toContain("timeout");
  });

  it("uses each practice's own account, else the server's", async () => {
    const [{ practice_id: aPractice }] = await query(`SELECT practice_id FROM clinics WHERE id = :id`, { id: A.clinic.id });
    await mailer.send({ practiceId: aPractice, to: "a@x.test", subject: "s", text: "t" });
    expect(sent.at(-1).options.host).toBe("smtp.gmail.com");
    const [{ practice_id: bPractice }] = await query(`SELECT practice_id FROM clinics WHERE id = :id`, { id: B.clinic.id });
    await mailer.send({ practiceId: bPractice, to: "b@x.test", subject: "s", text: "t", fromName: "B Clinic" });
    expect(sent.at(-1).options.host).toBe("smtp.test");
    expect(sent.at(-1).mail.from).toBe('"B Clinic" <clinic@test.dev>');
    expect(ok(await api(app, B.doctor.token).get("/v1/email/settings")).settings).toBeNull();
  });

  it("removes the account and falls back to the server", async () => {
    ok(await doctor.delete("/v1/email/settings"));
    expect(ok(await doctor.get("/v1/email/settings")).settings).toBeNull();
    expect((await doctor.delete("/v1/email/settings")).statusCode).toBe(404);
  });
});
