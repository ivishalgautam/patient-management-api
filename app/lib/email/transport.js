"use strict";
// SMTP (send) and IMAP (receive) connections for an email account.
// `smtp.createTransport` and `imap.connect` are the seams tests stub.
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { AppError } from "../app-error.js";
import { decryptJson } from "../integrations/secrets.js";

export const smtp = { createTransport: (options) => nodemailer.createTransport(options) };
export const imap = {
  async connect(options) {
    const client = new ImapFlow({ ...options, logger: false });
    await client.connect();
    return client;
  },
};

export const passwordOf = (account) => decryptJson(account.credentials_encrypted)?.password ?? null;
const loginOf = (account) => account.auth_user || account.email_address;

export function smtpOptions(account, password = passwordOf(account)) {
  return {
    host: account.smtp_host,
    port: account.smtp_port,
    secure: !!account.smtp_secure,
    auth: { user: loginOf(account), pass: password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  };
}

export function imapOptions(account, password = passwordOf(account)) {
  return {
    host: account.imap_host,
    port: account.imap_port,
    secure: !!account.imap_secure,
    auth: { user: loginOf(account), pass: password },
  };
}

// Turns a library error into something a receptionist can act on.
export function friendlyError(error, part = "mail server") {
  const code = error?.responseCode ?? error?.code ?? error?.authenticationFailed;
  if (code === 535 || code === "EAUTH" || error?.authenticationFailed) {
    return new AppError(400, `The ${part} rejected the email or password. For Gmail and Zoho use an app password.`, { code: "EMAIL_AUTH_FAILED" });
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ENOTFOUND", "ECONNREFUSED", "NoConnection"].includes(code)) {
    return new AppError(400, `Couldn't reach the ${part}. Check the server name, port and the SSL setting.`, { code: "EMAIL_UNREACHABLE" });
  }
  return new AppError(400, error?.message || `The ${part} refused the connection.`, { code: "EMAIL_CONNECTION_FAILED" });
}

// Logs in to SMTP (and IMAP when set) without sending anything.
export async function verifyAccount(account, password) {
  try {
    await smtp.createTransport(smtpOptions(account, password)).verify();
  } catch (error) {
    throw friendlyError(error, "outgoing (SMTP) server");
  }
  if (account.imap_host) {
    let client;
    try {
      client = await imap.connect(imapOptions(account, password));
    } catch (error) {
      throw friendlyError(error, "incoming (IMAP) server");
    } finally {
      await client?.logout().catch(() => {});
    }
  }
}

const fromHeader = (email, name) => (name ? `"${String(name).replace(/["\\]/g, "")}" <${email}>` : email);

// Sends one email from an account; returns the Message-ID.
export async function sendFromAccount(account, { fromName, to, cc, bcc, subject, html, text, inReplyTo, references }) {
  const info = await smtp.createTransport(smtpOptions(account)).sendMail({
    from: fromHeader(account.email_address, fromName ?? account.display_name),
    to,
    ...(cc?.length ? { cc } : {}),
    ...(bcc?.length ? { bcc } : {}),
    subject,
    ...(html ? { html } : {}),
    text,
    ...(inReplyTo ? { inReplyTo, references: references ?? inReplyTo } : {}),
  });
  return info?.messageId ?? null;
}
