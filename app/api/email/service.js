"use strict";
// Practice email settings: the SMTP account patient emails are sent from.
// Saving checks the login with the mail server first; the password is
// stored encrypted and never returned.
import config from "../../config/index.js";
import { one, exec } from "../../db/sql.js";
import { AppError, badRequest, notFound } from "../../lib/app-error.js";
import { decryptJson, encryptJson } from "../../lib/integrations/secrets.js";
import { mailer, smtp, transportOptions } from "../../lib/mailer.js";

// Common providers, so most practices only type their address and password.
export const PRESETS = [
  { key: "gmail", label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 465, secure: true, note: "Use an app password (Google account › Security › App passwords)." },
  { key: "outlook", label: "Outlook / Microsoft 365", host: "smtp.office365.com", port: 587, secure: false, note: "Your Microsoft 365 admin may need to allow SMTP sending." },
  { key: "zoho", label: "Zoho Mail (India)", host: "smtp.zoho.in", port: 465, secure: true, note: "Use an app-specific password if two-factor login is on." },
  { key: "hostinger", label: "Hostinger", host: "smtp.hostinger.com", port: 465, secure: true, note: null },
  { key: "godaddy", label: "GoDaddy (Microsoft 365)", host: "smtp.office365.com", port: 587, secure: false, note: null },
  { key: "other", label: "Other", host: "", port: 587, secure: false, note: "Ask your email provider for the SMTP server and port." },
];

const publicRow = (row) => {
  if (!row) return null;
  const { password_encrypted, ...rest } = row;
  return { ...rest, has_password: !!password_encrypted };
};

const smtpError = (error) => {
  const code = error?.responseCode ?? error?.code;
  const message =
    code === 535 || code === "EAUTH"
      ? "The mail server rejected the email or password. For Gmail and Zoho use an app password."
      : code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ESOCKET" || code === "ENOTFOUND"
        ? "Couldn't reach the mail server. Check the server name, port and the SSL setting."
        : error?.message || "The mail server refused the connection.";
  return new AppError(400, message, { code: "EMAIL_SMTP_FAILED" });
};

export async function getSettings(ctx) {
  const row = await one(`SELECT * FROM email_settings WHERE practice_id = :practiceId`, { practiceId: ctx.practiceId });
  return {
    settings: publicRow(row),
    presets: PRESETS,
    // The server-wide fallback (.env), shown so the practice knows emails
    // still go out if they haven't added their own account.
    server_fallback: config.smtp_host && config.smtp_from_email && config.smtp_password ? { from_email: config.smtp_from_email } : null,
  };
}

export async function saveSettings(ctx, input) {
  const existing = await one(`SELECT * FROM email_settings WHERE practice_id = :practiceId`, { practiceId: ctx.practiceId });
  const password = input.password || (existing ? decryptJson(existing.password_encrypted)?.password : null);
  if (!password) throw badRequest("Enter the email account's password.");

  // Check the login before saving, so a typo doesn't silently stop emails.
  try {
    await smtp.createTransport(transportOptions({ ...input, password })).verify();
  } catch (error) {
    throw smtpError(error);
  }

  await exec(
    `INSERT INTO email_settings (practice_id, host, port, secure, username, password_encrypted, from_email, from_name, reply_to,
                                 is_active, last_tested_at, last_error, updated_by)
     VALUES (:practiceId, :host, :port, :secure, :username, :password, :fromEmail, :fromName, :replyTo, :isActive, now(), NULL, :userId)
     ON CONFLICT (practice_id) DO UPDATE SET host = EXCLUDED.host, port = EXCLUDED.port, secure = EXCLUDED.secure,
       username = EXCLUDED.username, password_encrypted = EXCLUDED.password_encrypted, from_email = EXCLUDED.from_email,
       from_name = EXCLUDED.from_name, reply_to = EXCLUDED.reply_to, is_active = EXCLUDED.is_active,
       last_tested_at = now(), last_error = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    {
      practiceId: ctx.practiceId,
      host: input.host,
      port: input.port,
      secure: input.secure,
      username: input.username,
      password: encryptJson({ password }),
      fromEmail: input.from_email || input.username,
      fromName: input.from_name || null,
      replyTo: input.reply_to || null,
      isActive: input.is_active ?? true,
      userId: ctx.userId,
    },
  );
  return getSettings(ctx);
}

export async function removeSettings(ctx) {
  const row = await one(`DELETE FROM email_settings WHERE practice_id = :practiceId RETURNING id`, { practiceId: ctx.practiceId });
  if (!row) throw notFound("No email account is set up.");
}

export async function sendTest(ctx, { to }) {
  const practice = await one(`SELECT name FROM practices WHERE id = :practiceId`, { practiceId: ctx.practiceId });
  try {
    await mailer.send({
      practiceId: ctx.practiceId,
      to,
      subject: `Test email from ${practice?.name ?? "your clinic"}`,
      text: "This is a test email from your clinic software. If you can read this, patient emails (recalls, birthday wishes and bulk messages) will be delivered from this address.",
      fromName: practice?.name,
    });
  } catch (error) {
    await exec(`UPDATE email_settings SET last_error = left(:error, 1000), last_tested_at = now() WHERE practice_id = :practiceId`, {
      practiceId: ctx.practiceId,
      error: error?.message ?? String(error),
    });
    throw error instanceof AppError ? error : smtpError(error);
  }
  await exec(`UPDATE email_settings SET last_error = NULL, last_tested_at = now() WHERE practice_id = :practiceId`, { practiceId: ctx.practiceId });
  return { sent_to: to };
}
