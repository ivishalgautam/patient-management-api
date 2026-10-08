"use strict";
// Outgoing email over the SMTP settings in config (SMTP_SERVER, SMTP_PORT,
// SMTP_EMAIL, SMTP_PASSWORD). `mailer.send` is the one seam tests stub.
import nodemailer from "nodemailer";
import config from "../config/index.js";

let transport = null;

export const emailConfigured = () => !!(config.smtp_host && config.smtp_from_email && config.smtp_password);

function getTransport() {
  if (!transport) {
    const port = Number(config.smtp_port) || 587;
    transport = nodemailer.createTransport({
      host: config.smtp_host,
      port,
      secure: port === 465,
      auth: { user: config.smtp_from_email, pass: config.smtp_password },
    });
  }
  return transport;
}

export const mailer = {
  async send({ to, subject, text, fromName }) {
    if (!emailConfigured()) throw new Error("Email isn't set up on the server (SMTP settings missing).");
    const from = fromName ? `"${fromName.replace(/"/g, "")}" <${config.smtp_from_email}>` : config.smtp_from_email;
    return getTransport().sendMail({ from, to, subject, text });
  },
};
