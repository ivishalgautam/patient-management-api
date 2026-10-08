"use strict";
// Outgoing email. A practice's own SMTP settings (email_settings, set in the
// dashboard) win; otherwise the server-wide SMTP_* settings from config are
// used. `smtp.createTransport` and `mailer.send` are the seams tests stub.
import nodemailer from "nodemailer";
import config from "../config/index.js";
import { one } from "../db/sql.js";
import { decryptJson } from "./integrations/secrets.js";

export const smtp = { createTransport: (options) => nodemailer.createTransport(options) };

const serverConfigured = () => !!(config.smtp_host && config.smtp_from_email && config.smtp_password);

function serverSettings() {
  const port = Number(config.smtp_port) || 587;
  return {
    source: "server",
    transport: { host: config.smtp_host, port, secure: port === 465, auth: { user: config.smtp_from_email, pass: config.smtp_password } },
    from_email: config.smtp_from_email,
    from_name: null,
    reply_to: null,
  };
}

// Transport options for a stored settings row (or a draft being tested).
export function transportOptions({ host, port, secure, username, password }) {
  return {
    host,
    port,
    secure: !!secure,
    auth: { user: username, pass: password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  };
}

// The settings a practice sends with, or null when email isn't set up.
export async function resolveSettings(practiceId) {
  if (practiceId) {
    const row = await one(`SELECT * FROM email_settings WHERE practice_id = :practiceId AND is_active`, { practiceId });
    if (row) {
      return {
        source: "practice",
        transport: transportOptions({ ...row, password: decryptJson(row.password_encrypted)?.password }),
        from_email: row.from_email,
        from_name: row.from_name,
        reply_to: row.reply_to,
      };
    }
  }
  return serverConfigured() ? serverSettings() : null;
}

export const emailConfigured = async (practiceId) => !!(await resolveSettings(practiceId));

const fromHeader = (email, name) => (name ? `"${String(name).replace(/["\\]/g, "")}" <${email}>` : email);

export const mailer = {
  // fromName is used only when the settings don't set a sender name.
  async send({ practiceId = null, to, subject, text, fromName }) {
    const settings = await resolveSettings(practiceId);
    if (!settings) throw new Error("Email isn't set up. Add your email account in Settings › Email.");
    return smtp.createTransport(settings.transport).sendMail({
      from: fromHeader(settings.from_email, settings.from_name || fromName),
      ...(settings.reply_to ? { replyTo: settings.reply_to } : {}),
      to,
      subject,
      text,
    });
  },
};
