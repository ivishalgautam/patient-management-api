"use strict";
// Outgoing email for other modules (patient messages). Sends from the
// practice's default email account and records the message in the
// mailbox's Sent folder; falls back to the server-wide SMTP_* settings
// when the practice has no account. `mailer.send` is the seam tests stub.
import config from "../config/index.js";
import { one } from "../db/sql.js";
import { sendFromAccount, smtp } from "./email/transport.js";

export { smtp };

const serverConfigured = () => !!(config.smtp_host && config.smtp_from_email && config.smtp_password);

// The account a practice sends from: settings' default, else the marked
// default, else any connected one.
export async function defaultAccount(practiceId) {
  if (!practiceId) return null;
  return one(
    `SELECT a.* FROM email_accounts a LEFT JOIN email_settings s ON s.practice_id = a.practice_id
      WHERE a.practice_id = :practiceId AND a.status <> 'paused' AND coalesce(s.is_enabled, true)
      ORDER BY (a.id = s.default_account_id) DESC NULLS LAST, a.is_default DESC, a.created_at LIMIT 1`,
    { practiceId },
  );
}

export const emailConfigured = async (practiceId) => !!(await defaultAccount(practiceId)) || serverConfigured();

async function sendFromServer({ to, subject, text, html, fromName }) {
  const port = Number(config.smtp_port) || 587;
  const transport = smtp.createTransport({
    host: config.smtp_host,
    port,
    secure: port === 465,
    auth: { user: config.smtp_from_email, pass: config.smtp_password },
  });
  const from = fromName ? `"${fromName.replace(/["\\]/g, "")}" <${config.smtp_from_email}>` : config.smtp_from_email;
  const info = await transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
  return info?.messageId ?? null;
}

export const mailer = {
  // Returns { messageId, accountId }. patientId / leadId link the Sent copy.
  async send({ practiceId = null, to, subject, text, html, fromName, patientId = null, leadId = null }) {
    const account = await defaultAccount(practiceId);
    if (!account) {
      if (!serverConfigured()) throw new Error("Email isn't set up. Connect an email account in Email › Accounts.");
      return { messageId: await sendFromServer({ to, subject, text, html, fromName }), accountId: null };
    }
    const settings = await one(`SELECT default_from_name FROM email_settings WHERE practice_id = :practiceId`, { practiceId });
    const name = account.display_name || settings?.default_from_name || fromName;
    const messageId = await sendFromAccount(account, { fromName: name, to, subject, html, text });
    await one(
      `INSERT INTO email_messages (practice_id, account_id, direction, folder, status, from_address, from_name, to_addresses,
                                   subject, body_html, body_text, patient_id, lead_id, provider_message_id, sent_at)
       VALUES (:practiceId, :accountId, 'outbound', 'sent', 'sent', :from, :name, ARRAY[:to]::text[], :subject, :html, :text,
               :patientId, :leadId, :messageId, now()) RETURNING id`,
      { practiceId, accountId: account.id, from: account.email_address, name, to, subject, html: html ?? null, text, patientId, leadId, messageId },
    );
    return { messageId, accountId: account.id };
  },
};
